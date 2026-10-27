import { fc, test } from "@fast-check/vitest";
import type { Content } from "pdfmake/interfaces";
import { describe, expect, it } from "vitest";

import type { BookDocument } from "@/core/document/ast";
import { buildBookDocument } from "@/core/document/build-book";
import { loadEpub } from "@/core/epub/load-epub";
import { buildDocumentDefinition } from "@/core/pdf/document-definition";
import { createFontLibrary } from "@/core/pdf/font-library";
import type { EmbeddedImage } from "@/core/pdf/render-blocks";
import type { ConversionSettings } from "@/core/settings";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { buildEpub, TINY_PNG } from "@/test/epub-builder";

const book: BookDocument = buildBookDocument(
  loadEpub(
    buildEpub({
      documents: [
        { href: "cover.xhtml", body: '<img src="cover.png"/>' },
        {
          href: "one.xhtml",
          body: '<h1 id="a">One</h1><p id="p1"><span id="extra"/>Text <a href="two.xhtml">two</a></p>',
        },
        { href: "two.xhtml", body: "<h1>Two</h1><p>More</p>" },
      ],
      files: { "cover.png": TINY_PNG },
      coverImage: "cover.png",
      navList:
        '<li><a href="one.xhtml">Part</a><ol><li><a href="one.xhtml#a">One</a></li></ol></li><li><a href="two.xhtml">Two</a></li>',
    }),
  ),
  { includeImages: true, baseFontSize: 11, defaultFontFamily: "serif" },
);

const images = new Map<string, EmbeddedImage>([
  ["OEBPS/cover.png", { key: "images/0", width: 600, height: 800 }],
]);

const define = (settings: Partial<ConversionSettings> = {}) =>
  buildDocumentDefinition({
    fonts: createFontLibrary({
      loadBuiltin: () => Promise.reject(new Error("fonts are not loaded in this test")),
      bookFonts: new Map(),
      mode: settings.layout ?? "publisher",
      defaultFamily: "serif",
    }),
    book,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    images,
    fallbackTitle: "fallback",
  });

/** Every object node in a pdfmake content tree. */
const nodesOf = (content: unknown): Record<string, unknown>[] => {
  if (Array.isArray(content)) {
    return content.flatMap((item) => nodesOf(item));
  }
  if (typeof content !== "object" || content === null) {
    return [];
  }
  const node: Record<string, unknown> = { ...content };
  return [node, ...Object.values(node).flatMap((value) => nodesOf(value))];
};

const idsOf = (content: unknown): string[] =>
  nodesOf(content).flatMap((node) => (typeof node["id"] === "string" ? [node["id"]] : []));

const references = (settings: Partial<ConversionSettings>) =>
  nodesOf(define(settings).content).filter((node) => "pageReference" in node);

const breaks = (chapterPageBreaks: boolean): number =>
  nodesOf(define({ chapterPageBreaks }).content).filter((node) => node["pageBreak"] === "before")
    .length;

const linkTargetsOf = (content: unknown): string[] =>
  nodesOf(content).flatMap((node) =>
    typeof node["linkToDestination"] === "string" ? [node["linkToDestination"]] : [],
  );

describe("buildDocumentDefinition", () => {
  it("carries metadata into the PDF info dictionary", () => {
    expect(define().info).toMatchObject({ title: "Fixture Book", author: "Test Author" });
  });

  it("paints the cover as a page-1 background only", () => {
    const { background } = define();
    expect(background).toBeTypeOf("function");
    const paint = background as Exclude<typeof background, Content | undefined>; // oxlint-disable-line typescript/no-unsafe-type-assertion
    const pageSize = { width: 595, height: 842, orientation: "portrait" as const };
    expect(paint(1, pageSize)).toMatchObject({ image: "images/0" });
    expect(paint(2, pageSize)).toBeNull();
    expect(define({ includeCover: false }).background).toBeUndefined();
  });

  it("registers every embedded image with the renderer", () => {
    expect(define().images).toEqual({ "images/0": "images/0" });
  });

  it("emits a linked contents page only when enabled", () => {
    expect(references({ includeToc: true }).map((node) => node["pageReference"])).toEqual([
      "f1",
      "f1#a",
      "f2",
    ]);
    expect(references({ includeToc: false })).toEqual([]);
  });

  it("nests bookmarks under their parents", () => {
    const outlines = nodesOf(define().content).filter((node) => node["outline"] === true);
    expect(outlines.map((node) => [node["outlineText"], node["outlineParentId"]])).toEqual([
      ["Part", undefined],
      ["One", "outline-0"],
      ["Two", undefined],
    ]);
  });

  it("starts chapters on new pages only when requested", () => {
    // cover → toc → chapter 1 always break; chapter 2 only with the setting.
    expect(breaks(true)).toBe(3);
    expect(breaks(false)).toBe(2);
  });

  it("only links to destinations that exist", () => {
    const targets = linkTargetsOf(define().content);
    const ids = new Set(idsOf(define().content));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(ids.has(target)).toBe(true);
    }
  });

  test.prop([
    fc.record({
      includeCover: fc.boolean(),
      includeToc: fc.boolean(),
      pageNumbers: fc.boolean(),
      chapterPageBreaks: fc.boolean(),
      fontFamily: fc.constantFrom("serif" as const, "sans" as const),
    }),
  ])("never emits duplicate destination ids (pdfmake rejects them)", (settings) => {
    const ids = idsOf(define(settings).content);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
