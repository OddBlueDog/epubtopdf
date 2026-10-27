import { fc, test } from "@fast-check/vitest";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDuration,
  isEpubFile,
  pdfFileName,
  zipPdfs,
} from "@/features/converter/lib/files";
import type { CompletedJob } from "@/features/converter/model/job";

const completed = (name: string, content: string): CompletedJob => ({
  id: name,
  file: new File(["epub"], name),
  selected: true,
  status: {
    kind: "done",
    pdf: new Blob([content], { type: "application/pdf" }),
    settingsKey: "",
    title: undefined,
    authors: [],
    durationMs: 0,
  },
});

describe("pdfFileName", () => {
  it("swaps the extension", () => {
    expect(pdfFileName("My Book.EPUB")).toBe("My Book.pdf");
  });

  it("never returns an empty base name", () => {
    expect(pdfFileName(".epub")).toBe("book.pdf");
  });

  test.prop([fc.string()])("is always a safe .pdf file name", (name) => {
    const result = pdfFileName(name);
    expect(result.endsWith(".pdf")).toBe(true);
    expect(
      Array.from(result).some(
        (char) => '\\/:*?"<>|'.includes(char) || (char.codePointAt(0) ?? 0) < 0x20,
      ),
    ).toBe(false);
    expect(result.length).toBeGreaterThan(".pdf".length);
  });
});

describe("isEpubFile", () => {
  it("accepts by extension or MIME type", () => {
    expect(isEpubFile(new File([], "a.epub"))).toBe(true);
    expect(isEpubFile(new File([], "a", { type: "application/epub+zip" }))).toBe(true);
    expect(isEpubFile(new File([], "a.pdf"))).toBe(false);
  });
});

describe("formatting", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1536, "1.5 KB"],
    [15 * 1024 * 1024, "15 MB"],
  ])("formatBytes(%d) = %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("formats durations", () => {
    expect(formatDuration(420)).toBe("420 ms");
    expect(formatDuration(2345)).toBe("2.3 s");
  });
});

describe("zipPdfs", () => {
  it("stores each PDF under a unique name", async () => {
    const zip = await zipPdfs([
      completed("a.epub", "one"),
      completed("A.epub", "two"),
      completed("b.epub", "three"),
    ]);
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(zip.type).toBe("application/zip");
    expect(Object.keys(entries)).toEqual(["a.pdf", "A (2).pdf", "b.pdf"]);
    expect(new TextDecoder().decode(entries["A (2).pdf"])).toBe("two");
  });

  test.prop([
    fc.array(fc.constantFrom("x.epub", "y.epub", "X.EPUB", "x (2).epub"), {
      minLength: 1,
      maxLength: 8,
    }),
  ])("never loses an entry to a name collision", async (names) => {
    const zip = await zipPdfs(names.map((name, index) => completed(name, String(index))));
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries)).toHaveLength(names.length);
  });
});
