import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { openArchive } from "@/core/epub/archive";
import { loadEpub } from "@/core/epub/load-epub";
import { ConversionError } from "@/core/errors";
import { buildEpub, TINY_PNG } from "@/test/epub-builder";

const expectCode = (action: () => unknown, code: ConversionError["code"]): void => {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ConversionError);
    expect(error instanceof ConversionError ? error.code : undefined).toBe(code);
    return;
  }
  expect.unreachable(`expected a ConversionError with code "${code}"`);
};

describe("openArchive", () => {
  it("rejects data that is not a ZIP", () => {
    expectCode(() => openArchive(strToU8("definitely not a zip")), "invalid-archive");
  });

  it("rejects a corrupt ZIP", () => {
    const zip = zipSync({ "a.txt": strToU8("hello world") });
    expectCode(() => openArchive(zip.subarray(0, zip.length - 10)), "invalid-archive");
  });

  it("looks files up case-insensitively and strips a UTF-8 BOM", () => {
    const archive = openArchive(zipSync({ "OEBPS/Text/Ch1.xhtml": strToU8("﻿<p/>") }));
    expect(archive.has("oebps/text/ch1.XHTML")).toBe(true);
    expect(archive.text("OEBPS/Text/Ch1.xhtml")).toBe("<p/>");
    expect(archive.bytes("missing")).toBeUndefined();
  });

  it("decodes UTF-16 documents", () => {
    const utf16 = Uint8Array.from([
      0xff,
      0xfe,
      0x68,
      0x00,
      0xe9,
      0x00, // "hé" in UTF-16LE
    ]);
    expect(openArchive(zipSync({ "a.xhtml": utf16 })).text("a.xhtml")).toBe("hé");
  });
});

describe("loadEpub", () => {
  it("requires META-INF/container.xml", () => {
    expectCode(
      () => loadEpub(zipSync({ mimetype: strToU8("application/epub+zip") })),
      "missing-container",
    );
  });

  it("reads metadata, spine and the EPUB 3 navigation", () => {
    const book = loadEpub(
      buildEpub({
        title: "Dune & Co",
        creators: ["Frank Herbert", "Someone Else"],
        documents: [
          { href: "Text/one.xhtml", body: "<p>1</p>" },
          { href: "Text/two.xhtml", body: "<p>2</p>", linear: false },
        ],
        navList:
          '<li><a href="Text/one.xhtml">One</a><ol><li><a href="Text/one.xhtml#s">Sub</a></li></ol></li>' +
          '<li><span>Heading only</span><ol><li><a href="Text/two.xhtml">Two</a></li></ol></li>',
        files: { "Images/cover.png": TINY_PNG },
        coverImage: "Images/cover.png",
      }),
    );

    expect(book.pkg.metadata).toMatchObject({
      title: "Dune & Co",
      creators: ["Frank Herbert", "Someone Else"],
      language: "en",
    });
    expect(book.pkg.spine.map((entry) => [entry.item.path, entry.linear])).toEqual([
      ["OEBPS/nav.xhtml", false],
      ["OEBPS/Text/one.xhtml", true],
      ["OEBPS/Text/two.xhtml", false],
    ]);
    expect(book.pkg.cover?.path).toBe("OEBPS/Images/cover.png");
    expect(book.toc).toEqual([
      {
        title: "One",
        target: { path: "OEBPS/Text/one.xhtml", fragment: undefined },
        children: [
          { title: "Sub", target: { path: "OEBPS/Text/one.xhtml", fragment: "s" }, children: [] },
        ],
      },
      {
        title: "Heading only",
        target: undefined,
        children: [
          {
            title: "Two",
            target: { path: "OEBPS/Text/two.xhtml", fragment: undefined },
            children: [],
          },
        ],
      },
    ]);
  });
});
