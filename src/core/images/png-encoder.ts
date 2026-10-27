/**
 * Minimal synchronous PNG encoder for opaque 8-bit RGB images.
 *
 * Canvas `convertToBlob("image/png")` always produces RGBA. PDF writers must split the alpha
 * channel out of such files, and pdfkit does that with an *asynchronous* inflate that spawns a
 * `blob:` Worker — which our CSP forbids. RGB PNGs embed directly without being decoded.
 */
import { zlibSync } from "fflate";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const COLOR_TYPE_RGB = 2;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(new TextEncoder().encode(type), 4);
  output.set(data, 8);
  view.setUint32(8 + data.length, crc32(output.subarray(4, 8 + data.length)));
  return output;
};

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

/**
 * Encodes RGBA pixels (e.g. from `getImageData`) as an RGB PNG. Alpha is discarded, so the
 * caller should composite onto an opaque background first.
 */
export const encodeRgbPng = (
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array => {
  if (rgba.length !== width * height * 4) {
    throw new RangeError(`Expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  }
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    // Filter type 0 (None) — zlib does the heavy lifting.
    let target = y * stride + 1;
    let source = y * width * 4;
    for (let x = 0; x < width; x++) {
      raw[target++] = rgba[source] ?? 0;
      raw[target++] = rgba[source + 1] ?? 0;
      raw[target++] = rgba[source + 2] ?? 0;
      source += 4;
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, COLOR_TYPE_RGB, 0, 0, 0], 8);

  return concat([
    Uint8Array.from(SIGNATURE),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array()),
  ]);
};
