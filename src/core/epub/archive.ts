import { strFromU8, unzipSync } from "fflate";

import { ConversionError } from "@/core/errors";

/** Read-only view over the files of an unzipped EPUB. */
export type EpubArchive = {
  readonly has: (path: string) => boolean;
  readonly bytes: (path: string) => Uint8Array | undefined;
  readonly text: (path: string) => string | undefined;
};

/** Defensive limits against zip bombs and absurd archives. */
const MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRY_COUNT = 20_000;

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;

const hasZipSignature = (data: Uint8Array): boolean =>
  ZIP_SIGNATURE.every((byte, index) => data[index] === byte);

const decodeText = (bytes: Uint8Array): string => {
  // Strip a UTF-8 BOM; EPUB content is required to be UTF-8 or UTF-16.
  const isUtf16 =
    (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (isUtf16) {
    return new TextDecoder(bytes[0] === 0xff ? "utf-16le" : "utf-16be").decode(bytes);
  }
  const text = strFromU8(bytes);
  return text.startsWith("﻿") ? text.slice(1) : text;
};

export const openArchive = (data: Uint8Array): EpubArchive => {
  if (!hasZipSignature(data)) {
    throw new ConversionError("invalid-archive", "This file is not a valid EPUB (ZIP) archive.");
  }

  let totalBytes = 0;
  let entryCount = 0;
  let files: Readonly<Record<string, Uint8Array>>;
  try {
    files = unzipSync(data, {
      filter: (entry) => {
        entryCount += 1;
        totalBytes += entry.originalSize;
        if (entryCount > MAX_ENTRY_COUNT || totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
          throw new ConversionError("archive-too-large", "This EPUB expands to an unsafe size.");
        }
        return !entry.name.endsWith("/");
      },
    });
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }
    throw new ConversionError("invalid-archive", "The EPUB archive could not be read.", {
      cause: error,
    });
  }

  const exact = new Map(Object.entries(files));
  // Many EPUBs reference files with the wrong letter case; fall back to a case-insensitive match.
  const caseInsensitive = new Map([...exact].map(([path, bytes]) => [path.toLowerCase(), bytes]));
  const textCache = new Map<string, string>();

  const bytes = (path: string): Uint8Array | undefined =>
    exact.get(path) ?? caseInsensitive.get(path.toLowerCase());

  return {
    has: (path) => bytes(path) !== undefined,
    bytes,
    text: (path) => {
      const cached = textCache.get(path);
      if (cached !== undefined) {
        return cached;
      }
      const raw = bytes(path);
      if (raw === undefined) {
        return undefined;
      }
      const text = decodeText(raw);
      textCache.set(path, text);
      return text;
    },
  };
};
