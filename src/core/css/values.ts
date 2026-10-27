/**
 * Parsers for the CSS value syntaxes we support. Every function is total: unsupported input
 * returns `undefined` so the cascade can fall back, exactly as a browser drops invalid values.
 */

/** Context for resolving relative lengths, all in PDF points. */
export type LengthContext = {
  /** Font size of the element (for `em`). */
  readonly fontSize: number;
  /** Root font size (for `rem`), i.e. the user's base text size. */
  readonly rootFontSize: number;
  /** Size of one CSS pixel in points (scaled with the user's base text size). */
  readonly pixel: number;
  /** Reference for percentages; `undefined` when percentages are not resolvable. */
  readonly percentBase: number | undefined;
};

const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))(px|pt|pc|em|rem|ex|ch|in|cm|mm|q|%|vw|vh)?$/iu;

const ABSOLUTE_UNITS_IN_PT: Readonly<Record<string, number>> = {
  pt: 1,
  pc: 12,
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  q: 72 / 101.6,
};

/** Resolves a CSS length to points. Unitless zero is allowed; other unitless numbers are not. */
export const parseLength = (value: string, context: LengthContext): number | undefined => {
  const match = LENGTH.exec(value.trim());
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "").toLowerCase();
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  switch (unit) {
    case "":
      return amount === 0 ? 0 : undefined;
    case "px":
      return amount * context.pixel;
    case "em":
      return amount * context.fontSize;
    case "ex":
    case "ch":
      return amount * context.fontSize * 0.5;
    case "rem":
      return amount * context.rootFontSize;
    case "%":
      return context.percentBase === undefined ? undefined : (amount / 100) * context.percentBase;
    case "vw":
    case "vh":
      return undefined;
    default: {
      const factor = ABSOLUTE_UNITS_IN_PT[unit];
      return factor === undefined ? undefined : amount * factor;
    }
  }
};

const FONT_SIZE_KEYWORDS: Readonly<Record<string, number>> = {
  "xx-small": 0.6,
  "x-small": 0.75,
  small: 0.89,
  medium: 1,
  large: 1.2,
  "x-large": 1.5,
  "xx-large": 2,
  "xxx-large": 3,
};

/** Resolves `font-size`: keywords, relative keywords, lengths and percentages of the parent size. */
export const parseFontSize = (
  value: string,
  parentSize: number,
  context: LengthContext,
): number | undefined => {
  const keyword = value.trim().toLowerCase();
  const scale = FONT_SIZE_KEYWORDS[keyword];
  if (scale !== undefined) {
    return context.rootFontSize * scale;
  }
  if (keyword === "smaller") {
    return parentSize / 1.2;
  }
  if (keyword === "larger") {
    return parentSize * 1.2;
  }
  const size = parseLength(value, { ...context, fontSize: parentSize, percentBase: parentSize });
  return size === undefined || size <= 0 ? undefined : size;
};

/** Resolves `line-height` to a multiple of the font size (`normal` → `undefined`). */
export const parseLineHeight = (
  value: string,
  fontSize: number,
  context: LengthContext,
): number | undefined => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "normal") {
    return undefined;
  }
  const number = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(number)) {
    return number > 0 ? number : undefined;
  }
  const length = parseLength(trimmed, { ...context, fontSize, percentBase: fontSize });
  return length === undefined || length <= 0 ? undefined : length / fontSize;
};

export const parseFontWeight = (value: string, parentWeight: number): number | undefined => {
  const keyword = value.trim().toLowerCase();
  switch (keyword) {
    case "normal":
      return 400;
    case "bold":
      return 700;
    case "bolder":
      return parentWeight >= 600 ? 900 : 700;
    case "lighter":
      return parentWeight >= 600 ? 400 : 100;
    default: {
      const numeric = Number(keyword);
      return Number.isFinite(numeric) && numeric >= 1 && numeric <= 1000 ? numeric : undefined;
    }
  }
};

/** Splits a `font-family` list into unquoted, lower-cased names. */
export const parseFontFamilies = (value: string): string[] =>
  value
    .split(",")
    .map((family) =>
      family
        .trim()
        .replace(/^(["'])(.*)\1$/u, "$2")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

/** Expands 1–4 value box shorthands (`margin`, `padding`) to `[top, right, bottom, left]`. */
export const expandBox = (value: string): readonly [string, string, string, string] | undefined => {
  const parts = value.trim().split(/\s+/u);
  const top = parts[0];
  if (top === undefined || top === "" || parts.length > 4) {
    return undefined;
  }
  const right = parts[1] ?? top;
  return [top, right, parts[2] ?? top, parts[3] ?? right];
};

const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  navy: "#000080",
  purple: "#800080",
  teal: "#008080",
  olive: "#808000",
  orange: "#ffa500",
  brown: "#a52a2a",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  dimgray: "#696969",
  dimgrey: "#696969",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkred: "#8b0000",
  darkblue: "#00008b",
  darkgreen: "#006400",
};

const hexByte = (value: number): string =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");

const RGB = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+[\d.]+%?)?\s*\)$/iu;

const channel = (value: string): number =>
  value.endsWith("%") ? (Number(value.slice(0, -1)) / 100) * 255 : Number(value);

/** Normalises a CSS color to `#rrggbb`; transparency and unknown names yield `undefined`. */
export const parseColor = (value: string): string | undefined => {
  const color = value.trim().toLowerCase();
  const named = NAMED_COLORS[color];
  if (named !== undefined) {
    return named;
  }
  if (/^#[\da-f]{6}$/u.test(color)) {
    return color;
  }
  if (/^#[\da-f]{3}$/u.test(color)) {
    return `#${Array.from(color.slice(1), (digit) => digit + digit).join("")}`;
  }
  const rgb = RGB.exec(color);
  if (rgb !== null) {
    const [red, green, blue] = [rgb[1], rgb[2], rgb[3]].map((part) =>
      hexByte(channel(part ?? "0")),
    );
    return `#${red ?? "00"}${green ?? "00"}${blue ?? "00"}`;
  }
  return undefined;
};
