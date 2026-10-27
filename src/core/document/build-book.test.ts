import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { Block, BookDocument, TextRun } from "@/core/document/ast";
import { collectAnchors, forEachBlock } from "@/core/document/ast";
import { buildBookDocument } from "@/core/document/build-book";
import { loadEpub } from "@/core/epub/load-epub";
import { narrow } from "@/test/assertions";
import type { FixtureOptions } from "@/test/epub-builder";
import { buildEpub, TINY_PNG } from "@/test/epub-builder";

const convert = (options: FixtureOptions, includeImages = true): BookDocument =>
  buildBookDocument(loadEpub(buildEpub(options)), {
    includeImages,
    baseFontSize: 11,
    defaultFontFamily: "serif",
  });

const single = (body: string, head = "", files: FixtureOptions["files"] = {}): readonly Block[] =>
  convert({ documents: [{ href: "c.xhtml", body, head }], files }).chapters[0]?.blocks ?? [];

const plain = (runs: readonly TextRun[]): string => runs.map((run) => run.text).join("");

describe("xhtml → blocks", () => {
  it("maps headings, paragraphs and inline marks", () => {
    const [heading, paragraph] = single(
      "<h2>Title</h2><p>A <em>b</em> <strong>c</strong> <code>d</code></p>",
    );
    expect(heading).toMatchObject({ kind: "heading", level: 2 });
    expect(
      narrow(paragraph, "paragraph").content.map((run) => [
        run.text,
        run.marks.italic,
        run.marks.bold,
        run.marks.mono,
      ]),
    ).toEqual([
      ["A ", false, false, false],
      ["b", true, false, false],
      [" ", false, false, false],
      ["c", false, true, false],
      [" ", false, false, false],
      ["d", false, false, true],
    ]);
  });

  it("applies class-based CSS hints and hides display:none", () => {
    const blocks = single(
      '<p class="c">Centered <span class="i">italic</span></p><div class="h">secret</div>',
      '<link rel="stylesheet" href="s.css"/>',
      { "s.css": ".c { text-align: center } .i { font-style: italic } .h { display: none }" },
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "paragraph", align: "center" });
    expect(narrow(blocks[0], "paragraph").content.at(-1)).toMatchObject({
      text: "italic",
      marks: { italic: true },
    });
  });

  it("skips scripts and styles", () => {
    expect(single("<script>alert(1)</script><style>p{}</style><p>ok</p>")).toEqual([
      expect.objectContaining({
        kind: "paragraph",
        content: [expect.objectContaining({ text: "ok" })],
      }),
    ]);
  });

  it("builds nested lists with a start number", () => {
    const [list] = single('<ol start="4"><li>a</li><li>b<ul><li>c</li></ul></li></ol>');
    expect(list).toMatchObject({ kind: "list", ordered: true, start: 4 });
    expect(narrow(list, "list").items).toHaveLength(2);
    expect(narrow(list, "list").items[1]?.[1]).toMatchObject({ kind: "list", ordered: false });
  });

  it("preserves whitespace in preformatted code", () => {
    expect(single("<pre>  a\n    b\n</pre>")).toEqual([
      expect.objectContaining({ kind: "code", text: "  a\n    b" }),
    ]);
  });

  it("normalises tables with header rows", () => {
    const [table] = single(
      "<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tr><td>x</td></tr></table>",
    );
    expect(
      narrow(table, "table").rows.map((row) =>
        row.map((cell) => [plain(cell.content), cell.header]),
      ),
    ).toEqual([
      [
        ["H1", true],
        ["H2", true],
      ],
      [["x", false]],
    ]);
  });

  it("extracts images that exist, including SVG-wrapped covers, and drops missing ones", () => {
    const blocks = single(
      '<img src="a.png" alt="A"/><img src="missing.png"/><svg><image xlink:href="a.png"/></svg>',
      "",
      { "a.png": TINY_PNG },
    );
    expect(blocks).toEqual([
      expect.objectContaining({ kind: "image", path: "OEBPS/a.png", alt: "A" }),
      expect.objectContaining({ kind: "image", path: "OEBPS/a.png" }),
    ]);
  });

  it("omits images when disabled", () => {
    const book = convert(
      {
        documents: [{ href: "c.xhtml", body: '<p>t</p><img src="a.png"/>' }],
        files: { "a.png": TINY_PNG },
      },
      false,
    );
    expect(book.chapters[0]?.blocks.map((block) => block.kind)).toEqual(["paragraph"]);
  });

  it("only renders the fallback branch of epub:switch", () => {
    expect(
      single(
        "<epub:switch><epub:case>MathML</epub:case><epub:default><p>fallback</p></epub:default></epub:switch>",
      ),
    ).toEqual([
      expect.objectContaining({ content: [expect.objectContaining({ text: "fallback" })] }),
    ]);
  });
});

