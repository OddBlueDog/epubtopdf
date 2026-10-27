import { render } from "dom-serializer";
/**
 * Builds a single, self-contained HTML document from an EPUB's original XHTML and CSS, for
 * the browser's own layout engine to print. Nothing is re-styled: this is the book exactly
 * as a web view renders it, paginated with the user's page size and margins.
 *
 * Pure: resource URLs come from an injected resolver (the UI provides `blob:` URLs).
 */
import { isTag, isText } from "domhandler";
import { textContent } from "domutils";

import type { EpubBook } from "@/core/epub/load-epub";
import { isExternalHref, resolveHref } from "@/core/epub/paths";
import type { ConversionSettings } from "@/core/settings";
import {
  CSS_MEDIUM_PT,
  effectiveBaseFontSize,
  PAGE_SIZES,
  usesCustomMargins,
} from "@/core/settings";
import type { AnyNode, Element } from "@/core/xml/dom";
import { attr, byLocalName, findAll, findFirst, localName, parseXhtml } from "@/core/xml/dom";

/** Maps an archive path to a URL the printing document can load. */
export type ResourceUrl = (path: string) => string | undefined;

export type PrintOptions = {
  readonly settings: Pick<
    ConversionSettings,
    "layout" | "pageSize" | "overrideMargins" | "marginMm" | "overrideTextSize" | "fontSizePt"
  >;
  readonly resourceUrl: ResourceUrl;
};

const CONTENT_TYPES = new Set(["application/xhtml+xml", "text/html", "application/html"]);

/** Elements that could execute code or load active content. */
const DANGEROUS_ELEMENTS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "frame",
  "frameset",
  "base",
  "form",
]);

const BODY_CLASS = "epub-body";

const SAFE_EXTERNAL = /^(?:https?:|mailto:)/iu;

