/**
 * End-to-end: EPUB bytes in, PDF bytes out, through the real pdfmake renderer.
 * Fonts come straight from node_modules; image re-encoding (canvas) is not needed
 * because the fixtures only contain small PNGs, which pass through untouched.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ConversionProgress } from "@/core/convert";
import { convertEpubToPdf } from "@/core/convert";
import { ConversionError } from "@/core/errors";
import type { FontLoader } from "@/core/pdf/fonts";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { buildEpub, RGB_PNG, TINY_PNG } from "@/test/epub-builder";

const require = createRequire(import.meta.url);

const FONT_PACKAGES = {
  serif: ["@expo-google-fonts/literata", "Literata"],
  sans: ["@expo-google-fonts/inter", "Inter"],
  mono: ["@expo-google-fonts/jetbrains-mono", "JetBrainsMono"],
} as const;

const VARIANT_DIRECTORIES = {
  normal: "400Regular",
  bold: "700Bold",
  italics: "400Regular_Italic",
  bolditalics: "700Bold_Italic",
} as const;

const loadFont: FontLoader = async (role, variant) => {
  const [pkg, prefix] = FONT_PACKAGES[role];
  const directory = VARIANT_DIRECTORIES[variant];
  const root = dirname(require.resolve(`${pkg}/package.json`));
  return new Uint8Array(await readFile(join(root, directory, `${prefix}_${directory}.ttf`)));
};

const latin1 = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes);

const epub = buildEpub({
  title: "Integration",
  documents: [
    {
      href: "one.xhtml",
      body: '<h1>One</h1><p>Some <em>styled</em> text with a <a href="two.xhtml">link</a>.</p><img src="pic.png"/><img src="alpha.png"/>',
    },
    { href: "two.xhtml", body: "<h1>Two</h1><pre>code()</pre><ul><li>item</li></ul>" },
  ],
  // The RGBA image can't be re-encoded in Node (no canvas) and must be skipped, not fatal.
  files: { "pic.png": RGB_PNG, "alpha.png": TINY_PNG },
  navList: '<li><a href="one.xhtml">One</a></li><li><a href="two.xhtml">Two</a></li>',
});

describe("convertEpubToPdf", () => {
  it(
    "produces a PDF with metadata, bookmarks and monotonic progress",
    { timeout: 30_000 },
    async () => {
      const progress: ConversionProgress[] = [];
      const result = await convertEpubToPdf({
        epub,
        fileName: "integration.epub",
        settings: { ...DEFAULT_SETTINGS, imageQuality: "original" },
        loadFont,
        onProgress: (update) => {
          progress.push(update);
        },
      });

      const text = latin1(result.pdf);
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
      expect(text).toContain("/Outlines");
      expect(text).toContain("(Integration)");
      expect(result.title).toBe("Integration");

      const fractions = progress.map((update) => update.fraction);
      const sorted = fractions.toSorted((a, b) => a - b);
      expect(fractions).toEqual(sorted);
      expect(fractions.at(-1)).toBeCloseTo(1);
      expect(new Set(progress.map((update) => update.stage))).toEqual(
        new Set(["reading", "parsing", "images", "rendering"]),
      );
    },
  );

  it("works for every page size and typeface", { timeout: 60_000 }, async () => {
    for (const fontFamily of ["serif", "sans"] as const) {
      for (const pageSize of ["a5", "letter", "ereader"] as const) {
        const { pdf } = await convertEpubToPdf({
          epub,
          fileName: "x.epub",
          settings: { ...DEFAULT_SETTINGS, fontFamily, pageSize, imageQuality: "original" },
          loadFont,
        });
        expect(pdf.byteLength).toBeGreaterThan(1000);
      }
    }
  });

  it("rejects non-EPUB input with a typed error", async () => {
    await expect(
      convertEpubToPdf({
        epub: new Uint8Array([1, 2, 3]),
        fileName: "x",
        settings: DEFAULT_SETTINGS,
        loadFont,
      }),
    ).rejects.toBeInstanceOf(ConversionError);
  });
});
