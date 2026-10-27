import type { Style, StyleDictionary } from "pdfmake/interfaces";

import type { HeadingLevel } from "@/core/document/ast";
import type { ConversionSettings } from "@/core/settings";
import { effectiveBaseFontSize } from "@/core/settings";

export type StyleName =
  | `h${HeadingLevel}`
  | "body"
  | "caption"
  | "code"
  | "table"
  | "tocTitle"
  | "tocEntry";

export const MUTED_COLOR = "#52525b";
export const CODE_BACKGROUND = "#f4f4f5";
export const RULE_COLOR = "#a1a1aa";

/** Font size of each style relative to the body text size. */
const SIZE_SCALE: Readonly<Record<StyleName, number>> = {
  h1: 1.85,
  h2: 1.55,
  h3: 1.3,
  h4: 1.15,
  h5: 1.05,
  h6: 1,
  body: 1,
  caption: 0.88,
  code: 0.88,
  table: 0.92,
  tocTitle: 1.55,
  tocEntry: 0.95,
};

/** Font size (pt) a given style resolves to, needed for relative inline sizing. */
export const fontSizeFor = (style: StyleName, base: number): number => base * SIZE_SCALE[style];

const heading = (level: HeadingLevel, base: number): Style => ({
  fontSize: fontSizeFor(`h${level}`, base),
  bold: true,
  lineHeight: 1.15,
  alignment: "left",
  margin: [0, base * (level <= 2 ? 1.6 : 1.1), 0, base * 0.7],
});

/** The full style sheet for a document, derived from the user's settings. */
export const buildStyles = (
  settings: ConversionSettings,
): StyleDictionary & Record<StyleName, Style> => {
  const base = effectiveBaseFontSize(settings);
  return {
    h1: heading(1, base),
    h2: heading(2, base),
    h3: heading(3, base),
    h4: heading(4, base),
    h5: heading(5, base),
    h6: heading(6, base),
    body: {
      alignment: settings.textAlign,
      margin: [0, 0, 0, base * 0.6],
    },
    caption: {
      fontSize: fontSizeFor("caption", base),
      italics: true,
      alignment: "center",
      color: MUTED_COLOR,
      margin: [0, 0, 0, base * 0.9],
    },
    code: {
      fontSize: fontSizeFor("code", base),
      lineHeight: 1.25,
      preserveLeadingSpaces: true,
      alignment: "left",
    },
    table: {
      fontSize: fontSizeFor("table", base),
      alignment: "left",
      lineHeight: 1.2,
    },
    tocTitle: {
      fontSize: fontSizeFor("tocTitle", base),
      bold: true,
      margin: [0, 0, 0, base * 1.5],
    },
    tocEntry: {
      fontSize: fontSizeFor("tocEntry", base),
      alignment: "left",
      lineHeight: 1.2,
    },
  };
};
