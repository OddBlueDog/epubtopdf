import type { LengthContext } from "@/core/css/values";
import {
  expandBox,
  parseColor,
  parseFontFamilies,
  parseFontSize,
  parseFontWeight,
  parseLength,
  parseLineHeight,
} from "@/core/css/values";

export type TextAlign = "left" | "center" | "right" | "justify";
export type Display = "block" | "inline" | "none" | "list-item" | "table";
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type VerticalAlign = "baseline" | "super" | "sub";
export type ListStyle =
  | "disc"
  | "circle"
  | "square"
  | "decimal"
  | "lower-alpha"
  | "upper-alpha"
  | "lower-roman"
  | "upper-roman"
  | "none";

/** A width that is either absolute or relative to the containing block. */
export type Width =
  | { readonly unit: "pt"; readonly value: number }
  | { readonly unit: "%"; readonly value: number };

/**
 * The subset of CSS that matters for a reflowed book, fully resolved:
 * lengths are in points, inherited properties already carry the parent's values.
 */
export type ComputedStyle = {
  // Inherited
  readonly fontFamilies: readonly string[];
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly italic: boolean;
  readonly smallCaps: boolean;
  /** Multiple of the font size; `undefined` means `normal`. */
  readonly lineHeight: number | undefined;
  readonly textAlign: TextAlign | undefined;
  readonly textIndent: number;
  readonly color: string | undefined;
  readonly textTransform: TextTransform;
  readonly letterSpacing: number;
  readonly preformatted: boolean;
  readonly listStyle: ListStyle;
  /** Decorations propagate to descendants visually, so we treat them as inherited. */
  readonly underline: boolean;
  readonly strike: boolean;
  // Not inherited
  readonly display: Display;
  readonly verticalAlign: VerticalAlign;
  readonly margin: readonly [top: number, right: number, bottom: number, left: number];
  readonly padding: readonly [top: number, right: number, bottom: number, left: number];
  readonly pageBreakBefore: boolean;
  readonly pageBreakAfter: boolean;
  readonly width: Width | undefined;
};

export type Declaration = {
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
};

export type StyleEnvironment = {
  /** The user's base text size in points (CSS `medium`). */
  readonly rootFontSize: number;
  /** Family used where the book specifies none, e.g. `serif`. */
  readonly defaultFontFamily: string;
};

const NO_BOX = [0, 0, 0, 0] as const;

export const rootStyle = (environment: StyleEnvironment): ComputedStyle => ({
  fontFamilies: [environment.defaultFontFamily],
  fontSize: environment.rootFontSize,
  fontWeight: 400,
  italic: false,
  smallCaps: false,
  lineHeight: undefined,
  textAlign: undefined,
  textIndent: 0,
  color: undefined,
  textTransform: "none",
  letterSpacing: 0,
  preformatted: false,
  listStyle: "disc",
  underline: false,
  strike: false,
  display: "block",
  verticalAlign: "baseline",
  margin: NO_BOX,
  padding: NO_BOX,
  pageBreakBefore: false,
  pageBreakAfter: false,
  width: undefined,
});

/** Starts a child's style: inherited properties carry over, the rest reset to initial values. */
export const inheritStyle = (parent: ComputedStyle): ComputedStyle => ({
  ...parent,
  display: "inline",
  verticalAlign: "baseline",
  margin: NO_BOX,
  padding: NO_BOX,
  pageBreakBefore: false,
  pageBreakAfter: false,
  width: undefined,
});

const DISPLAY: Readonly<Record<string, Display>> = {
  block: "block",
  inline: "inline",
  "inline-block": "inline",
  none: "none",
  "list-item": "list-item",
  table: "table",
  flex: "block",
  grid: "block",
  "flow-root": "block",
};

const ALIGNMENTS: Readonly<Record<string, TextAlign>> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
  justify: "justify",
};

const TRANSFORMS: Readonly<Record<string, TextTransform>> = {
  none: "none",
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
};

const LIST_STYLES: ReadonlySet<string> = new Set<ListStyle>([
  "disc",
  "circle",
  "square",
  "decimal",
  "lower-alpha",
  "upper-alpha",
  "lower-roman",
  "upper-roman",
  "none",
]);

const isListStyle = (value: string): value is ListStyle => LIST_STYLES.has(value);

const BREAKS = new Set(["always", "page", "left", "right", "recto", "verso"]);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const lengthContext = (
  style: ComputedStyle,
  environment: StyleEnvironment,
  percentBase?: number,
): LengthContext => ({
  fontSize: style.fontSize,
  rootFontSize: environment.rootFontSize,
  // 16px = medium, scaled with the user's base size, so px-based books zoom too.
  pixel: environment.rootFontSize / 16,
  percentBase,
});

const boxSide = (
  value: string,
  style: ComputedStyle,
  environment: StyleEnvironment,
): number | undefined =>
  value.trim() === "auto" ? 0 : parseLength(value, lengthContext(style, environment));

