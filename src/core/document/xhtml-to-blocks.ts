import { isTag, isText } from "domhandler";
import { textContent } from "domutils";

import type { StyleResolver } from "@/core/css/cascade";
import type { ComputedStyle, TextTransform } from "@/core/css/computed-style";
import type { AnchorRegistry } from "@/core/document/anchors";
import type {
  Block,
  BlockStyle,
  HeadingLevel,
  LinkTarget,
  Marks,
  RunStyle,
  TableCell,
  TextAlign,
  TextRun,
} from "@/core/document/ast";
import { NO_MARKS } from "@/core/document/ast";
import type { BlockSink, TextStyle, TextVariant } from "@/core/document/block-sink";
import { createBlockSink } from "@/core/document/block-sink";
import type { EpubArchive } from "@/core/epub/archive";
import { resolveHref } from "@/core/epub/paths";
import type { AnyNode, Element } from "@/core/xml/dom";
import { attr, childElements, findFirst, localName } from "@/core/xml/dom";

export type WalkEnvironment = {
  /** Archive path of the document being converted (base for relative hrefs). */
  readonly path: string;
  readonly archive: EpubArchive;
  readonly resolveStyle: StyleResolver;
  readonly anchors: AnchorRegistry;
  readonly includeImages: boolean;
};

/** Never content, whatever the CSS says. */
const SKIPPED = new Set([
  "head",
  "script",
  "style",
  "title",
  "meta",
  "link",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas",
  "input",
  "button",
  "select",
  "textarea",
]);

/** Elements whose structure we model explicitly, independent of their CSS `display`. */
const STRUCTURAL = new Set([
  "ul",
  "ol",
  "blockquote",
  "pre",
  "hr",
  "table",
  "img",
  "image",
  "svg",
  "switch",
]);

const HEADING_LEVELS: Readonly<Record<string, HeadingLevel>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

const MONOSPACE_FAMILIES = new Set([
  "monospace",
  "courier",
  "courier new",
  "consolas",
  "menlo",
  "monaco",
  "lucida console",
  "dejavu sans mono",
]);

const EXTERNAL_LINK = /^(?:https?:|mailto:)/iu;

// ---------------------------------------------------------------------------
// Computed style → AST styles
// ---------------------------------------------------------------------------

const marksOf = (style: ComputedStyle): Marks => ({
  bold: style.fontWeight >= 600,
  italic: style.italic,
  mono: style.fontFamilies.some((family) => MONOSPACE_FAMILIES.has(family)),
  smallCaps: style.smallCaps,
  underline: style.underline,
  strike: style.strike,
  sup: style.verticalAlign === "super",
  sub: style.verticalAlign === "sub",
});

const runStyleOf = (style: ComputedStyle): RunStyle => ({
  fontFamilies: style.fontFamilies,
  fontSize: style.fontSize,
  color: style.color,
  letterSpacing: style.letterSpacing,
});

const transformText = (text: string, transform: TextTransform): string => {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replaceAll(
        /(^|\s)(\p{L})/gu,
        (_, space: string, letter: string) => space + letter.toUpperCase(),
      );
    case "none":
      return text;
  }
};

/** Walk state inherited from ancestors. */
type Context = {
  readonly computed: ComputedStyle;
  readonly link: LinkTarget | undefined;
  readonly variant: TextVariant;
  /** Layout of the innermost enclosing block element. */
  readonly block: BlockStyle;
  readonly align: TextAlign | undefined;
};

type Insets = Pick<BlockStyle, "indentLeft" | "indentRight">;

/** Layout of a block element: its own vertical spacing, horizontal insets accumulated. */
const blockStyleOf = (
  computed: ComputedStyle,
  parent: Insets,
  includePadding = true,
): BlockStyle => {
  const [marginTop, marginRight, marginBottom, marginLeft] = computed.margin;
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = includePadding
    ? computed.padding
    : [0, 0, 0, 0];
  return {
    fontFamilies: computed.fontFamilies,
    fontSize: computed.fontSize,
    lineHeight: computed.lineHeight,
    color: computed.color,
    textIndent: computed.textIndent,
    marginTop: marginTop + paddingTop,
    marginBottom: marginBottom + paddingBottom,
    indentLeft: parent.indentLeft + marginLeft + paddingLeft,
    indentRight: parent.indentRight + marginRight + paddingRight,
    pageBreakBefore: computed.pageBreakBefore,
  };
};

const textStyleOf = (context: Context): TextStyle => ({
  marks: marksOf(context.computed),
  link: context.link,
  run: runStyleOf(context.computed),
  block: context.block,
  align: context.align,
  variant: context.variant,
  preformatted: context.computed.preformatted,
});

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

const linkFor = (element: Element, env: WalkEnvironment): LinkTarget | undefined => {
  const href = attr(element, "href")?.trim();
  if (href === undefined || href === "") {
    return undefined;
  }
  if (EXTERNAL_LINK.test(href)) {
    return { kind: "external", url: href };
  }
  const target = resolveHref(env.path, href);
  const anchor = target === undefined ? undefined : env.anchors.resolve(target);
  return anchor === undefined ? undefined : { kind: "internal", anchor };
};

