import type {
  Content,
  ContentText,
  DynamicBackground,
  DynamicContent,
  TDocumentDefinitions,
} from "pdfmake/interfaces";

import type { AnchorId, Block, BookDocument, Chapter, OutlineEntry } from "@/core/document/ast";
import { collectAnchors } from "@/core/document/ast";
import type { FontLibrary } from "@/core/pdf/font-library";
import type { PageGeometry } from "@/core/pdf/page-geometry";
import { fitWithin, pageGeometry } from "@/core/pdf/page-geometry";
import { WITHOUT_LIGATURES } from "@/core/pdf/pdfmake-types";
import type { EmbeddedImage, OutlineMarker, RenderContext } from "@/core/pdf/render-blocks";
import { destinationMarker, outlineMarkersFor, renderBlocks } from "@/core/pdf/render-blocks";
import { buildStyles, MUTED_COLOR } from "@/core/pdf/styles";
import type { ConversionSettings } from "@/core/settings";

export type DefinitionInput = {
  readonly book: BookDocument;
  readonly settings: ConversionSettings;
  readonly images: ReadonlyMap<string, EmbeddedImage>;
  /** Used as the PDF title when the EPUB has none. */
  readonly fallbackTitle: string;
  /** Resolves CSS families to registered fonts and records which ones the document uses. */
  readonly fonts: FontLibrary;
};

const TOC_MAX_DEPTH = 3;
const PRODUCER = "EPUB to PDF (in-browser)";

/** Flattens the outline tree into per-anchor bookmark markers with stable parent ids. */
const indexOutline = (entries: readonly OutlineEntry[]): Map<AnchorId, OutlineMarker[]> => {
  const markers = new Map<AnchorId, OutlineMarker[]>();
  let counter = 0;
  const visit = (entry: OutlineEntry, parentId: string | undefined): void => {
    const marker: OutlineMarker = { id: `outline-${counter++}`, title: entry.title, parentId };
    markers.set(entry.anchor, [...(markers.get(entry.anchor) ?? []), marker]);
    entry.children.forEach((child) => {
      visit(child, marker.id);
    });
  };
  entries.forEach((entry) => {
    visit(entry, undefined);
  });
  return markers;
};

const flattenOutline = (
  entries: readonly OutlineEntry[],
  depth = 0,
): { readonly entry: OutlineEntry; readonly depth: number }[] =>
  depth >= TOC_MAX_DEPTH
    ? []
    : entries.flatMap((entry) => [{ entry, depth }, ...flattenOutline(entry.children, depth + 1)]);

const renderTableOfContents = (
  outline: readonly OutlineEntry[],
  baseFontSize: number,
): Content[] => [
  { text: "Contents", style: "tocTitle" },
  {
    table: {
      widths: ["*", "auto"],
      body: flattenOutline(outline).map(({ entry, depth }) => [
        {
          text: entry.title,
          linkToDestination: entry.anchor,
          style: "tocEntry",
          bold: depth === 0,
          margin: [depth * baseFontSize * 1.2, 0, 0, 0],
        },
        { pageReference: entry.anchor, style: "tocEntry", alignment: "right", color: MUTED_COLOR },
      ]),
    },
    layout: "noBorders",
  },
];

/** The cover is painted as a full-bleed page background on page 1. */
const coverBackground = (cover: EmbeddedImage, geometry: PageGeometry): DynamicBackground => {
  const size = fitWithin(
    { width: cover.width, height: cover.height },
    { width: geometry.width, height: geometry.height },
    true,
  );
  return (currentPage) =>
    currentPage === 1
      ? {
          image: cover.key,
          width: size.width,
          height: size.height,
          margin: [(geometry.width - size.width) / 2, (geometry.height - size.height) / 2, 0, 0],
        }
      : null;
};

const pageNumberFooter =
  (hasCover: boolean, baseFontSize: number, geometry: PageGeometry): DynamicContent =>
  (currentPage) =>
    hasCover && currentPage === 1
      ? null
      : {
          text: String(currentPage),
          alignment: "center",
          fontSize: baseFontSize * 0.8,
          color: MUTED_COLOR,
          margin: [0, Math.max(6, geometry.margins[3] / 2 - baseFontSize * 0.5), 0, 0],
        };