const URL_IN_CSS = /url\(\s*(["']?)([^"')]+?)\1\s*\)/giu;

const IMPORT_IN_CSS = /@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1\s*\)?[^;]*;/giu;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Rewrites `url()` references relative to `basePath`; unresolvable ones are dropped. */
export const rewriteCssUrls = (css: string, basePath: string, resourceUrl: ResourceUrl): string =>
  css.replaceAll(URL_IN_CSS, (whole, _quote: string, target: string) => {
    if (target.startsWith("data:") || target.startsWith("#")) {
      return whole;
    }
    const resolved = resolveHref(basePath, target);
    const url = resolved === undefined ? undefined : resourceUrl(resolved.path);
    return url === undefined ? "url()" : `url("${url}")`;
  });

/**
 * Re-targets document-level selectors: each chapter's `<body>` becomes a wrapper `<div>`,
 * so `body`/`html` selectors must match that wrapper instead.
 */
export const retargetSelectors = (css: string): string =>
  css.replaceAll(/(^|[\s,>+~(}])(?:html\s+)?body(?=[\s.#:[>+~),{]|$)/gmu, `$1.${BODY_CLASS}`);

/** Inlines `@import`s (depth-limited) and rewrites URLs, yielding one stylesheet text. */
const loadStylesheet = (
  book: EpubBook,
  path: string,
  resourceUrl: ResourceUrl,
  depth = 0,
): string => {
  const css = book.archive.text(path) ?? "";
  const withImports =
    depth >= 4
      ? css.replaceAll(IMPORT_IN_CSS, "")
      : css.replaceAll(IMPORT_IN_CSS, (_whole, _quote: string, target: string) => {
          const resolved = resolveHref(path, target);
          return resolved === undefined
            ? ""
            : loadStylesheet(book, resolved.path, resourceUrl, depth + 1);
        });
  return retargetSelectors(rewriteCssUrls(withImports, path, resourceUrl));
};

type DocumentRef = { readonly path: string; readonly index: number };

const anchorId = (document: DocumentRef, fragment?: string): string =>
  fragment === undefined ? `d${document.index}` : `d${document.index}-${fragment}`;

/** Sanitises and re-targets one document's DOM in place. */
const prepareBody = (
  body: Element,
  document: DocumentRef,
  documentIndex: ReadonlyMap<string, number>,
  resourceUrl: ResourceUrl,
): void => {
  const remove: Element[] = [];
  for (const element of findAll(body, () => true)) {
    const name = localName(element);
    if (DANGEROUS_ELEMENTS.has(name)) {
      remove.push(element);
      continue;
    }
    for (const attribute of Object.keys(element.attribs)) {
      if (attribute.toLowerCase().startsWith("on")) {
        delete element.attribs[attribute];
      }
    }
    const id = element.attribs["id"];
    if (id !== undefined) {
      element.attribs["id"] = anchorId(document, id);
    }
    const style = element.attribs["style"];
    if (style !== undefined) {
      element.attribs["style"] = rewriteCssUrls(style, document.path, resourceUrl);
    }
    rewriteReferences(element, name, document, documentIndex, resourceUrl);
  }
  for (const element of remove) {
    const siblings = element.parent?.children;
    siblings?.splice(siblings.indexOf(element), 1);
  }
};

const rewriteReferences = (
  element: Element,
  name: string,
  document: DocumentRef,
  documentIndex: ReadonlyMap<string, number>,
  resourceUrl: ResourceUrl,
): void => {
  for (const attribute of ["src", "href", "xlink:href", "poster"]) {
    const value = element.attribs[attribute];
    if (value === undefined) {
      continue;
    }
    if (isExternalHref(value.trim())) {
      // Links may point out of the book; resources may not (no network access when printing).
      if (!(name === "a" && SAFE_EXTERNAL.test(value.trim()))) {
        delete element.attribs[attribute];
      }
      continue;
    }
    const target = resolveHref(document.path, value);
    if (target === undefined) {
      continue;
    }
    const linkedDocument = documentIndex.get(target.path);
    if (name === "a" && linkedDocument !== undefined) {
      element.attribs[attribute] =
        `#${anchorId({ path: target.path, index: linkedDocument }, target.fragment)}`;
      continue;
    }
    const url = name === "a" ? undefined : resourceUrl(target.path);
    if (url === undefined) {
      delete element.attribs[attribute];
    } else {
      element.attribs[attribute] = url;
    }
  }
  delete element.attribs["srcset"];
};

/**
 * Page box and layout glue. Margins and text size are only imposed when the user chose to
 * override them; otherwise the book's own `@page` rule and sizes apply.
 */
const printStylesheet = (settings: PrintOptions["settings"]): string => {
  const page = PAGE_SIZES[settings.pageSize];
  const margin = usesCustomMargins(settings) ? ` margin: ${settings.marginMm}mm;` : "";
  const scale = effectiveBaseFontSize(settings) / CSS_MEDIUM_PT;
  return `
@page { size: ${page.widthMm}mm ${page.heightMm}mm;${margin} }${
    scale === 1 ? "" : `\nhtml { zoom: ${scale.toFixed(4)}; }`
  }
html, body { margin: 0 !important; padding: 0 !important; background: none !important; }
.${BODY_CLASS} { display: block; }
.${BODY_CLASS} + .${BODY_CLASS} { break-before: page; }
img, svg, video { max-width: 100%; }
img { height: auto; }
/* Full-page SVG covers size themselves against the viewport. */
.${BODY_CLASS} > svg:only-child, .${BODY_CLASS} > div:only-child > svg:only-child { width: 100%; height: 96vh; }
`;
};

/** CSS goes into <style> elements, so it must not be able to close them. */
const styleBlock = (css: string): string =>
  `<style>${css.replaceAll(/<\/style/giu, "<\\/style")}</style>`;

/** Assembles the printable HTML document. */
export const buildPrintDocument = (
  book: EpubBook,
  { settings, resourceUrl }: PrintOptions,
): string => {
  const documents = book.pkg.spine
    .filter((entry) => entry.linear && CONTENT_TYPES.has(entry.item.mediaType))
    .map((entry, index): DocumentRef => ({ path: entry.item.path, index }));
  const documentIndex = new Map(documents.map((document) => [document.path, document.index]));

  const stylesheets = new Map<string, string>();
  const inlineStyles: string[] = [];
  const bodies: string[] = [];

  for (const document of documents) {
    const source = book.archive.text(document.path);
    const root = source === undefined ? undefined : parseXhtml(source);
    const body = root === undefined ? undefined : findFirst(root, byLocalName("body"));
    if (root === undefined || body === undefined) {
      continue;
    }
    for (const element of findAll(root, (node) => node.name === "link" || node.name === "style")) {
      if (element.name === "style") {
        const css = textContent(element);
        inlineStyles.push(retargetSelectors(rewriteCssUrls(css, document.path, resourceUrl)));
      } else if ((attr(element, "rel") ?? "").toLowerCase().includes("stylesheet")) {
        const target = resolveHref(document.path, attr(element, "href") ?? "");
        if (target !== undefined && !stylesheets.has(target.path)) {
          stylesheets.set(target.path, loadStylesheet(book, target.path, resourceUrl));
        }
      }
    }
    prepareBody(body, document, documentIndex, resourceUrl);
    const bodyClass = [BODY_CLASS, attr(body, "class") ?? ""].join(" ").trim();
    const bodyStyle = attr(body, "style");
    const children = body.children.filter((child: AnyNode) => isTag(child) || isText(child));
    bodies.push(
      `<div id="${anchorId(document)}" class="${escapeHtml(bodyClass)}"${
        bodyStyle === undefined ? "" : ` style="${escapeHtml(bodyStyle)}"`
      }>${render(children, { encodeEntities: "utf8" })}</div>`,
    );
  }

  const title = book.pkg.metadata.title ?? "Book";
  const language = book.pkg.metadata.language ?? "en";
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(language)}"><head><meta charset="utf-8">`,
    `<title>${escapeHtml(title)}</title>`,
    ...[...stylesheets.values(), ...inlineStyles].map((css) => styleBlock(css)),
    styleBlock(printStylesheet(settings)),
    `</head><body>${bodies.join("\n")}</body></html>`,
  ].join("\n");
};