const resolveImagePath = (element: Element, env: WalkEnvironment): string | undefined => {
  const source = attr(element, "src") ?? attr(element, "href");
  const target = source === undefined ? undefined : resolveHref(env.path, source);
  return target !== undefined && env.archive.has(target.path) ? target.path : undefined;
};

const parseStart = (value: string | undefined): number => {
  const parsed = Math.trunc(Number(value?.trim() ?? ""));
  return value === undefined || value.trim() === "" || !Number.isFinite(parsed) ? 1 : parsed;
};

/** Flattens the blocks of a table cell into a single run list. */
const flattenToRuns = (blocks: readonly Block[]): TextRun[] =>
  blocks.flatMap((block, index): TextRun[] => {
    switch (block.kind) {
      case "heading":
      case "paragraph": {
        const first = block.content[0];
        if (index === 0 || first === undefined) {
          return [...block.content];
        }
        const lineBreak: TextRun = {
          text: "\n",
          marks: NO_MARKS,
          link: undefined,
          style: first.style,
        };
        return [lineBreak, ...block.content];
      }
      case "code":
      case "list":
      case "quote":
      case "image":
      case "rule":
      case "table":
        return [];
    }
  });

const isBlockDisplay = (style: ComputedStyle): boolean =>
  style.display === "block" || style.display === "list-item" || style.display === "table";

const variantFor = (name: string, parent: TextVariant): TextVariant => {
  const level = HEADING_LEVELS[name];
  if (level !== undefined) {
    return { kind: "heading", level };
  }
  if (name === "figcaption" || name === "caption") {
    return { kind: "caption" };
  }
  return parent.kind === "heading" ? { kind: "body" } : parent;
};

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

/**
 * Converts the children of `<body>` into blocks. `bodyStyle` is the computed style of the
 * body element: its inherited typography applies, its own box is replaced by the page.
 */
