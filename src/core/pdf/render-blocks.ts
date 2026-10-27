import type {
  Content,
  ContentText,
  CustomTableLayout,
  Margins,
  Style,
  TableCell,
} from "pdfmake/interfaces";

import type {
  AnchorId,
  Block,
  BlockStyle,
  CodeBlock,
  HeadingBlock,
  ImageBlock,
  LinkTarget,
  ListBlock,
  ListStyle,
  ParagraphBlock,
  TableBlock,
  TextAlign,
  TextRun,
} from "@/core/document/ast";
import type { FontLibrary } from "@/core/pdf/font-library";
import type { PageGeometry } from "@/core/pdf/page-geometry";
import { fitWithin } from "@/core/pdf/page-geometry";
import type { TextNode } from "@/core/pdf/pdfmake-types";
import type { StyleName } from "@/core/pdf/styles";
import { CODE_BACKGROUND, fontSizeFor, RULE_COLOR } from "@/core/pdf/styles";

/** An image already registered with the renderer under `key`. */
export type EmbeddedImage = {
  readonly key: string;
  readonly width: number;
  readonly height: number;
};

export type OutlineMarker = {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | undefined;
};

export type RenderContext = {
  /** `publisher` renders the book's computed CSS; `custom` applies the user's typography. */
  readonly mode: "publisher" | "custom";
  readonly baseFontSize: number;
  /** Line height used where the book specifies none (publisher) or everywhere (custom). */
  readonly lineHeight: number;
  /** Alignment used where the book specifies none (publisher) or everywhere (custom). */
  readonly textAlign: TextAlign;
  readonly geometry: PageGeometry;
  readonly fonts: FontLibrary;
  readonly images: ReadonlyMap<string, EmbeddedImage>;
  /** Anchors that exist in the document, i.e. valid internal-link targets. */
  readonly destinations: ReadonlySet<AnchorId>;
  /** Bookmarks to emit at each anchor. */
  readonly outline: ReadonlyMap<AnchorId, readonly OutlineMarker[]>;
};

/** Position within the block tree: the inset already applied by enclosing lists. */
type Frame = { readonly offset: number };

const ROOT_FRAME: Frame = { offset: 0 };

/** CSS pixels → PDF points. */
const PX_TO_PT = 0.75;
/** Leave a little room so a full-page image never forces an empty page. */
const MAX_IMAGE_PAGE_FRACTION = 0.92;
/** Horizontal space pdfmake reserves for a list marker, as a multiple of the font size. */
const LIST_MARKER_GUTTER = 1.4;

// ---------------------------------------------------------------------------
// Invisible markers: zero-height lines carrying a destination id and/or a bookmark.
// ---------------------------------------------------------------------------

const MARKER_STYLE = { fontSize: 1, lineHeight: 0.01 } as const;

export const destinationMarker = (id: string): TextNode => ({ text: "", id, ...MARKER_STYLE });

const outlineMarker = (marker: OutlineMarker): TextNode => ({
  text: "",
  id: marker.id,
  outline: true,
  outlineText: marker.title,
  ...(marker.parentId === undefined ? {} : { outlineParentId: marker.parentId }),
  ...MARKER_STYLE,
});

export const outlineMarkersFor = (anchor: AnchorId, context: RenderContext): TextNode[] =>
  (context.outline.get(anchor) ?? []).map((marker) => outlineMarker(marker));

// ---------------------------------------------------------------------------
// Inline text
// ---------------------------------------------------------------------------

const linkProps = (link: LinkTarget | undefined, context: RenderContext): Partial<ContentText> => {
  if (link === undefined) {
    return {};
  }
  if (link.kind === "external") {
    return { link: link.url };
  }
  return context.destinations.has(link.anchor) ? { linkToDestination: link.anchor } : {};
};

const publisherRunProps = (
  run: TextRun,
  blockSize: number,
  context: RenderContext,
): Partial<ContentText> => {
  const { marks, style } = run;
  // pdfmake shrinks sup/sub itself, so size them from the surrounding text.
  const size = marks.sup || marks.sub ? blockSize : style.fontSize;
  return {
    font: context.fonts.resolve(style.fontFamilies),
    fontSize: marks.smallCaps ? size * 0.8 : size,
    ...(style.color === undefined ? {} : { color: style.color }),
    ...(style.letterSpacing === 0 ? {} : { characterSpacing: style.letterSpacing }),
  };
};

