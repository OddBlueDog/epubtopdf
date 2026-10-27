import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { loadEpub } from "@/core/epub/load-epub";
import {
  buildPrintDocument,
  retargetSelectors,
  rewriteCssUrls,
} from "@/core/print/build-print-document";
import type { ConversionSettings } from "@/core/settings";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { buildEpub, TINY_PNG } from "@/test/epub-builder";

const resourceUrl = (path: string): string => `blob:test/${path}`;

const print = (overrides: Partial<ConversionSettings> = {}): string =>
  buildPrintDocument(
    loadEpub(
      buildEpub({
        title: "Print & <Test>",
        documents: [
          {
            href: "Text/one.xhtml",
            head: '<link rel="stylesheet" href="../Styles/book.css"/><style>p > em { color: red } </style>',
            body:
              '<h1 id="top" onclick="steal()">One</h1><script>alert(1)</script>' +
              '<p><a href="two.xhtml#n">next</a> <a href="https://example.com">web</a> ' +
              '<a href="javascript:alert(1)">bad</a></p>' +
              '<img src="../Images/a.png"/><img src="https://tracker.example/pixel.gif"/>' +
              '<iframe src="x.html"></iframe>',
          },
          { href: "Text/two.xhtml", body: '<p id="n">Two</p>' },
          { href: "Text/aside.xhtml", body: "<p>non-linear</p>", linear: false },
        ],
        files: {
          "Styles/book.css":
            '@import "base.css"; body { font-family: "Book Serif" } h1 { background: url(../Images/a.png) }',
          "Styles/base.css": "html body p { text-indent: 1em }",
          "Images/a.png": TINY_PNG,
        },
      }),
    ),
    { settings: { ...DEFAULT_SETTINGS, pageSize: "a5", marginMm: 12, ...overrides }, resourceUrl },
  );

describe("buildPrintDocument", () => {
  const html = print();

  it("removes scripts, frames and event handlers", () => {
    expect(html).not.toMatch(/<script|<iframe|onclick|javascript:/iu);
  });

  it("routes book resources through the resolver and drops remote ones", () => {
    expect(html).toContain('src="blob:test/OEBPS/Images/a.png"');
    expect(html).not.toContain("tracker.example");
    expect(html).toContain('url("blob:test/OEBPS/Images/a.png")');
  });

  it("keeps safe external links and re-targets internal ones to namespaced ids", () => {
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#d1-n"');
    expect(html).toContain('id="d1-n"');
    expect(html).toContain('id="d0-top"');
  });

  it("only includes linear documents, each in its own page-broken wrapper", () => {
    expect(html).not.toContain("non-linear");
    expect(html.match(/class="epub-body/gu)).toHaveLength(2);
    expect(html).toContain(".epub-body + .epub-body { break-before: page; }");
  });

  it("inlines @imports, re-targets body selectors and keeps child combinators intact", () => {
    expect(html).toContain(".epub-body p { text-indent: 1em }");
    expect(html).toContain('.epub-body { font-family: "Book Serif" }');
    expect(html).toContain("p > em { color: red }");
  });

  it("sizes pages but keeps the book's margins and text size by default", () => {
    expect(html).toContain("@page { size: 148mm 210mm; }");
    expect(html).not.toContain("zoom:");
    expect(html).toContain("<title>Print &amp; &lt;Test&gt;</title>");
  });

  it("imposes margins and text scale only when the user overrides them", () => {
    const overridden = print({ overrideMargins: true, overrideTextSize: true, fontSizePt: 15 });
    expect(overridden).toContain("@page { size: 148mm 210mm; margin: 12mm; }");
    expect(overridden).toContain("html { zoom: 1.2500; }");
  });
});

describe("rewriteCssUrls", () => {
  it("leaves data URIs and fragments alone and blanks unresolvable references", () => {
    const css =
      "a{background:url(data:image/png;base64,AA)} b{mask:url(#m)} c{src:url(http://x/y.ttf)}";
    expect(rewriteCssUrls(css, "s.css", () => undefined)).toBe(
      "a{background:url(data:image/png;base64,AA)} b{mask:url(#m)} c{src:url()}",
    );
  });

  test.prop([fc.string()])("never throws", (css) => {
    expect(() => rewriteCssUrls(css, "a/b.css", resourceUrl)).not.toThrow();
  });
});

describe("retargetSelectors", () => {
  it.each([
    ["body { x }", ".epub-body { x }"],
    ["body.calibre p { x }", ".epub-body.calibre p { x }"],
    ["html body { x }", ".epub-body { x }"],
    ["div,body>p { x }", "div,.epub-body>p { x }"],
    [".nobody { x }", ".nobody { x }"],
    ["tbody td { x }", "tbody td { x }"],
  ])("%s → %s", (input, expected) => {
    expect(retargetSelectors(input)).toBe(expected);
  });
});