export const xhtmlToBlocks = (
  body: Element,
  bodyStyle: ComputedStyle,
  env: WalkEnvironment,
): readonly Block[] => {
  const rootBlock: BlockStyle = {
    fontFamilies: bodyStyle.fontFamilies,
    fontSize: bodyStyle.fontSize,
    lineHeight: bodyStyle.lineHeight,
    color: bodyStyle.color,
    textIndent: bodyStyle.textIndent,
    marginTop: 0,
    marginBottom: 0,
    indentLeft: 0,
    indentRight: 0,
    pageBreakBefore: false,
  };

  const walkChildren = (element: Element, context: Context, sink: BlockSink): void => {
    for (const child of element.children) {
      walk(child, context, sink);
    }
  };

  /**
   * Walks children into a fresh sink, forwarding unplaced anchors to the parent.
   * `ownAnchors` also registers the element's own id (for list items and cells, which are
   * not visited through `walkElement`).
   */
  const walkIsolated = (
    element: Element,
    context: Context,
    parent: BlockSink,
    ownAnchors = false,
  ): readonly Block[] => {
    const sink = createBlockSink();
    if (ownAnchors) {
      registerAnchors(element, sink);
    }
    walkChildren(element, context, sink);
    const { blocks, orphanAnchors } = sink.drain();
    for (const anchor of orphanAnchors) {
      parent.addAnchor(anchor);
    }
    return blocks;
  };

  const registerAnchors = (element: Element, sink: BlockSink): void => {
    const name = localName(element) === "a" ? attr(element, "name") : undefined;
    for (const id of [attr(element, "id"), name]) {
      const anchor =
        id === undefined || id === "" ? undefined : env.anchors.forFragment(env.path, id);
      if (anchor !== undefined) {
        sink.addAnchor(anchor);
      }
    }
  };

  const walkList = (
    element: Element,
    ordered: boolean,
    context: Context,
    sink: BlockSink,
  ): void => {
    const style = blockStyleOf(context.computed, context.block, false);
    const contentIndent = style.indentLeft + context.computed.padding[3];
    const itemInsets: Insets = { indentLeft: contentIndent, indentRight: style.indentRight };
    const items = childElements(element)
      .map((item) => {
        const computed = env.resolveStyle(item, context.computed);
        const block = blockStyleOf(computed, itemInsets);
        const itemContext: Context = { ...context, computed, block, variant: { kind: "body" } };
        return walkIsolated(item, itemContext, sink, true);
      })
      .filter((blocks) => blocks.length > 0);
    if (items.length > 0) {
      sink.push({
        kind: "list",
        ordered,
        start: parseStart(attr(element, "start")),
        listStyle: context.computed.listStyle,
        contentIndent,
        items,
        style,
      });
    }
  };

  const walkTable = (element: Element, context: Context, sink: BlockSink): void => {
    const sections = childElements(element).flatMap((child) =>
      ["thead", "tbody", "tfoot"].includes(localName(child)) ? childElements(child) : [child],
    );
    const rows = sections
      .filter((row) => localName(row) === "tr")
      .map((row) => {
        const rowStyle = env.resolveStyle(row, context.computed);
        return childElements(row)
          .filter((cell) => ["td", "th"].includes(localName(cell)))
          .map((cell): TableCell => {
            const computed = env.resolveStyle(cell, rowStyle);
            const blocks = walkIsolated(cell, { ...context, computed }, sink, true);
            // Cell blocks are flattened into runs, so their anchors move up to the table.
            for (const anchor of blocks.flatMap((block) => block.anchors)) {
              sink.addAnchor(anchor);
            }
            return { header: localName(cell) === "th", content: flattenToRuns(blocks) };
          });
      })
      .filter((cells) => cells.length > 0);
    if (rows.length > 0) {
      sink.push({ kind: "table", rows, style: context.block });
    }
  };

  const pushImage = (element: Element | undefined, context: Context, sink: BlockSink): void => {
    const path = element === undefined ? undefined : resolveImagePath(element, env);
    if (element === undefined || path === undefined || !env.includeImages) {
      return;
    }
    sink.push({
      kind: "image",
      path,
      alt: attr(element, "alt") ?? "",
      width: context.computed.width,
      align: context.align,
      style: context.block,
    });
  };

  const walkStructural = (
    name: string,
    element: Element,
    context: Context,
    sink: BlockSink,
  ): void => {
    switch (name) {
      case "ul":
      case "ol":
        walkList(element, name === "ol", context, sink);
        return;
      case "blockquote": {
        const children = walkIsolated(element, context, sink);
        if (children.length > 0) {
          sink.push({ kind: "quote", children, style: context.block });
        }
        return;
      }
      case "pre": {
        const code = textContent(element).replace(/\n+$/u, "");
        if (code.trim() !== "") {
          sink.push({ kind: "code", text: code, style: context.block });
        }
        return;
      }
      case "hr":
        sink.push({ kind: "rule", style: context.block });
        return;
      case "table":
        walkTable(element, context, sink);
        return;
      case "img":
      case "image":
        pushImage(element, context, sink);
        return;
      case "svg":
        // Covers are often an <svg> wrapping a single <image>; other SVG is not rendered.
        pushImage(
          findFirst(element, (child) => localName(child) === "image"),
          context,
          sink,
        );
        return;
      default: {
        // <epub:switch>: render only the fallback branch.
        const fallback = childElements(element).find((child) => localName(child) === "default");
        if (fallback !== undefined) {
          walkChildren(fallback, context, sink);
        }
      }
    }
  };

  const walkElement = (element: Element, parent: Context, sink: BlockSink): void => {
    const name = localName(element);
    if (SKIPPED.has(name)) {
      return;
    }
    const computed = env.resolveStyle(element, parent.computed);
    if (computed.display === "none") {
      return;
    }

    if (name === "br") {
      sink.appendText("\n", { ...textStyleOf({ ...parent, computed }), preformatted: true });
      return;
    }

    const structural = STRUCTURAL.has(name);
    const isBlock = structural || HEADING_LEVELS[name] !== undefined || isBlockDisplay(computed);
    if (!isBlock) {
      registerAnchors(element, sink);
      const link = name === "a" ? (linkFor(element, env) ?? parent.link) : parent.link;
      walkChildren(element, { ...parent, computed, link }, sink);
      return;
    }

    sink.flush();
    registerAnchors(element, sink);
    if (computed.pageBreakBefore) {
      sink.pageBreak();
    }
    const block = blockStyleOf(computed, parent.block);
    sink.spaceBefore(block.marginTop);
    const context: Context = {
      ...parent,
      computed,
      block,
      variant: variantFor(name, parent.variant),
      align: computed.textAlign,
    };

    if (structural) {
      walkStructural(name, element, context, sink);
    } else {
      walkChildren(element, context, sink);
    }

    sink.flush();
    sink.spaceAfter(block.marginBottom);
    if (computed.pageBreakAfter) {
      sink.pageBreak();
    }
  };

  const walk = (node: AnyNode, context: Context, sink: BlockSink): void => {
    if (isText(node)) {
      const text = transformText(node.data, context.computed.textTransform);
      sink.appendText(text, textStyleOf(context));
    } else if (isTag(node)) {
      walkElement(node, context, sink);
    }
  };

  const sink = createBlockSink();
  const rootContext: Context = {
    computed: bodyStyle,
    link: undefined,
    variant: { kind: "body" },
    block: rootBlock,
    align: bodyStyle.textAlign,
  };
  walkChildren(body, rootContext, sink);
  const { blocks, orphanAnchors } = sink.drain();

  // Anchors at the very end of a document (e.g. an empty trailing <span id>) attach to the last block.
  const last = blocks.at(-1);
  if (last === undefined) {
    return blocks;
  }
  return [...blocks.slice(0, -1), { ...last, anchors: [...last.anchors, ...orphanAnchors] }];
};
