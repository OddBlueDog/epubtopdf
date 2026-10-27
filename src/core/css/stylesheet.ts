import type { CssAtRuleAST, CssDeclarationAST } from "@adobe/css-tools";
import { CssTypes, parse as parseCss } from "@adobe/css-tools";
import type { Selector } from "css-what";
import { AttributeAction, parse as parseSelector, SelectorType } from "css-what";

import type { Declaration } from "@/core/css/computed-style";
import { parseFontFamilies } from "@/core/css/values";

/** `[ids, classes/attributes/pseudo-classes, types/pseudo-elements]`. */
export type Specificity = readonly [number, number, number];

export type StyleRule = {
  /** A single (non-grouped) selector. */
  readonly selector: string;
  readonly tokens: readonly Selector[];
  readonly specificity: Specificity;
  readonly declarations: readonly Declaration[];
};

export type FontFace = {
  readonly family: string;
  /** Raw `url()` references in preference order, relative to the stylesheet. */
  readonly sources: readonly string[];
  readonly weight: number;
  readonly italic: boolean;
};

export type ParsedStylesheet = {
  readonly rules: readonly StyleRule[];
  readonly fontFaces: readonly FontFace[];
  /** Raw `@import` targets, relative to the stylesheet. */
  readonly imports: readonly string[];
  /** Declarations of unconditional `@page` rules (no `:first`/`:left` selectors). */
  readonly pageDeclarations: readonly Declaration[];
};

const IMPORTANT = /\s*!\s*important\s*$/iu;

const toDeclarations = (nodes: readonly unknown[]): Declaration[] =>
  nodes.flatMap((node): Declaration[] => {
    if (!isDeclaration(node)) {
      return [];
    }
    const important = IMPORTANT.test(node.value);
    return [
      {
        property: node.property.trim().toLowerCase(),
        value: node.value.replace(IMPORTANT, "").trim(),
        important,
      },
    ];
  });

const isDeclaration = (node: unknown): node is CssDeclarationAST =>
  typeof node === "object" &&
  node !== null &&
  Reflect.get(node, "type") === CssTypes.declaration &&
  typeof Reflect.get(node, "property") === "string" &&
  typeof Reflect.get(node, "value") === "string";

/** Specificity per Selectors Level 4 (`:is`/`:not` approximated as one class). */
export const specificityOf = (tokens: readonly Selector[]): Specificity => {
  let ids = 0;
  let classes = 0;
  let types = 0;
  for (const token of tokens) {
    switch (token.type) {
      case SelectorType.Attribute:
        if (token.name === "id" && token.action === AttributeAction.Equals) {
          ids++;
        } else {
          classes++;
        }
        break;
      case SelectorType.Pseudo:
        classes++;
        break;
      case SelectorType.Tag:
      case SelectorType.PseudoElement:
        types++;
        break;
      default:
        break;
    }
  }
  return [ids, classes, types];
};

/** Pseudo-elements and interaction states never match an element in a static document. */
const DYNAMIC_PSEUDO = new Set([
  "hover",
  "active",
  "focus",
  "focus-within",
  "focus-visible",
  "visited",
  "target",
]);

const isStatic = (tokens: readonly Selector[]): boolean =>
  tokens.every(
    (token) =>
      token.type !== SelectorType.PseudoElement &&
      !(
        token.type === SelectorType.Pseudo &&
        (DYNAMIC_PSEUDO.has(token.name) ||
          ["before", "after", "first-letter", "first-line"].includes(token.name))
      ),
  );

const toRules = (
  selectorList: readonly string[],
  declarations: readonly Declaration[],
): StyleRule[] =>
  selectorList.flatMap((raw): StyleRule[] => {
    const selector = raw.trim();
    try {
      return parseSelector(selector)
        .filter((tokens) => isStatic(tokens))
        .map((tokens) => ({ selector, tokens, specificity: specificityOf(tokens), declarations }));
    } catch {
      return [];
    }
  });

const valueOf = (declarations: readonly Declaration[], property: string): string | undefined =>
  declarations.findLast((declaration) => declaration.property === property)?.value;

const URL_REFERENCE = /url\(\s*(["']?)([^"')]+)\1\s*\)/giu;

const toFontFace = (declarations: readonly Declaration[]): FontFace[] => {
  const family = parseFontFamilies(valueOf(declarations, "font-family") ?? "")[0];
  const sources = [...(valueOf(declarations, "src") ?? "").matchAll(URL_REFERENCE)].flatMap(
    (match) => (match[2] === undefined ? [] : [match[2].trim()]),
  );
  if (family === undefined || sources.length === 0) {
    return [];
  }
  const weight = (valueOf(declarations, "font-weight") ?? "normal").trim().toLowerCase();
  const numericWeight = weight === "bold" ? 700 : weight === "normal" ? 400 : Number(weight);
  const style = (valueOf(declarations, "font-style") ?? "normal").trim().toLowerCase();
  return [
    {
      family,
      sources,
      weight: Number.isFinite(numericWeight) ? numericWeight : 400,
      italic: style === "italic" || style === "oblique",
    },
  ];
};

/**
 * Media queries we honour: unconditional screen/print/all. Kindle-specific blocks
 * (`amzn-kf8`, `amzn-mobi`) and viewport-dependent queries are skipped.
 */
const isApplicableMedia = (query: string): boolean =>
  query
    .toLowerCase()
    .split(",")
    .some((part) => /^\s*(?:only\s+)?(?:all|screen|print)\s*$/u.test(part));

const IMPORT_TARGET = /^\s*(?:url\(\s*)?(["']?)([^"')\s]+)\1/u;

export const parseStylesheet = (css: string): ParsedStylesheet => {
  const rules: StyleRule[] = [];
  const fontFaces: FontFace[] = [];
  const imports: string[] = [];
  const pageDeclarations: Declaration[] = [];

  const visit = (nodes: readonly (CssAtRuleAST | CssDeclarationAST)[]): void => {
    for (const node of nodes) {
      switch (node.type) {
        case CssTypes.rule:
          rules.push(...toRules(node.selectors, toDeclarations(node.declarations)));
          break;
        case CssTypes.media:
          if (isApplicableMedia(node.media)) {
            visit(node.rules);
          }
          break;
        case CssTypes.supports:
        case CssTypes.layer:
          visit(node.rules ?? []);
          break;
        case CssTypes.page:
          if (node.selectors.every((selector) => selector.trim() === "")) {
            pageDeclarations.push(...toDeclarations(node.declarations));
          }
          break;
        case CssTypes.fontFace:
          fontFaces.push(...toFontFace(toDeclarations(node.declarations)));
          break;
        case CssTypes.import: {
          const target = IMPORT_TARGET.exec(node.import)?.[2];
          if (target !== undefined) {
            imports.push(target);
          }
          break;
        }
        default:
          break;
      }
    }
  };

  try {
    visit(parseCss(css, { silent: true }).stylesheet.rules);
  } catch {
    // A stylesheet the parser cannot recover from contributes nothing, like in a browser.
  }
  return { rules, fontFaces, imports, pageDeclarations };
};

/** Parses a `style="…"` attribute. */
export const parseInlineStyle = (style: string): Declaration[] => {
  try {
    const sheet = parseCss(`x{${style}}`, { silent: true });
    const rule = sheet.stylesheet.rules[0];
    return rule?.type === CssTypes.rule ? toDeclarations(rule.declarations) : [];
  } catch {
    return [];
  }
};
