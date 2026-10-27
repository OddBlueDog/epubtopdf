import type { AnchorRegistry } from "@/core/document/anchors";
import { claimAnchors, createAnchorRegistry } from "@/core/document/anchors";
import type { BookDocument, Chapter, OutlineEntry } from "@/core/document/ast";
import { createBookStyles } from "@/core/document/book-styles";
import { xhtmlToBlocks } from "@/core/document/xhtml-to-blocks";
import type { EpubBook } from "@/core/epub/load-epub";
import type { TocEntry } from "@/core/epub/toc";
import { ConversionError } from "@/core/errors";
import { byLocalName, findFirst, parseXhtml } from "@/core/xml/dom";

export type BuildOptions = {
  readonly includeImages: boolean;
  /** The user's base text size in points: CSS `medium`, and what relative sizes scale from. */
  readonly baseFontSize: number;
  /** Generic family for text whose font the book leaves unspecified. */
  readonly defaultFontFamily: "serif" | "sans-serif";
  readonly onProgress?: (fraction: number) => void;
};

const CONTENT_TYPES = new Set(["application/xhtml+xml", "text/html", "application/html"]);

/** Linear spine items in reading order, followed by auxiliary (non-linear) ones. */
const readingOrder = (book: EpubBook): readonly string[] => {
  const content = book.pkg.spine.filter(
    (entry) =>
      CONTENT_TYPES.has(entry.item.mediaType) &&
      // A non-linear navigation document only duplicates the generated contents page.
      !(entry.item === book.pkg.nav && !entry.linear),
  );
  return [
    ...content.filter((entry) => entry.linear),
    ...content.filter((entry) => !entry.linear),
  ].map((entry) => entry.item.path);
};

const resolveOutline = (entries: readonly TocEntry[], registry: AnchorRegistry): OutlineEntry[] =>
  entries.flatMap((entry): OutlineEntry[] => {
    const children = resolveOutline(entry.children, registry);
    const anchor = entry.target === undefined ? undefined : registry.resolve(entry.target);
    // A TOC entry pointing at a fragment that was never emitted falls back to its file.
    const fallback =
      entry.target === undefined
        ? undefined
        : registry.resolve({ path: entry.target.path, fragment: undefined });
    const usable = [anchor, fallback].find(
      (candidate) => candidate !== undefined && registry.isDefined(candidate),
    );
    return usable === undefined ? children : [{ title: entry.title, anchor: usable, children }];
  });

/** When a book ships without a usable TOC, derive one from each chapter's first heading. */
const outlineFromHeadings = (chapters: readonly Chapter[]): OutlineEntry[] =>
  chapters.flatMap((chapter): OutlineEntry[] => {
    const heading = chapter.blocks.find((block) => block.kind === "heading");
    const title = heading?.content
      .map((run) => run.text)
      .join("")
      .trim();
    return title === undefined || title === ""
      ? []
      : [{ title, anchor: chapter.anchor, children: [] }];
  });

const isCoverOnly = (chapter: Chapter, coverPath: string | undefined): boolean =>
  coverPath !== undefined &&
  chapter.blocks.length > 0 &&
  chapter.blocks.every((block) => block.kind === "image" && block.path === coverPath);

export const buildBookDocument = (book: EpubBook, options: BuildOptions): BookDocument => {
  const { archive, pkg } = book;
  const paths = readingOrder(book);
  if (paths.length === 0) {
    throw new ConversionError("empty-book", "This EPUB has no readable content documents.");
  }
  const registry = createAnchorRegistry(paths);
  const styles = createBookStyles(archive, {
    rootFontSize: options.baseFontSize,
    defaultFontFamily: options.defaultFontFamily,
  });
  const coverPath = pkg.cover?.path;
  const chapters: Chapter[] = [];

  paths.forEach((path, index) => {
    options.onProgress?.(index / paths.length);
    const source = archive.text(path);
    const anchor = registry.forFile(path);
    if (source === undefined || anchor === undefined) {
      return;
    }
    const document = parseXhtml(source);
    const body = findFirst(document, byLocalName("body"));
    if (body === undefined) {
      return;
    }
    const documentStyles = styles.forDocument(document, path);
    const blocks = xhtmlToBlocks(body, documentStyles.bodyStyle(body), {
      path,
      archive,
      resolveStyle: documentStyles.resolve,
      anchors: registry,
      includeImages: options.includeImages,
    });
    const chapter: Chapter = { path, anchor, blocks };
    // Skip empty documents and standalone cover pages (the cover is rendered separately).
    if (blocks.length === 0 || (index < 2 && isCoverOnly(chapter, coverPath))) {
      return;
    }
    registry.claim(anchor);
    chapters.push({ ...chapter, blocks: claimAnchors(blocks, registry) });
  });

  if (chapters.length === 0) {
    throw new ConversionError(
      "empty-book",
      "This EPUB does not contain any text or images to convert.",
    );
  }
  options.onProgress?.(1);

  const outline = resolveOutline(book.toc, registry);
  return {
    metadata: {
      title: pkg.metadata.title,
      authors: pkg.metadata.creators,
      language: pkg.metadata.language,
      publisher: pkg.metadata.publisher,
      subjects: pkg.metadata.subjects,
    },
    fontFaces: styles.fontFaces(),
    pageMargins: styles.pageMargins(),
    chapters,
    outline: outline.length > 0 ? outline : outlineFromHeadings(chapters),
    coverPath: coverPath !== undefined && archive.has(coverPath) ? coverPath : undefined,
  };
};
