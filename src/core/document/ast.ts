/**
 * The intermediate book model: a small, renderer-agnostic AST.
 * XHTML is reduced to these blocks once; any output format (PDF today) renders from it.
 */
import type { ListStyle, TextAlign, Width } from "@/core/css/computed-style";

export type { ListStyle, TextAlign, Width };

declare const anchorBrand: unique symbol;
/** A unique, renderer-safe destination id for an internal link target. */
export type AnchorId = string & { readonly [anchorBrand]: true };

export type Marks = {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly mono: boolean;
  readonly smallCaps: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly sup: boolean;
  readonly sub: boolean;
};

export const MARK_KEYS: readonly (keyof Marks)[] = [
  "bold",
  "italic",
  "mono",
  "smallCaps",
  "underline",
  "strike",
  "sup",
  "sub",
];

export const NO_MARKS: Marks = {
  bold: false,
  italic: false,
  mono: false,
  smallCaps: false,
  underline: false,
  strike: false,
  sup: false,
  sub: false,
};

export type LinkTarget =
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "internal"; readonly anchor: AnchorId };

/** Publisher typography of a run, as computed from the book's CSS (lengths in points). */
export type RunStyle = {
  readonly fontFamilies: readonly string[];
  readonly fontSize: number;
  readonly color: string | undefined;
  readonly letterSpacing: number;
};

/** Publisher layout of a block, as computed from the book's CSS (lengths in points). */
export type BlockStyle = {
  readonly fontFamilies: readonly string[];
  readonly fontSize: number;
  /** Multiple of the font size; `undefined` means the renderer's default. */
  readonly lineHeight: number | undefined;
  readonly color: string | undefined;
  readonly textIndent: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Total left/right inset, including every enclosing block's margin and padding. */
  readonly indentLeft: number;
  readonly indentRight: number;
  readonly pageBreakBefore: boolean;
};

export const DEFAULT_RUN_STYLE: RunStyle = {
  fontFamilies: ["serif"],
  fontSize: 11,
  color: undefined,
  letterSpacing: 0,
};

export const DEFAULT_BLOCK_STYLE: BlockStyle = {
  fontFamilies: ["serif"],
  fontSize: 11,
  lineHeight: undefined,
  color: undefined,
  textIndent: 0,
  marginTop: 0,
  marginBottom: 0,
  indentLeft: 0,
  indentRight: 0,
  pageBreakBefore: false,
};

/** A run of text sharing the same formatting. Hard line breaks are encoded as `\n`. */
export type TextRun = {
  readonly text: string;
  readonly marks: Marks;
  readonly link: LinkTarget | undefined;
  readonly style: RunStyle;
};

type BlockBase = {
  /** Internal-link destinations that point at this block. */
  readonly anchors: readonly AnchorId[];
  readonly style: BlockStyle;
};

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type HeadingBlock = BlockBase & {
  readonly kind: "heading";
  readonly level: HeadingLevel;
  readonly content: readonly TextRun[];
  readonly align: TextAlign | undefined;
};

export type ParagraphBlock = BlockBase & {
  readonly kind: "paragraph";
  readonly content: readonly TextRun[];
  readonly align: TextAlign | undefined;
  readonly variant: "body" | "caption";
};

export type ListBlock = BlockBase & {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly start: number;
  readonly listStyle: ListStyle;
  /** Inset of the item content (the list's indent plus its padding), in points. */
  readonly contentIndent: number;
  readonly items: readonly (readonly Block[])[];
};

export type QuoteBlock = BlockBase & {
  readonly kind: "quote";
  readonly children: readonly Block[];
};

export type CodeBlock = BlockBase & {
  readonly kind: "code";
  readonly text: string;
};

export type ImageBlock = BlockBase & {
  readonly kind: "image";
  /** Archive path of the image resource. */
  readonly path: string;
  readonly alt: string;
  /** CSS width, when the book specifies one. */
  readonly width: Width | undefined;
  readonly align: TextAlign | undefined;
};

export type RuleBlock = BlockBase & {
  readonly kind: "rule";
};

export type TableCell = {
  readonly content: readonly TextRun[];
  readonly header: boolean;
};

export type TableBlock = BlockBase & {
  readonly kind: "table";
  readonly rows: readonly (readonly TableCell[])[];
};

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | CodeBlock
  | ImageBlock
  | RuleBlock
  | TableBlock;

export type Chapter = {
  readonly path: string;
  /** Destination for links pointing at the chapter file itself. */
  readonly anchor: AnchorId;
  readonly blocks: readonly Block[];
};

export type OutlineEntry = {
  readonly title: string;
  readonly anchor: AnchorId;
  readonly children: readonly OutlineEntry[];
};

export type BookMetadata = {
  readonly title: string | undefined;
  readonly authors: readonly string[];
  readonly language: string | undefined;
  readonly publisher: string | undefined;
  readonly subjects: readonly string[];
};

/** An `@font-face` the book ships, resolved to an archive path. */
export type EmbeddedFontFace = {
  readonly family: string;
  readonly path: string;
  readonly weight: number;
  readonly italic: boolean;
};

export type BookDocument = {
  readonly metadata: BookMetadata;
  readonly fontFaces: readonly EmbeddedFontFace[];
  readonly chapters: readonly Chapter[];
  readonly outline: readonly OutlineEntry[];
  /** Archive path of the cover image, when the book declares one. */
  readonly coverPath: string | undefined;
};

/** Visits every block in a tree, depth-first, including list items and quote children. */
export const forEachBlock = (blocks: readonly Block[], visit: (block: Block) => void): void => {
  for (const block of blocks) {
    visit(block);
    if (block.kind === "list") {
      block.items.forEach((item) => {
        forEachBlock(item, visit);
      });
    } else if (block.kind === "quote") {
      forEachBlock(block.children, visit);
    }
  }
};

/** Every image path referenced anywhere in a block tree. */
export const collectImagePaths = (blocks: readonly Block[]): Set<string> => {
  const paths = new Set<string>();
  forEachBlock(blocks, (block) => {
    if (block.kind === "image") {
      paths.add(block.path);
    }
  });
  return paths;
};

/** Every anchor (link destination) placed anywhere in a block tree. */
export const collectAnchors = (blocks: readonly Block[]): Set<AnchorId> => {
  const anchors = new Set<AnchorId>();
  forEachBlock(blocks, (block) => {
    block.anchors.forEach((anchor) => {
      anchors.add(anchor);
    });
  });
  return anchors;
};
