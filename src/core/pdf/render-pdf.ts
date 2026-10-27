import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

import { ConversionError } from "@/core/errors";
import type { FontFamilyFiles } from "@/core/pdf/font-library";
import { FONT_VARIANTS } from "@/core/pdf/fonts";
import type { VirtualFile } from "@/core/pdf/pdfmake-runtime";
import { getPdfMake } from "@/core/pdf/pdfmake-runtime";

export type RenderInput = {
  readonly definition: TDocumentDefinitions;
  /** Every font family the definition references, by registered name. */
  readonly fonts: ReadonlyMap<string, FontFamilyFiles>;
  /** Binary assets (images) keyed by the names used in the definition. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly onProgress?: (fraction: number) => void;
};

const loadFonts = async (
  fonts: ReadonlyMap<string, FontFamilyFiles>,
): Promise<{ readonly files: Map<string, Uint8Array>; readonly dictionary: TFontDictionary }> => {
  const files = new Map<string, Uint8Array>();
  const dictionary: TFontDictionary = {};
  await Promise.all(
    [...fonts].map(async ([name, family]) => {
      const variants = await Promise.all(
        FONT_VARIANTS.map(async (variant) => {
          const key = `fonts/${name}-${variant}`;
          files.set(key, await family[variant]());
          return [variant, key] as const;
        }),
      );
      dictionary[name] = Object.fromEntries(variants);
    }),
  );
  return { files, dictionary };
};

/** Lays out and serialises the document to PDF bytes. */
export const renderPdf = async ({
  definition,
  fonts,
  files,
  onProgress,
}: RenderInput): Promise<Uint8Array> => {
  const pdfMake = getPdfMake();
  const loaded = await loadFonts(fonts);

  const vfs: Record<string, VirtualFile> = {};
  for (const [key, data] of [...loaded.files, ...files]) {
    vfs[key] = { data };
  }
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts(loaded.dictionary);
  pdfMake.setProgressCallback((progress) => onProgress?.(progress));

  try {
    return await pdfMake.createPdf(definition).getBuffer();
  } catch (error) {
    throw new ConversionError("render-failed", "The PDF could not be generated from this book.", {
      cause: error,
    });
  }
};