describe("links and anchors", () => {
  const book = convert({
    documents: [
      {
        href: "a.xhtml",
        body:
          '<p>See <a href="b.xhtml#note">note</a>, <a href="https://x.org">web</a>, ' +
          '<a href="javascript:alert(1)">bad</a> and <a href="nowhere.xhtml#x">gone</a>.</p>',
      },
      {
        href: "b.xhtml",
        body: '<p id="note">Note</p><p id="note">Duplicate</p><p><span id="inline"/>Text</p>',
      },
    ],
  });

  const links = book.chapters
    .flatMap((chapter) => chapter.blocks)
    .flatMap((block) => (block.kind === "paragraph" ? block.content : []))
    .flatMap((run) => (run.link === undefined ? [] : [[run.text, run.link]]));

  it("resolves internal links to anchors and keeps only safe external links", () => {
    expect(links).toEqual([
      ["note", { kind: "internal", anchor: "f1#note" }],
      ["web", { kind: "external", url: "https://x.org" }],
    ]);
  });

  it("claims every anchor at most once, even with duplicate ids", () => {
    const anchors = book.chapters.flatMap((chapter) => {
      const all: string[] = [];
      forEachBlock(chapter.blocks, (block) => {
        all.push(...block.anchors);
      });
      return all;
    });
    expect(anchors).toEqual(["f1#note", "f1#inline"]);
    expect(new Set(anchors).size).toBe(anchors.length);
  });
});

describe("book structure", () => {
  it("drops a cover-only first chapter and the non-linear nav document", () => {
    const book = convert({
      documents: [
        { href: "cover.xhtml", body: '<img src="c.png"/>' },
        { href: "one.xhtml", body: "<h1>One</h1>" },
      ],
      files: { "c.png": TINY_PNG },
      coverImage: "c.png",
      navList: '<li><a href="one.xhtml">One</a></li>',
    });
    expect(book.coverPath).toBe("OEBPS/c.png");
    expect(book.chapters.map((chapter) => chapter.path)).toEqual(["OEBPS/one.xhtml"]);
  });

  it("puts non-linear documents after the reading order", () => {
    const book = convert({
      documents: [
        { href: "notes.xhtml", body: "<p>notes</p>", linear: false },
        { href: "main.xhtml", body: "<p>main</p>" },
      ],
    });
    expect(book.chapters.map((chapter) => chapter.path)).toEqual([
      "OEBPS/main.xhtml",
      "OEBPS/notes.xhtml",
    ]);
  });

  it("resolves the outline and falls back from missing fragments to their file", () => {
    const book = convert({
      documents: [{ href: "one.xhtml", body: '<h1 id="t">One</h1>' }],
      navList:
        '<li><a href="one.xhtml#t">Real</a></li><li><a href="one.xhtml#missing">Fallback</a></li>',
    });
    expect(book.outline.map((entry) => [entry.title, entry.anchor])).toEqual([
      ["Real", "f0#t"],
      ["Fallback", "f0"],
    ]);
  });

  it("derives an outline from headings when there is no TOC", () => {
    const book = convert({
      documents: [
        { href: "a.xhtml", body: "<h1>First</h1><p>x</p>" },
        { href: "b.xhtml", body: "<p>no heading</p>" },
      ],
    });
    expect(book.outline.map((entry) => entry.title)).toEqual(["First"]);
  });

  it("fails clearly on a book without content", () => {
    expect(() => convert({ documents: [{ href: "empty.xhtml", body: "   " }] })).toThrow(
      /does not contain/u,
    );
  });

  test.prop([fc.array(fc.string(), { minLength: 1, maxLength: 5 })])(
    "every outline anchor points at an emitted destination",
    (titles) => {
      const book = convert({
        documents: titles.map((title, index) => ({
          href: `c${index}.xhtml`,
          body: `<h1 id="h">${title.replaceAll("<", "&lt;").replaceAll("&", "&amp;")}</h1><p>body</p>`,
        })),
        navList: titles
          .map((_, index) => `<li><a href="c${index}.xhtml#h">T${index}</a></li>`)
          .join(""),
      });
      const destinations = new Set(
        book.chapters.flatMap((chapter) => [chapter.anchor, ...collectAnchors(chapter.blocks)]),
      );
      for (const entry of book.outline) {
        expect(destinations.has(entry.anchor)).toBe(true);
      }
    },
  );
});

