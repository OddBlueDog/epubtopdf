import { collectImagePaths } from "@/core/document/ast";
import { buildBookDocument } from "@/core/document/build-book";
import { readObfuscatedResources } from "@/core/epub/font-obfuscation";
import { loadEpub } from "@/core/epub/load-epub";
import { prepareImages } from "@/core/images/prepare-images";
import { loadBookFonts } from "@/core/pdf/book-fonts";
import { buildDocumentDefinition } from "@/core/pdf/document-definition";
import type { FontFamilyFiles } from "@/core/pdf/font-library";
import { createFontLibrary } from "@/core/pdf/font-library";
import type { FontLoader } from "@/core/pdf/fonts";
import type { EmbeddedImage } from "@/core/pdf/render-blocks";
import { renderPdf } from "@/core/pdf/render-pdf";
import type { ConversionSettings } from "@/core/settings";
import { IMAGE_QUALITIES } from "@/core/settings";

export type ConversionStage = "reading" | "parsing" | "images" | "rendering";

export type ConversionProgress = {
  readonly stage: ConversionStage;
  /** Overall progress across all stages, 0–1. */
  readonly fraction: number;
};

export type ConversionInput = {
  readonly epub: Uint8Array;
  readonly fileName: string;
  readonly settings: ConversionSettings;
  readonly loadFont: FontLoader;
  readonly onProgress?: (progress: ConversionProgress) => void;
};

export type ConversionOutput = {
  /** Backed by its own exact-size ArrayBuffer, so it can be transferred. */
  readonly pdf: Uint8Array<ArrayBuffer>;
  readonly title: string | undefined;
  readonly authors: readonly string[];
};

/** Share of the overall progress bar allotted to each stage. */
const STAGE_SPANS: Readonly<Record<ConversionStage, readonly [start: number, end: number]>> = {
  reading: [0, 0.05],
  parsing: [0.05, 0.25],
  images: [0.25, 0.45],
  rendering: [0.45, 1],
};

const stageReporter =
  (onProgress: ConversionInput["onProgress"], stage: ConversionStage) =>
  (fraction: number): void => {
    const [start, end] = STAGE_SPANS[stage];
    onProgress?.({ stage, fraction: start + (end - start) * Math.min(1, Math.max(0, fraction)) });
  };

const baseName = (fileName: string): string => fileName.replace(/\.epub$/iu, "");

/**
 * The whole pipeline, as a composition of independent stages:
 * unzip → parse package → XHTML to book AST → normalise images → PDF definition → render.
 */
export const convertEpubToPdf = async ({
  epub,
  fileName,
  settings,
  loadFont,
  onProgress,
}: ConversionInput): Promise<ConversionOutput> => {
  stageReporter(onProgress, "reading")(0);
  const epubBook = loadEpub(epub);

  const book = buildBookDocument(epubBook, {
    includeImages: settings.includeImages,
    baseFontSize: settings.fontSizePt,
    defaultFontFamily: settings.fontFamily === "sans" ? "sans-serif" : "serif",
    onProgress: stageReporter(onProgress, "parsing"),
  });

  const imagePaths = settings.includeImages
    ? new Set(book.chapters.flatMap((chapter) => [...collectImagePaths(chapter.blocks)]))
    : new Set<string>();
  if (settings.includeCover && book.coverPath !== undefined) {
    imagePaths.add(book.coverPath);
  }
  const prepared = await prepareImages(
    epubBook.archive,
    imagePaths,
    IMAGE_QUALITIES[settings.imageQuality],
    stageReporter(onProgress, "images"),
  );

  const images = new Map<string, EmbeddedImage>();
  const files = new Map<string, Uint8Array>();
  [...prepared].forEach(([path, image], index) => {
    const key = `images/${index}`;
    images.set(path, { key, width: image.width, height: image.height });
    files.set(key, image.bytes);
  });

  const bookFonts =
    settings.layout === "publisher"
      ? await loadBookFonts(
          epubBook.archive,
          book.fontFaces,
          readObfuscatedResources(epubBook.archive),
          epubBook.pkg.metadata,
        )
      : new Map<string, FontFamilyFiles>();

  const render = (embeddedFonts: ReadonlyMap<string, FontFamilyFiles>): Promise<Uint8Array> => {
    const fonts = createFontLibrary({
      loadBuiltin: loadFont,
      bookFonts: embeddedFonts,
      mode: settings.layout,
      defaultFamily: settings.fontFamily,
    });
    const definition = buildDocumentDefinition({
      book,
      settings,
      images,
      fonts,
      fallbackTitle: baseName(fileName),
    });
    return renderPdf({
      definition,
      fonts: fonts.used(),
      files,
      onProgress: stageReporter(onProgress, "rendering"),
    });
  };

  let pdf: Uint8Array;
  try {
    pdf = await render(bookFonts);
  } catch (error) {
    if (bookFonts.size === 0) {
      throw error;
    }
    // A malformed embedded font must not cost the user their book: retry with bundled typefaces.
    console.warn("Embedded fonts could not be used; falling back to bundled fonts", error);
    pdf = await render(new Map());
  }

  return { pdf: new Uint8Array(pdf), title: book.metadata.title, authors: book.metadata.authors };
};
