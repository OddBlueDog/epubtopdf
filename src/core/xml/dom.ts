import type { AnyNode, Document, Element } from "domhandler";
import { isTag } from "domhandler";
import { textContent } from "domutils";
import { parseDocument } from "htmlparser2";

export type { AnyNode, Document, Element };

/** Parses strict XML (container.xml, OPF, NCX). Tag names keep their case and prefixes. */
export const parseXml = (source: string): Document =>
  parseDocument(source, { xmlMode: true, decodeEntities: true });

/**
 * Parses (X)HTML content leniently: real-world EPUBs are frequently not well-formed,
 * and HTML mode decodes named entities such as `&nbsp;`.
 */
export const parseXhtml = (source: string): Document =>
  parseDocument(source, {
    xmlMode: false,
    decodeEntities: true,
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
    recognizeSelfClosing: true,
    recognizeCDATA: true,
  });

/** Tag name without a namespace prefix, lower-cased (`dc:Title` → `title`). */
export const localName = (element: Element): string => {
  const name = element.name.toLowerCase();
  const colon = name.lastIndexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
};

export const childElements = (node: Document | Element): readonly Element[] =>
  node.children.filter(isTag);

/** Depth-first search for every descendant element accepted by `predicate`. */
export const findAll = (
  node: Document | Element,
  predicate: (element: Element) => boolean,
): readonly Element[] => {
  const found: Element[] = [];
  const stack: Element[] = childElements(node).toReversed();
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (predicate(current)) {
      found.push(current);
    }
    stack.push(...childElements(current).toReversed());
  }
  return found;
};

export const findFirst = (
  node: Document | Element,
  predicate: (element: Element) => boolean,
): Element | undefined => findAll(node, predicate)[0];

export const byLocalName =
  (name: string) =>
  (element: Element): boolean =>
    localName(element) === name;

/** Reads an attribute, also matching namespaced variants (`href` matches `xlink:href`). */
export const attr = (element: Element, name: string): string | undefined => {
  const direct = element.attribs[name];
  if (direct !== undefined) {
    return direct;
  }
  const suffix = `:${name}`;
  for (const [key, value] of Object.entries(element.attribs)) {
    if (key.toLowerCase().endsWith(suffix)) {
      return value;
    }
  }
  return undefined;
};

export const text = (node: AnyNode): string => textContent(node).replaceAll(/\s+/gu, " ").trim();
