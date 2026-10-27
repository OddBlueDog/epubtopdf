import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { openArchive } from "@/core/epub/archive";
import { obfuscationKey, xorHead } from "@/core/epub/font-obfuscation";
import { isSupportedFont, loadBookFonts } from "@/core/pdf/book-fonts";
import type { FontFamilyFiles } from "@/core/pdf/font-library";
import { createFontLibrary } from "@/core/pdf/font-library";
import type { FontVariant } from "@/core/pdf/fonts";
import { FONT_NAMES, FONT_VARIANTS } from "@/core/pdf/fonts";

const METADATA = { identifiers: ["urn:uuid:x"], uniqueIdentifier: "urn:uuid:x" };

/** Bytes that pass the TrueType signature check, tagged so tests can tell faces apart. */
const fakeFont = (tag: number): Uint8Array => Uint8Array.from([0x00, 0x01, 0x00, 0x00, tag]);

/** The tag byte of each variant's font file. */
const read = async (files: FontFamilyFiles | undefined): Promise<Record<FontVariant, number>> => {
  if (files === undefined) {
    throw new Error("family not loaded");
  }
  const tags = await Promise.all(
    FONT_VARIANTS.map(async (variant) => [variant, (await files[variant]())[4] ?? -1] as const),
  );
  return Object.fromEntries(tags) as Record<FontVariant, number>; // oxlint-disable-line typescript/no-unsafe-type-assertion
};

/** IDPF-obfuscates bytes the way a publisher's toolchain would. */
const obfuscate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const key = await obfuscationKey("idpf", METADATA);
  if (key === undefined) {
    throw new Error("no key");
  }
  return xorHead(bytes, key, 1040);
};

const loadBuiltin = (): Promise<Uint8Array> => Promise.resolve(new Uint8Array());

const BOOK_FONTS = new Map<string, FontFamilyFiles>([
  [
    "book serif",
    { normal: loadBuiltin, bold: loadBuiltin, italics: loadBuiltin, bolditalics: loadBuiltin },
  ],
]);

describe("isSupportedFont", () => {
  it.each([
    [[0x00, 0x01, 0x00, 0x00], true],
    [[...strToU8("OTTO")], true],
    [[...strToU8("wOF2")], true],
    [[...strToU8("wOFF")], true],
    [[...strToU8("<svg")], false],
    [[0x01, 0x02], false],
  ])("%j → %s", (bytes, expected) => {
    expect(isSupportedFont(Uint8Array.from(bytes))).toBe(expected);
  });
});

describe("loadBookFonts", () => {
  it("groups faces into families and fills missing variants", async () => {
    const archive = openArchive(
      zipSync({ "r.ttf": fakeFont(1), "b.ttf": fakeFont(2), "junk.ttf": strToU8("nope") }),
    );
    const families = await loadBookFonts(
      archive,
      [
        { family: "book", path: "r.ttf", weight: 400, italic: false },
        { family: "book", path: "b.ttf", weight: 700, italic: false },
        { family: "broken", path: "junk.ttf", weight: 400, italic: false },
        { family: "missing", path: "nowhere.ttf", weight: 400, italic: false },
      ],
      new Map(),
      METADATA,
    );
    expect([...families.keys()]).toEqual(["book"]);
    expect(await read(families.get("book"))).toEqual({
      normal: 1,
      bold: 2,
      italics: 1,
      bolditalics: 2,
    });
  });

  it("prefers the face closest to the variant's ideal weight", async () => {
    const archive = openArchive(zipSync({ "light.ttf": fakeFont(3), "regular.ttf": fakeFont(4) }));
    const families = await loadBookFonts(
      archive,
      [
        { family: "f", path: "light.ttf", weight: 300, italic: false },
        { family: "f", path: "regular.ttf", weight: 400, italic: false },
      ],
      new Map(),
      METADATA,
    );
    expect((await read(families.get("f"))).normal).toBe(4);
  });

  it("de-obfuscates fonts listed in encryption.xml", async () => {
    const archive = openArchive(zipSync({ "o.ttf": await obfuscate(fakeFont(9)) }));
    const families = await loadBookFonts(
      archive,
      [{ family: "o", path: "o.ttf", weight: 400, italic: false }],
      new Map([["o.ttf", "idpf"]]),
      METADATA,
    );
    expect((await read(families.get("o"))).normal).toBe(9);
  });
});

describe("createFontLibrary", () => {
  it("publisher mode: book fonts first, then known families, then the default", () => {
    const library = createFontLibrary({
      loadBuiltin,
      bookFonts: BOOK_FONTS,
      mode: "publisher",
      defaultFamily: "sans",
    });
    expect(library.resolve(["unknown", "book serif", "serif"])).toBe("Book0");
    expect(library.resolve(["georgia", "book serif"])).toBe(FONT_NAMES.serif);
    expect(library.resolve(["courier new"])).toBe(FONT_NAMES.mono);
    expect(library.resolve(["comic sans"])).toBe(FONT_NAMES.sans);
    expect([...library.used().keys()]).toEqual([
      "Book0",
      FONT_NAMES.serif,
      FONT_NAMES.mono,
      FONT_NAMES.sans,
    ]);
  });

  it("custom mode: ignores the book's fonts except to keep code monospaced", () => {
    const library = createFontLibrary({
      loadBuiltin,
      bookFonts: BOOK_FONTS,
      mode: "custom",
      defaultFamily: "serif",
    });
    expect(library.resolve(["book serif"])).toBe(FONT_NAMES.serif);
    expect(library.resolve(["arial"])).toBe(FONT_NAMES.serif);
    expect(library.resolve(["monospace"])).toBe(FONT_NAMES.mono);
    expect(library.used().has("Book0")).toBe(false);
  });
});
