import type { EmbeddedFontFace } from "@/core/document/ast";
import type { EpubArchive } from "@/core/epub/archive";
import type { ObfuscationAlgorithm } from "@/core/epub/font-obfuscation";
import { deobfuscate } from "@/core/epub/font-obfuscation";
import type { EpubMetadata } from "@/core/epub/package";
import type { FontFamilyFiles } from "@/core/pdf/font-library";
import type { FontVariant } from "@/core/pdf/fonts";

const FONT_SIGNATURES: readonly (readonly number[])[] = [
  [0x00, 0x01, 0x00, 0x00], // TrueType
  [0x74, 0x72, 0x75, 0x65], // "true"
  [0x4f, 0x54, 0x54, 0x4f], // "OTTO" (CFF)
  [0x77, 0x4f, 0x46, 0x46], // "wOFF"
  [0x77, 0x4f, 0x46, 0x32], // "wOF2"
  [0x74, 0x74, 0x63, 0x66], // "ttcf"
];

/** A font file our PDF writer can read (after any de-obfuscation). */
export const isSupportedFont = (bytes: Uint8Array): boolean =>
  FONT_SIGNATURES.some((signature) => signature.every((byte, index) => bytes[index] === byte));

const variantOf = (face: EmbeddedFontFace): FontVariant => {
  const bold = face.weight >= 600;
  if (face.italic) {
    return bold ? "bolditalics" : "italics";
  }
  return bold ? "bold" : "normal";
};

/** Ideal weight per variant, to pick the best face when several map to one variant. */
const TARGET_WEIGHT: Readonly<Record<FontVariant, number>> = {
  normal: 400,
  bold: 700,
  italics: 400,
  bolditalics: 700,
};

type LoadedFace = { readonly face: EmbeddedFontFace; readonly bytes: Uint8Array };

const constant = (bytes: Uint8Array) => (): Promise<Uint8Array> => Promise.resolve(bytes);

/** Fills missing variants from the closest available one, as a browser would synthesise. */
const completeFamily = (
  faces: ReadonlyMap<FontVariant, Uint8Array>,
): FontFamilyFiles | undefined => {
  const normal =
    faces.get("normal") ?? faces.get("italics") ?? faces.get("bold") ?? faces.get("bolditalics");
  if (normal === undefined) {
    return undefined;
  }
  const bold = faces.get("bold") ?? normal;
  const italics = faces.get("italics") ?? normal;
  const bolditalics = faces.get("bolditalics") ?? faces.get("bold") ?? italics;
  return {
    normal: constant(normal),
    bold: constant(bold),
    italics: constant(italics),
    bolditalics: constant(bolditalics),
  };
};

/**
 * Reads, de-obfuscates and validates every `@font-face` the book declares, grouped into
 * families. Faces that are missing, unreadable or in an unsupported format are dropped, so
 * text using them falls back to a bundled typeface instead of failing.
 */
export const loadBookFonts = async (
  archive: EpubArchive,
  faces: readonly EmbeddedFontFace[],
  obfuscated: ReadonlyMap<string, ObfuscationAlgorithm>,
  metadata: Pick<EpubMetadata, "identifiers" | "uniqueIdentifier">,
): Promise<ReadonlyMap<string, FontFamilyFiles>> => {
  const loaded = await Promise.all(
    faces.map(async (face): Promise<LoadedFace | undefined> => {
      const raw = archive.bytes(face.path);
      if (raw === undefined) {
        return undefined;
      }
      const algorithm = obfuscated.get(face.path);
      const bytes = algorithm === undefined ? raw : await deobfuscate(raw, algorithm, metadata);
      return isSupportedFont(bytes) ? { face, bytes } : undefined;
    }),
  );

  const byFamily = new Map<string, Map<FontVariant, LoadedFace>>();
  for (const entry of loaded) {
    if (entry === undefined) {
      continue;
    }
    const variants = byFamily.get(entry.face.family) ?? new Map<FontVariant, LoadedFace>();
    const variant = variantOf(entry.face);
    const current = variants.get(variant);
    const distance = (face: EmbeddedFontFace): number =>
      Math.abs(face.weight - TARGET_WEIGHT[variant]);
    if (current === undefined || distance(entry.face) < distance(current.face)) {
      variants.set(variant, entry);
    }
    byFamily.set(entry.face.family, variants);
  }

  const families = new Map<string, FontFamilyFiles>();
  for (const [family, variants] of byFamily) {
    const files = completeFamily(
      new Map([...variants].map(([variant, { bytes }]) => [variant, bytes])),
    );
    if (files !== undefined) {
      families.set(family, files);
    }
  }
  return families;
};