const customRunProps = (
  run: TextRun,
  fontSize: number,
  context: RenderContext,
): Partial<ContentText> => {
  const { marks } = run;
  if (marks.mono) {
    return { font: context.fonts.resolve(["monospace"]), fontSize: fontSize * 0.9 };
  }
  return marks.smallCaps ? { fontSize: fontSize * 0.8 } : {};
};

const renderRun = (run: TextRun, fontSize: number, context: RenderContext): ContentText => {
  const { marks } = run;
  const decoration = marks.strike ? "lineThrough" : marks.underline ? "underline" : undefined;
  return {
    text: marks.smallCaps ? run.text.toUpperCase() : run.text,
    ...(marks.bold ? { bold: true } : {}),
    ...(marks.italic ? { italics: true } : {}),
    ...(context.mode === "publisher"
      ? publisherRunProps(run, fontSize, context)
      : customRunProps(run, fontSize, context)),
    ...(marks.sup ? { sup: true } : {}),
    ...(marks.sub ? { sub: true } : {}),
    ...(decoration === undefined ? {} : { decoration }),
    ...linkProps(run.link, context),
  };
};

/** Renders runs; `fontSize` is the block's size (custom: from the style sheet). */
export const renderRuns = (
  runs: readonly TextRun[],
  fontSize: number,
  context: RenderContext,
): ContentText[] => runs.map((run) => renderRun(run, fontSize, context));

// ---------------------------------------------------------------------------
// Block layout (publisher theme)
// ---------------------------------------------------------------------------

/** Box properties for a publisher block, relative to its frame. */
const publisherBox = (style: BlockStyle, frame: Frame): Style => ({
  margin: [
    Math.max(0, style.indentLeft - frame.offset),
    style.marginTop,
    Math.max(0, style.indentRight),
    style.marginBottom,
  ],
});

const publisherText = (style: BlockStyle, context: RenderContext): Style => ({
  font: context.fonts.resolve(style.fontFamilies),
  fontSize: style.fontSize,
  lineHeight: style.lineHeight ?? context.lineHeight,
  ...(style.color === undefined ? {} : { color: style.color }),
  ...(style.textIndent > 0 ? { leadingIndent: style.textIndent } : {}),
});

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const codeLayout: CustomTableLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  fillColor: () => CODE_BACKGROUND,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
};

const renderTextBlock = (
  block: HeadingBlock | ParagraphBlock,
  id: AnchorId | undefined,
  frame: Frame,
  context: RenderContext,
): Content => {
  const idProps = id === undefined ? {} : { id };
  if (context.mode === "publisher") {
    const node: TextNode = {
      text: renderRuns(block.content, block.style.fontSize, context),
      // Collapsible whitespace is already trimmed; what remains (e.g. &nbsp; indents in verse) is meaningful.
      preserveLeadingSpaces: true,
      alignment: block.align ?? context.textAlign,
      ...publisherText(block.style, context),
      ...publisherBox(block.style, frame),
      ...idProps,
    };
    return node;
  }
  const style: StyleName =
    block.kind === "heading" ? `h${block.level}` : block.variant === "caption" ? "caption" : "body";
  // Custom layout keeps only meaningful alignments from the book (centred/right), not its body setting.
  const align = block.align === "center" || block.align === "right" ? block.align : undefined;
  const node: TextNode = {
    text: renderRuns(block.content, fontSizeFor(style, context.baseFontSize), context),
    preserveLeadingSpaces: true,
    style,
    ...(align === undefined ? {} : { alignment: align }),
    ...idProps,
  };
  return node;
};