/** A chapter already starts on a fresh page or after a section; a CSS break there would add a blank page. */
const withoutLeadingBreak = (blocks: readonly Block[]): readonly Block[] => {
  const [first, ...rest] = blocks;
  return first?.style.pageBreakBefore === true
    ? [{ ...first, style: { ...first.style, pageBreakBefore: false } }, ...rest]
    : blocks;
};

const renderChapter = (chapter: Chapter, context: RenderContext): Content[] => [
  ...outlineMarkersFor(chapter.anchor, context),
  destinationMarker(chapter.anchor),
  ...renderBlocks(withoutLeadingBreak(chapter.blocks), context),
];

type Section = { readonly kind: "cover" | "toc" | "chapter"; readonly content: readonly Content[] };

/** Joins sections, inserting page breaks between them where the settings call for it. */
const joinSections = (sections: readonly Section[], chapterPageBreaks: boolean): Content[] =>
  sections.flatMap((section, index) => {
    const previous = sections[index - 1];
    const breakBefore =
      previous !== undefined &&
      (section.kind !== "chapter" || previous.kind !== "chapter" || chapterPageBreaks);
    const pageBreak: ContentText = { text: "", pageBreak: "before", fontSize: 1, lineHeight: 0.01 };
    return breakBefore ? [pageBreak, ...section.content] : [...section.content];
  });

export const buildDocumentDefinition = ({
  book,
  settings,
  images,
  fallbackTitle,
  fonts,
}: DefinitionInput): TDocumentDefinitions => {
  const geometry = pageGeometry(settings);
  const base = settings.fontSizePt;
  const context: RenderContext = {
    mode: settings.layout,
    baseFontSize: base,
    lineHeight: settings.lineHeight,
    textAlign: settings.textAlign,
    fonts,
    geometry,
    images,
    destinations: new Set(
      book.chapters.flatMap((chapter) => [chapter.anchor, ...collectAnchors(chapter.blocks)]),
    ),
    outline: indexOutline(book.outline),
  };

  const cover =
    settings.includeCover && book.coverPath !== undefined ? images.get(book.coverPath) : undefined;
  const showToc = settings.includeToc && book.outline.length > 1;

  const sections: Section[] = [
    ...(cover === undefined ? [] : [{ kind: "cover" as const, content: [{ text: "" }] }]),
    ...(showToc
      ? [{ kind: "toc" as const, content: renderTableOfContents(book.outline, base) }]
      : []),
    ...book.chapters.map((chapter) => ({
      kind: "chapter" as const,
      content: renderChapter(chapter, context),
    })),
  ];

  const { metadata } = book;
  return {
    info: {
      title: metadata.title ?? fallbackTitle,
      ...(metadata.authors.length > 0 ? { author: metadata.authors.join(", ") } : {}),
      ...(metadata.subjects.length > 0 ? { keywords: metadata.subjects.join(", ") } : {}),
      creator: PRODUCER,
      producer: PRODUCER,
    },
    ...(metadata.language === undefined ? {} : { language: metadata.language }),
    displayTitle: true,
    pageSize: { width: geometry.width, height: geometry.height },
    pageMargins: [...geometry.margins],
    defaultStyle: {
      font: fonts.resolve([settings.fontFamily === "sans" ? "sans-serif" : "serif"]),
      fontSize: base,
      lineHeight: settings.lineHeight,
      fontFeatures: WITHOUT_LIGATURES,
    },
    styles: buildStyles(settings),
    // pdfmake resolves image names through this dictionary into its virtual file system.
    images: Object.fromEntries([...images.values()].map((image) => [image.key, image.key])),
    content: joinSections(sections, settings.chapterPageBreaks),
    ...(cover === undefined ? {} : { background: coverBackground(cover, geometry) }),
    ...(settings.pageNumbers
      ? { footer: pageNumberFooter(cover !== undefined, base, geometry) }
      : {}),
  };
};
