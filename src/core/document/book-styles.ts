import { isTag } from "domhandler";
import { textContent } from "domutils";

import type { StyleResolver, StyleSheetSource } from "@/core/css/cascade";
import { createStyleResolver } from "@/core/css/cascade";
import type { ComputedStyle, Declaration, StyleEnvironment } from "@/core/css/computed-style";
import { rootStyle } from "@/core/css/computed-style";
import type { ParsedStylesheet } from "@/core/css/stylesheet";
import { parseStylesheet } from "@/core/css/stylesheet";
import { USER_AGENT_RULES } from "@/core/css/user-agent";
import { expandBox } from "@/core/css/values";
import type { EmbeddedFontFace, PageMargins } from "@/core/document/ast";
import type { EpubArchive } from "@/core/epub/archive";
import { resolveHref } from "@/core/epub/paths";
import type { Document, Element } from "@/core/xml/dom";
import { attr, findAll } from "@/core/xml/dom";

/** A parsed stylesheet plus the path its relative URLs resolve against. */
type LoadedSheet = {
  readonly key: string;
  readonly basePath: string;
  readonly sheet: ParsedStylesheet;
};

export type DocumentStyles = {
  readonly resolve: StyleResolver;
  /** Computed style of `<body>` (through `<html>`), the root for the walker. */
  readonly bodyStyle: (body: Element) => ComputedStyle;
};

export type BookStyles = {
  readonly forDocument: (document: Document, documentPath: string) => DocumentStyles;
  /** Every `@font-face` seen so far, de-duplicated. */
  readonly fontFaces: () => readonly EmbeddedFontFace[];
  /** Page margins from `@page` rules seen so far (later rules win), if any. */
  readonly pageMargins: () => PageMargins | undefined;
};

const PAGE_SIDES = ["top", "right", "bottom", "left"] as const;

/** Applies `margin` / `margin-*` declarations from an `@page` rule onto `margins`. */
const applyPageDeclarations = (
  margins: PageMargins,
  declarations: readonly Declaration[],
): PageMargins => {
  let next = margins;
  for (const { property, value } of declarations) {
    if (property === "margin") {
      const sides = expandBox(value);
      if (sides !== undefined) {
        next = Object.fromEntries(PAGE_SIDES.map((side, index) => [side, sides[index]]));
      }
      continue;
    }
    const side = PAGE_SIDES.find((candidate) => property === `margin-${candidate}`);
    if (side !== undefined) {
      next = { ...next, [side]: value };
    }
  }
  return next;
};

const MAX_IMPORT_DEPTH = 4;

const isStylesheetLink = (element: Element): boolean =>
  element.name === "link" &&
  (attr(element, "rel") ?? "").toLowerCase().split(/\s+/u).includes("stylesheet");

/**
 * Loads and caches the book's CSS. Stylesheets are parsed once per file; resolvers are
 * shared between documents that use the same sheets (usually all of them).
 */
export const createBookStyles = (
  archive: EpubArchive,
  environment: StyleEnvironment,
): BookStyles => {
  const sheetCache = new Map<string, readonly LoadedSheet[]>();
  const resolverCache = new Map<string, StyleResolver>();
  const fontFaces = new Map<string, EmbeddedFontFace>();
  const seenSheets = new Set<string>();
  let pageMargins: PageMargins = {};

  const registerFontFaces = ({ sheet, basePath }: LoadedSheet): void => {
    for (const face of sheet.fontFaces) {
      const path = face.sources
        .map((source) => resolveHref(basePath, source)?.path)
        .find((candidate) => candidate !== undefined && archive.has(candidate));
      const key = `${face.family}|${face.weight}|${face.italic}`;
      if (path !== undefined && !fontFaces.has(key)) {
        fontFaces.set(key, { family: face.family, path, weight: face.weight, italic: face.italic });
      }
    }
  };

  /** A sheet file, preceded by its `@import`s (depth-limited against cycles). */
  const loadFile = (path: string, depth: number): readonly LoadedSheet[] => {
    const cached = sheetCache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const css = archive.text(path);
    if (css === undefined) {
      return [];
    }
    const sheet = parseStylesheet(css);
    const imports =
      depth >= MAX_IMPORT_DEPTH
        ? []
        : sheet.imports.flatMap((target) => {
            const resolved = resolveHref(path, target);
            return resolved === undefined ? [] : loadFile(resolved.path, depth + 1);
          });
    const loaded: readonly LoadedSheet[] = [...imports, { key: path, basePath: path, sheet }];
    sheetCache.set(path, loaded);
    return loaded;
  };

  const sheetsOf = (document: Document, documentPath: string): readonly LoadedSheet[] =>
    findAll(document, (element) => element.name === "style" || isStylesheetLink(element)).flatMap(
      (element): readonly LoadedSheet[] => {
        if (element.name === "style") {
          const css = textContent(element);
          return [{ key: `inline:${css}`, basePath: documentPath, sheet: parseStylesheet(css) }];
        }
        const target = resolveHref(documentPath, attr(element, "href") ?? "");
        return target === undefined ? [] : loadFile(target.path, 0);
      },
    );

  const initial = rootStyle(environment);

  return {
    forDocument: (document, documentPath) => {
      const sheets = sheetsOf(document, documentPath);
      for (const sheet of sheets) {
        if (!seenSheets.has(sheet.key)) {
          seenSheets.add(sheet.key);
          registerFontFaces(sheet);
          pageMargins = applyPageDeclarations(pageMargins, sheet.sheet.pageDeclarations);
        }
      }
      const key = sheets.map((sheet) => sheet.key).join("\u0000");
      let resolve = resolverCache.get(key);
      if (resolve === undefined) {
        const sources: StyleSheetSource[] = [
          { origin: "user-agent", rules: USER_AGENT_RULES },
          ...sheets.map(({ sheet }): StyleSheetSource => ({
            origin: "author",
            rules: sheet.rules,
          })),
        ];
        resolve = createStyleResolver(sources, environment);
        resolverCache.set(key, resolve);
      }
      const resolver = resolve;
      return {
        resolve: resolver,
        bodyStyle: (body) => {
          const html = body.parent !== null && isTag(body.parent) ? body.parent : undefined;
          const htmlStyle = html === undefined ? initial : resolver(html, initial);
          return resolver(body, htmlStyle);
        },
      };
    },
    fontFaces: () => [...fontFaces.values()],
    pageMargins: () => (Object.keys(pageMargins).length === 0 ? undefined : pageMargins),
  };
};