const renderCode = (block: CodeBlock, frame: Frame, context: RenderContext): Content => {
  if (context.mode === "publisher") {
    return {
      text: block.text,
      preserveLeadingSpaces: true,
      alignment: "left",
      ...publisherText(block.style, context),
      ...publisherBox(block.style, frame),
    };
  }
  return {
    table: {
      widths: ["*"],
      body: [[{ text: block.text, style: "code", font: context.fonts.resolve(["monospace"]) }]],
    },
    layout: codeLayout,
    margin: [0, context.baseFontSize * 0.3, 0, context.baseFontSize * 0.9],
  };
};

const imageWidth = (
  block: ImageBlock,
  available: number,
  natural: number,
  context: RenderContext,
): number => {
  if (context.mode === "publisher" && block.width !== undefined) {
    return block.width.unit === "%" ? (available * block.width.value) / 100 : block.width.value;
  }
  return natural;
};

const renderImage = (block: ImageBlock, frame: Frame, context: RenderContext): Content[] => {
  const image = context.images.get(block.path);
  if (image === undefined) {
    return [];
  }
  const { contentWidth, contentHeight } = context.geometry;
  const publisher = context.mode === "publisher";
  const insets = publisher
    ? Math.max(0, block.style.indentLeft - frame.offset) + block.style.indentRight
    : 0;
  const available = Math.max(1, contentWidth - insets);
  const naturalWidth = image.width * PX_TO_PT;
  const width = imageWidth(block, available, naturalWidth, context);
  const size = fitWithin(
    { width, height: (width / image.width) * image.height },
    { width: available, height: contentHeight * MAX_IMAGE_PAGE_FRACTION },
  );
  const base = context.baseFontSize;
  return [
    {
      image: image.key,
      width: size.width,
      height: size.height,
      alignment: publisher ? (block.align ?? "center") : "center",
      margin: publisher
        ? [
            Math.max(0, block.style.indentLeft - frame.offset),
            block.style.marginTop,
            block.style.indentRight,
            block.style.marginBottom,
          ]
        : [0, base * 0.4, 0, base * 0.8],
    },
  ];
};

const renderRule = (block: Block, frame: Frame, context: RenderContext): Content => {
  const width = context.geometry.contentWidth;
  const base = context.baseFontSize;
  const [, top, , bottom]: readonly [number, number, number, number] =
    context.mode === "publisher"
      ? [
          0,
          Math.max(block.style.marginTop, base * 0.5),
          0,
          Math.max(block.style.marginBottom, base * 0.5),
        ]
      : [0, base * 0.8, 0, base * 1.2];
  return {
    canvas: [
      {
        type: "line",
        x1: width * 0.35 - frame.offset,
        y1: 0,
        x2: width * 0.65 - frame.offset,
        y2: 0,
        lineWidth: 0.6,
        lineColor: RULE_COLOR,
      },
    ],
    margin: [0, top, 0, bottom],
  };
};

const UNORDERED_MARKERS: Partial<Record<ListStyle, "disc" | "circle" | "square" | "none">> = {
  disc: "disc",
  circle: "circle",
  square: "square",
  none: "none",
};

const ORDERED_MARKERS: Partial<
  Record<
    ListStyle,
    "decimal" | "lower-alpha" | "upper-alpha" | "lower-roman" | "upper-roman" | "none"
  >
> = {
  decimal: "decimal",
  "lower-alpha": "lower-alpha",
  "upper-alpha": "upper-alpha",
  "lower-roman": "lower-roman",
  "upper-roman": "upper-roman",
  none: "none",
};

const renderList = (block: ListBlock, frame: Frame, context: RenderContext): Content => {
  const publisher = context.mode === "publisher";
  const childFrame: Frame = publisher ? { offset: block.contentIndent } : frame;
  const items = block.items.map((item): Content => ({
    stack: renderBlocks(item, context, childFrame),
  }));
  const base = context.baseFontSize;
  const margin: Margins = publisher
    ? [
        Math.max(0, block.contentIndent - frame.offset - block.style.fontSize * LIST_MARKER_GUTTER),
        block.style.marginTop,
        block.style.indentRight,
        block.style.marginBottom,
      ]
    : [base * 0.6, 0, 0, base * 0.6];
  if (block.ordered) {
    const type = publisher ? ORDERED_MARKERS[block.listStyle] : undefined;
    return { ol: items, start: block.start, margin, ...(type === undefined ? {} : { type }) };
  }
  const type = publisher ? UNORDERED_MARKERS[block.listStyle] : undefined;
  return { ul: items, margin, ...(type === undefined ? {} : { type }) };
};

