import type { EpubArchive } from "@/core/epub/archive";
import type { ImageDimensions, ImageFormat } from "@/core/images/image-format";
import {
  isDirectlyEmbeddablePng,
  jpegDimensions,
  pngInfo,
  sniffImageFormat,
} from "@/core/images/image-format";
import { encodeRgbPng } from "@/core/images/png-encoder";
import type { ImageQualityProfile } from "@/core/settings";

/** An image ready for embedding: always JPEG or PNG, which every PDF writer supports. */
export type PreparedImage = ImageDimensions & {
  readonly bytes: Uint8Array;
};

export type PreparedImages = ReadonlyMap<string, PreparedImage>;

const MAX_CANVAS_EDGE = 8192;
const CONCURRENCY = 4;

const passThroughDimensions = (
  format: ImageFormat,
  bytes: Uint8Array,
): ImageDimensions | undefined => {
  if (format === "jpeg") {
    return jpegDimensions(bytes);
  }
  if (format === "png") {
    const info = pngInfo(bytes);
    return info !== undefined && isDirectlyEmbeddablePng(info)
      ? { width: info.width, height: info.height }
      : undefined;
  }
  return undefined;
};

const fitsWithin = (dimensions: ImageDimensions, maxDimension: number | undefined): boolean =>
  maxDimension === undefined || Math.max(dimensions.width, dimensions.height) <= maxDimension;

const reencode = async (
  bytes: Uint8Array,
  format: ImageFormat,
  profile: ImageQualityProfile,
): Promise<PreparedImage> => {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const limit = Math.min(profile.maxDimension ?? MAX_CANVAS_EDGE, MAX_CANVAS_EDGE);
    const scale = Math.min(1, limit / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("2D canvas is unavailable");
    }
    // Paper is white: flatten transparency onto it.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const asJpeg = profile.jpegQuality !== undefined || format === "jpeg" || format === "webp";
    if (!asJpeg) {
      // Lossless sources stay lossless, as an opaque RGB PNG (see png-encoder.ts for why).
      return {
        bytes: encodeRgbPng(width, height, context.getImageData(0, 0, width, height).data),
        width,
        height,
      };
    }
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: profile.jpegQuality ?? 0.88,
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
};

const prepareImage = (
  bytes: Uint8Array,
  profile: ImageQualityProfile,
): Promise<PreparedImage | undefined> => {
  const format = sniffImageFormat(bytes);
  if (format === "svg" || format === "unknown") {
    return Promise.resolve(undefined);
  }
  const dimensions = passThroughDimensions(format, bytes);
  if (
    dimensions !== undefined &&
    profile.jpegQuality === undefined &&
    fitsWithin(dimensions, profile.maxDimension)
  ) {
    return Promise.resolve({ bytes, ...dimensions });
  }
  return reencode(bytes, format, profile);
};

/**
 * Normalises every referenced image (format, size, transparency) in parallel.
 * Images that cannot be decoded are skipped rather than failing the whole book.
 */
export const prepareImages = async (
  archive: EpubArchive,
  paths: ReadonlySet<string>,
  profile: ImageQualityProfile,
  onProgress?: (fraction: number) => void,
): Promise<PreparedImages> => {
  const prepared = new Map<string, PreparedImage>();
  const queue = [...paths];
  const total = queue.length;
  let completed = 0;

  const worker = async (): Promise<void> => {
    for (let path = queue.pop(); path !== undefined; path = queue.pop()) {
      const bytes = archive.bytes(path);
      try {
        // A small worker pool: each worker awaits its images sequentially by design.
        // oxlint-disable-next-line no-await-in-loop
        const image = bytes === undefined ? undefined : await prepareImage(bytes, profile);
        if (image !== undefined) {
          prepared.set(path, image);
        }
      } catch (error) {
        console.warn(`Skipping unreadable image "${path}"`, error);
      }
      completed += 1;
      onProgress?.(completed / total);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  return prepared;
};