describe("publisher styles", () => {
  const book = convert({
    documents: [
      {
        href: "c.xhtml",
        head: '<link rel="stylesheet" href="book.css"/>',
        body:
          '<div class="chapter"><h1>Title</h1><p class="first">Opening</p><p>Body <span class="sc">caps</span></p></div>' +
          '<ul class="plain"><li id="item">one</li></ul>',
      },
    ],
    files: {
      "book.css": [
        '@font-face { font-family: "Book Serif"; src: url(fonts/serif.otf); }',
        '@font-face { font-family: "Book Serif"; font-weight: bold; src: url(fonts/missing.otf); }',
        'body { font-family: "Book Serif", serif; }',
        ".chapter { margin-left: 2em; margin-top: 3em; }",
        "p { text-indent: 1.5em; margin: 0; line-height: 1.6; }",
        "p.first { text-indent: 0; }",
        "h1 { font-size: 1.5em; text-align: center; color: #336699; }",
        ".sc { font-variant: small-caps; letter-spacing: 1px; }",
        "ul.plain { list-style: none; }",
      ].join("\n"),
      "fonts/serif.otf": TINY_PNG,
    },
  });
  const blocks = book.chapters[0]?.blocks ?? [];

  it("collects @font-face rules whose files exist", () => {
    expect(book.fontFaces).toEqual([
      { family: "book serif", path: "OEBPS/fonts/serif.otf", weight: 400, italic: false },
    ]);
  });

  it("computes block typography and spacing from the cascade", () => {
    const [heading, first, second] = blocks;
    expect(narrow(heading, "heading").style).toMatchObject({
      fontSize: 16.5,
      color: "#336699",
      indentLeft: 22,
    });
    expect(narrow(heading, "heading").align).toBe("center");
    // The chapter's 3em top margin collapses into its first block.
    expect(heading?.style.marginTop).toBeGreaterThanOrEqual(33);
    expect(narrow(first, "paragraph").style).toMatchObject({
      textIndent: 0,
      lineHeight: 1.6,
      indentLeft: 22,
    });
    expect(narrow(second, "paragraph").style.textIndent).toBeCloseTo(16.5);
    expect(narrow(second, "paragraph").style.fontFamilies).toEqual(["book serif", "serif"]);
  });

  it("carries run-level styles and marks", () => {
    const run = narrow(blocks[2], "paragraph").content.at(-1);
    expect(run).toMatchObject({ text: "caps", marks: { smallCaps: true } });
    expect(run?.style.letterSpacing).toBeCloseTo(11 / 16);
  });

  it("keeps list styling and anchors on list items", () => {
    const list = narrow(blocks[3], "list");
    expect(list.listStyle).toBe("none");
    expect(list.items[0]?.[0]?.anchors).toEqual(["f0#item"]);
  });
});
