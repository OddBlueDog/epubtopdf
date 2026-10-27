import type {
  AnchorId,
  Block,
  BlockStyle,
  HeadingLevel,
  LinkTarget,
  Marks,
  RunStyle,
  TextAlign,
  TextRun,
} from "@/core/document/ast";
import { MARK_KEYS } from "@/core/document/ast";

/** What kind of block the text currently being collected will become. */
export type TextVariant =
  | { readonly kind: "body" }
  | { readonly kind: "caption" }
  | { readonly kind: "heading"; readonly level: HeadingLevel };

export type TextStyle = {
  readonly marks: Marks;
  readonly link: LinkTarget | undefined;
  readonly run: RunStyle;
  /** Layout of the innermost block element containing the text. */
  readonly block: BlockStyle;
  readonly align: TextAlign | undefined;
  readonly variant: TextVariant;
  readonly preformatted: boolean;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type BlockWithoutAnchors = DistributiveOmit<Block, "anchors">;

/**
 * Accumulates inline text into paragraphs and collects finished blocks.
 * Block-level elements call `flush()` around themselves; inline content calls `appendText()`.
 */
export type BlockSink = {
  readonly appendText: (text: string, style: TextStyle) => void;
  readonly addAnchor: (anchor: AnchorId) => void;
  readonly push: (block: BlockWithoutAnchors) => void;
  readonly flush: () => void;
  /** Vertical space an enclosing container requires before the next block (collapses via max). */
  readonly spaceBefore: (points: number) => void;
  /** Vertical space an enclosing container requires after the last block (collapses via max). */
  readonly spaceAfter: (points: number) => void;
  /** Starts the next block on a new page. */
  readonly pageBreak: () => void;
  /** Flushes and returns the collected blocks plus anchors that never found a block. */
  readonly drain: () => {
    readonly blocks: readonly Block[];
    readonly orphanAnchors: readonly AnchorId[];
  };
};

const WHITESPACE = /[ \t\n\r\f]+/gu;

const sameRunStyle = (a: RunStyle, b: RunStyle): boolean =>
  a.fontSize === b.fontSize &&
  a.color === b.color &&
  a.letterSpacing === b.letterSpacing &&
  a.fontFamilies.length === b.fontFamilies.length &&
  a.fontFamilies.every((family, index) => family === b.fontFamilies[index]);

const sameFormatting = (a: TextRun, style: TextStyle): boolean =>
  a.link === style.link &&
  MARK_KEYS.every((key) => a.marks[key] === style.marks[key]) &&
  sameRunStyle(a.style, style.run);

const endsWithBreak = (runs: readonly TextRun[]): boolean => {
  const last = runs.at(-1);
  return last === undefined || last.text.endsWith(" ") || last.text.endsWith("\n");
};

/** Trims trailing whitespace and spaces adjacent to hard breaks. */
const finalizeRuns = (runs: readonly TextRun[]): TextRun[] => {
  const cleaned = runs.map((run) => ({ ...run, text: run.text.replaceAll(/ *\n */gu, "\n") }));
  while (cleaned.length > 0) {
    const last = cleaned.at(-1);
    if (last === undefined) {
      break;
    }
    const trimmed = last.text.replace(/[ \n]+$/u, "");
    if (trimmed !== "") {
      cleaned[cleaned.length - 1] = { ...last, text: trimmed };
      break;
    }
    cleaned.pop();
  }
  const first = cleaned[0];
  if (first !== undefined) {
    cleaned[0] = { ...first, text: first.text.replace(/^\n+/u, "") };
  }
  return cleaned.filter((run) => run.text !== "");
};

export const createBlockSink = (): BlockSink => {
  const blocks: Block[] = [];
  let runs: TextRun[] = [];
  let paragraphStyle: TextStyle | undefined;
  let pendingAnchors: AnchorId[] = [];
  let pendingSpace = 0;
  let pendingBreak = false;

  const takeAnchors = (): AnchorId[] => {
    const anchors = pendingAnchors;
    pendingAnchors = [];
    return anchors;
  };

  const push = (block: BlockWithoutAnchors): void => {
    const style = {
      ...block.style,
      marginTop: Math.max(block.style.marginTop, pendingSpace),
      pageBreakBefore: block.style.pageBreakBefore || pendingBreak,
    };
    pendingSpace = 0;
    pendingBreak = false;
    blocks.push({ ...block, style, anchors: takeAnchors() });
  };

  const flush = (): void => {
    const content = finalizeRuns(runs);
    const style = paragraphStyle;
    runs = [];
    paragraphStyle = undefined;
    if (content.length === 0 || style === undefined) {
      return;
    }
    const { variant, block, align } = style;
    if (variant.kind === "heading") {
      push({ kind: "heading", level: variant.level, content, align, style: block });
    } else {
      push({ kind: "paragraph", content, align, variant: variant.kind, style: block });
    }
  };

  const appendText = (text: string, style: TextStyle): void => {
    let value = style.preformatted ? text : text.replaceAll(WHITESPACE, " ");
    if (!style.preformatted && endsWithBreak(runs)) {
      value = value.replace(/^ /u, "");
    }
    if (value === "") {
      return;
    }
    paragraphStyle ??= style;
    const last = runs.at(-1);
    if (last !== undefined && sameFormatting(last, style)) {
      runs[runs.length - 1] = { ...last, text: last.text + value };
    } else {
      runs.push({ text: value, marks: style.marks, link: style.link, style: style.run });
    }
  };

  return {
    appendText,
    addAnchor: (anchor) => {
      pendingAnchors.push(anchor);
    },
    push,
    flush,
    spaceBefore: (points) => {
      pendingSpace = Math.max(pendingSpace, points);
    },
    spaceAfter: (points) => {
      const last = blocks.at(-1);
      if (last !== undefined && points > last.style.marginBottom) {
        blocks[blocks.length - 1] = { ...last, style: { ...last.style, marginBottom: points } };
      }
    },
    pageBreak: () => {
      pendingBreak = true;
    },
    drain: () => {
      flush();
      const orphanAnchors = pendingAnchors;
      pendingAnchors = [];
      return { blocks, orphanAnchors };
    },
  };
};
