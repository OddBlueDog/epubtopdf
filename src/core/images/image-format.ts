/** Content sniffing for image bytes — EPUB media types are frequently wrong. */

export type ImageFormat = "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "unknown";

export type ImageDimensions = {
  readonly width: number;
  readonly height: number;
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte);

export const sniffImageFormat = (bytes: Uint8Array): ImageFormat => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return "gif";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  if (startsWith(bytes, [0x42, 0x4d])) {
    return "bmp";
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))
    ? "svg"
    : "unknown";
};

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);

const readUint16 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset);

export type PngInfo = ImageDimensions & {
  readonly bitDepth: number;
  /** 0 gray, 2 RGB, 3 palette, 4 gray+alpha, 6 RGBA. */
  readonly colorType: number;
  readonly interlaced: boolean;
  /** Has a `tRNS` chunk (transparency without an alpha channel). */
  readonly hasTransparencyChunk: boolean;
};

const PNG_HEADER_LENGTH = 33;

const chunkType = (bytes: Uint8Array, offset: number): string =>
  String.fromCodePoint(...bytes.subarray(offset, offset + 4));

/** Scans chunk headers up to the first IDAT, looking for `tRNS`. */
const hasTrnsBeforeData = (bytes: Uint8Array): boolean => {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const type = chunkType(bytes, offset + 4);
    if (type === "tRNS") {
      return true;
    }
    if (type === "IDAT" || type === "IEND") {
      return false;
    }
    offset += 12 + readUint32(bytes, offset);
  }
  return false;
};

/** PNG: IHDR is always the first chunk. */
export const pngInfo = (bytes: Uint8Array): PngInfo | undefined =>
  bytes.length < PNG_HEADER_LENGTH
    ? undefined
    : {
        width: readUint32(bytes, 16),
        height: readUint32(bytes, 20),
        bitDepth: bytes[24] ?? 0,
        colorType: bytes[25] ?? 0,
        interlaced: bytes[28] === 1,
        hasTransparencyChunk: hasTrnsBeforeData(bytes),
      };

const DIRECTLY_EMBEDDABLE_COLOR_TYPES: ReadonlySet<number> = new Set([0, 2, 3]);

/**
 * Whether a PDF writer can embed this PNG's compressed data as-is. Anything with alpha or
 * transparency must be decoded first, which pdfkit does via an async, Worker-spawning inflate.
 */
export const isDirectlyEmbeddablePng = (info: PngInfo): boolean =>
  !info.interlaced &&
  !info.hasTransparencyChunk &&
  info.bitDepth <= 8 &&
  DIRECTLY_EMBEDDABLE_COLOR_TYPES.has(info.colorType);

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** JPEG: walk marker segments until a start-of-frame segment. */
export const jpegDimensions = (bytes: Uint8Array): ImageDimensions | undefined => {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      return { height: readUint16(bytes, offset + 5), width: readUint16(bytes, offset + 7) };
    }
    offset += 2 + readUint16(bytes, offset + 2);
  }
  return undefined;
};