const applyBox = (
  current: readonly [number, number, number, number],
  sides: readonly (string | undefined)[],
  style: ComputedStyle,
  environment: StyleEnvironment,
): [number, number, number, number] => {
  const next: [number, number, number, number] = [...current];
  sides.forEach((side, index) => {
    const resolved = side === undefined ? undefined : boxSide(side, style, environment);
    if (resolved !== undefined) {
      next[index] = resolved;
    }
  });
  return next;
};

const SIDE_INDEX: Readonly<Record<string, number>> = { top: 0, right: 1, bottom: 2, left: 3 };

/** Applies one declaration. `font-size` must be applied before other length properties. */
const applyDeclaration = (
  style: Mutable<ComputedStyle>,
  parent: ComputedStyle,
  { property, value }: Declaration,
  environment: StyleEnvironment,
): void => {
  const keyword = value.trim().toLowerCase();
  // Inherited properties already carry the parent's value; CSS-wide keywords on the
  // non-inherited ones we model are equivalent to their initial values.
  if (keyword === "inherit" || keyword === "initial" || keyword === "unset") {
    return;
  }
  const context = lengthContext(style, environment);
  switch (property) {
    case "font-family": {
      const families = parseFontFamilies(value);
      if (families.length > 0) {
        style.fontFamilies = families;
      }
      return;
    }
    case "font-size":
      style.fontSize = parseFontSize(value, parent.fontSize, context) ?? style.fontSize;
      return;
    case "font-weight":
      style.fontWeight = parseFontWeight(value, parent.fontWeight) ?? style.fontWeight;
      return;
    case "font-style":
      style.italic = keyword === "italic" || keyword === "oblique";
      return;
    case "font-variant":
    case "font-variant-caps":
      style.smallCaps = keyword.includes("small-caps");
      return;
    case "line-height":
      style.lineHeight = parseLineHeight(value, style.fontSize, context);
      return;
    case "text-align":
      style.textAlign = ALIGNMENTS[keyword] ?? style.textAlign;
      return;
    case "text-indent":
      style.textIndent =
        parseLength(value, { ...context, percentBase: undefined }) ?? style.textIndent;
      return;
    case "color":
      style.color = parseColor(value) ?? style.color;
      return;
    case "text-transform":
      style.textTransform = TRANSFORMS[keyword] ?? style.textTransform;
      return;
    case "letter-spacing":
      style.letterSpacing =
        keyword === "normal" ? 0 : (parseLength(value, context) ?? style.letterSpacing);
      return;
    case "white-space":
      style.preformatted = keyword.startsWith("pre");
      return;
    case "list-style-type":
    case "list-style": {
      const type = keyword.split(/\s+/u).find((part) => isListStyle(part));
      style.listStyle = type ?? style.listStyle;
      return;
    }
    case "text-decoration":
    case "text-decoration-line":
      if (keyword === "none") {
        style.underline = false;
        style.strike = false;
      } else {
        style.underline ||= keyword.includes("underline");
        style.strike ||= keyword.includes("line-through");
      }
      return;
    case "vertical-align":
      style.verticalAlign = keyword === "super" || keyword === "sub" ? keyword : "baseline";
      return;
    case "display":
      style.display = DISPLAY[keyword] ?? style.display;
      return;
    case "margin":
    case "padding": {
      const sides = expandBox(value);
      if (sides !== undefined) {
        style[property] = applyBox(style[property], sides, style, environment);
      }
      return;
    }
    case "page-break-before":
    case "break-before":
      style.pageBreakBefore = BREAKS.has(keyword);
      return;
    case "page-break-after":
    case "break-after":
      style.pageBreakAfter = BREAKS.has(keyword);
      return;
    case "width": {
      const percent = /^(\d+(?:\.\d+)?)%$/u.exec(keyword);
      const absolute = parseLength(value, context);
      style.width =
        percent?.[1] === undefined
          ? absolute === undefined
            ? style.width
            : { unit: "pt", value: absolute }
          : { unit: "%", value: Number(percent[1]) };
      return;
    }
    default: {
      const side = /^(margin|padding)-(top|right|bottom|left)$/u.exec(property);
      const box = side?.[1];
      const index = SIDE_INDEX[side?.[2] ?? ""];
      if ((box === "margin" || box === "padding") && index !== undefined) {
        const sides = [undefined, undefined, undefined, undefined].map((_, position) =>
          position === index ? value : undefined,
        );
        style[box] = applyBox(style[box], sides, style, environment);
      }
    }
  }
};

/**
 * Computes an element's style from its parent and its winning declarations (already sorted
 * by cascade order, lowest priority first).
 */
export const computeStyle = (
  parent: ComputedStyle,
  declarations: readonly Declaration[],
  environment: StyleEnvironment,
): ComputedStyle => {
  const style: Mutable<ComputedStyle> = { ...inheritStyle(parent) };
  // `font-size` first: `em` lengths in the same rule set resolve against the new size.
  const ordered = [
    ...declarations.filter((declaration) => declaration.property === "font-size"),
    ...declarations.filter((declaration) => declaration.property !== "font-size"),
  ];
  for (const declaration of ordered) {
    applyDeclaration(style, parent, declaration, environment);
  }
  return style;
};