const renderTable = (block: TableBlock, frame: Frame, context: RenderContext): Content => {
  const columns = Math.max(...block.rows.map((row) => row.length));
  const fontSize =
    context.mode === "publisher"
      ? block.style.fontSize
      : fontSizeFor("table", context.baseFontSize);
  const body = block.rows.map((row): TableCell[] =>
    Array.from({ length: columns }, (_, index): TableCell => {
      const cell = row[index];
      return { text: cell === undefined ? "" : renderRuns(cell.content, fontSize, context) };
    }),
  );
  const headerRows = block.rows[0]?.every((cell) => cell.header) === true ? 1 : 0;
  const base = context.baseFontSize;
  return {
    table: { widths: Array.from({ length: columns }, () => "*"), body, headerRows },
    // Publisher tables follow the book, whose borders we don't model; custom ones get light rules.
    layout: context.mode === "publisher" ? "noBorders" : "lightHorizontalLines",
    ...(context.mode === "publisher"
      ? { ...publisherText(block.style, context), ...publisherBox(block.style, frame) }
      : { style: "table", margin: [0, base * 0.3, 0, base * 0.9] }),
  };
};

/** Renders the block body. `id` is the block's primary anchor, applied where the node supports it. */
const renderBlockBody = (
  block: Block,
  id: AnchorId | undefined,
  frame: Frame,
  context: RenderContext,
): Content[] => {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return [renderTextBlock(block, id, frame, context)];
    case "code":
      return [renderCode(block, frame, context)];
    case "image":
      return renderImage(block, frame, context);
    case "rule":
      return [renderRule(block, frame, context)];
    case "list":
      return [renderList(block, frame, context)];
    case "quote": {
      const children = renderBlocks(block.children, context, frame);
      if (context.mode === "publisher") {
        // Children already carry the quote's insets.
        return [{ stack: children }];
      }
      const base = context.baseFontSize;
      return [{ stack: children, margin: [base * 1.5, 0, base * 1.5, base * 0.3] }];
    }
    case "table":
      return [renderTable(block, frame, context)];
  }
};

const carriesOwnId = (block: Block): boolean =>
  block.kind === "heading" || block.kind === "paragraph";

export const renderBlock = (
  block: Block,
  context: RenderContext,
  frame: Frame = ROOT_FRAME,
): Content[] => {
  const [first, ...rest] = block.anchors;
  const ownId = carriesOwnId(block) ? first : undefined;
  const markerAnchors = ownId === undefined ? block.anchors : rest;
  const breakBefore: TextNode[] =
    context.mode === "publisher" && block.style.pageBreakBefore
      ? [{ text: "", pageBreak: "before", ...MARKER_STYLE }]
      : [];
  return [
    ...breakBefore,
    ...block.anchors.flatMap((anchor) => outlineMarkersFor(anchor, context)),
    ...markerAnchors.map((anchor) => destinationMarker(anchor)),
    ...renderBlockBody(block, ownId, frame, context),
  ];
};

/**
 * Collapses adjacent vertical margins as CSS does: the gap between two blocks is the larger
 * of the first's bottom and the second's top margin, not their sum.
 */
const collapseMargins = (blocks: readonly Block[]): Block[] =>
  blocks.map((block, index) => {
    const previous = index === 0 ? undefined : blocks[index - 1];
    if (previous === undefined || block.style.pageBreakBefore) {
      return block;
    }
    const top = Math.max(0, block.style.marginTop - previous.style.marginBottom);
    return top === block.style.marginTop
      ? block
      : { ...block, style: { ...block.style, marginTop: top } };
  });

export const renderBlocks = (
  blocks: readonly Block[],
  context: RenderContext,
  frame: Frame = ROOT_FRAME,
): Content[] => {
  const prepared = context.mode === "publisher" ? collapseMargins(blocks) : blocks;
  return prepared.flatMap((block) => renderBlock(block, context, frame));
};
