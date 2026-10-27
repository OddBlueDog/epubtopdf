import { compile } from "css-select";
import type { Selector } from "css-what";
import { AttributeAction, SelectorType } from "css-what";
import type { Element } from "domhandler";

import type { ComputedStyle, Declaration, StyleEnvironment } from "@/core/css/computed-style";
import { computeStyle } from "@/core/css/computed-style";
import type { Specificity, StyleRule } from "@/core/css/stylesheet";
import { parseInlineStyle } from "@/core/css/stylesheet";

export type Origin = "user-agent" | "author";

export type StyleSheetSource = {
  readonly origin: Origin;
  readonly rules: readonly StyleRule[];
};

type IndexedRule = {
  readonly matches: (element: Element) => boolean;
  readonly origin: Origin;
  readonly specificity: Specificity;
  readonly order: number;
  readonly declarations: readonly Declaration[];
};

/** Resolves the computed style of an element given its parent's computed style. */
export type StyleResolver = (element: Element, parent: ComputedStyle) => ComputedStyle;

const COMBINATORS: ReadonlySet<SelectorType> = new Set([
  SelectorType.Descendant,
  SelectorType.Child,
  SelectorType.Sibling,
  SelectorType.Adjacent,
  SelectorType.Parent,
  SelectorType.ColumnCombinator,
]);

/**
 * Index key of a selector: its rightmost compound's id, else first class, else tag, else `*`.
 * Like browsers, we only test rules whose key the element could possibly match.
 */
export const ruleKey = (tokens: readonly Selector[]): string => {
  const lastCombinator = tokens.findLastIndex((token) => COMBINATORS.has(token.type));
  const compound = tokens.slice(lastCombinator + 1);
  let key = "*";
  for (const token of compound) {
    if (
      token.type === SelectorType.Attribute &&
      token.name === "id" &&
      token.action === AttributeAction.Equals
    ) {
      return `#${token.value}`;
    }
    if (
      token.type === SelectorType.Attribute &&
      token.name === "class" &&
      token.action === AttributeAction.Element &&
      !key.startsWith(".")
    ) {
      key = `.${token.value}`;
    } else if (token.type === SelectorType.Tag && key === "*") {
      key = token.name;
    }
  }
  return key;
};

const ORIGIN_RANK: Readonly<Record<Origin, number>> = { "user-agent": 0, author: 1 };

const elementKeys = (element: Element): string[] => {
  const keys = ["*", element.name.toLowerCase()];
  const id = element.attribs["id"];
  if (id !== undefined && id !== "") {
    keys.push(`#${id}`);
  }
  for (const name of (element.attribs["class"] ?? "").split(/\s+/u)) {
    if (name !== "") {
      keys.push(`.${name}`);
    }
  }
  return keys;
};

const compileMatcher = (
  tokens: readonly Selector[],
): ((element: Element) => boolean) | undefined => {
  try {
    const query = compile<Element, Element>([[...tokens]]);
    return (element) => query(element);
  } catch {
    // Unsupported pseudo-classes etc.: the rule never applies, as in a browser that lacks them.
    return undefined;
  }
};

type Weighted = { readonly declaration: Declaration; readonly rank: readonly number[] };

/** Cascade rank: importance, origin (inverted for !important), specificity, source order. */
const rankOf = (declaration: Declaration, rule: IndexedRule | "inline"): readonly number[] => {
  const origin = rule === "inline" ? 2 : ORIGIN_RANK[rule.origin];
  const [ids, classes, types] = rule === "inline" ? [1000, 0, 0] : rule.specificity;
  const order = rule === "inline" ? Number.MAX_SAFE_INTEGER : rule.order;
  return declaration.important
    ? [1, -origin, ids, classes, types, order]
    : [0, origin, ids, classes, types, order];
};

const compareRank = (a: readonly number[], b: readonly number[]): number => {
  for (let index = 0; index < a.length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

export const createStyleResolver = (
  sources: readonly StyleSheetSource[],
  environment: StyleEnvironment,
): StyleResolver => {
  const index = new Map<string, IndexedRule[]>();
  let order = 0;
  for (const source of sources) {
    for (const rule of source.rules) {
      const matches = compileMatcher(rule.tokens);
      if (matches === undefined) {
        continue;
      }
      const key = ruleKey(rule.tokens);
      const bucket = index.get(key) ?? [];
      bucket.push({
        matches,
        origin: source.origin,
        specificity: rule.specificity,
        order: order++,
        declarations: rule.declarations,
      });
      index.set(key, bucket);
    }
  }

  return (element, parent) => {
    const weighted: Weighted[] = [];
    const seen = new Set<IndexedRule>();
    for (const key of elementKeys(element)) {
      for (const rule of index.get(key) ?? []) {
        if (!seen.has(rule) && rule.matches(element)) {
          seen.add(rule);
          weighted.push(
            ...rule.declarations.map((declaration) => ({
              declaration,
              rank: rankOf(declaration, rule),
            })),
          );
        }
      }
    }
    const inline = element.attribs["style"];
    if (inline !== undefined && inline.trim() !== "") {
      for (const declaration of parseInlineStyle(inline)) {
        weighted.push({ declaration, rank: rankOf(declaration, "inline") });
      }
    }
    weighted.sort((a, b) => compareRank(a.rank, b.rank));
    return computeStyle(
      parent,
      weighted.map((entry) => entry.declaration),
      environment,
    );
  };
};
