import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { dirname, isExternalHref, joinPath, resolveHref } from "@/core/epub/paths";

const segment = fc.stringMatching(/^[\w-]{1,8}$/u);
const relativePath = fc
  .array(fc.oneof(segment, fc.constant(".."), fc.constant(".")), { minLength: 1, maxLength: 6 })
  .map((parts) => parts.join("/"));

describe("resolveHref", () => {
  it("resolves relative paths against the referring file", () => {
    expect(resolveHref("OEBPS/Text/ch1.xhtml", "../Images/a.png")).toEqual({
      path: "OEBPS/Images/a.png",
      fragment: undefined,
    });
  });

  it("splits and decodes fragments and percent-encoding", () => {
    expect(resolveHref("OEBPS/a.xhtml", "chapter%201.xhtml#sec%202")).toEqual({
      path: "OEBPS/chapter 1.xhtml",
      fragment: "sec 2",
    });
  });

  it("treats a bare fragment as a link into the same file", () => {
    expect(resolveHref("OEBPS/a.xhtml", "#note")).toEqual({
      path: "OEBPS/a.xhtml",
      fragment: "note",
    });
  });

  it("drops query strings", () => {
    expect(resolveHref("a/b.xhtml", "c.xhtml?x=1#y")).toEqual({ path: "a/c.xhtml", fragment: "y" });
  });

  it.each([
    "https://example.com",
    "mailto:a@b.c",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "  ",
  ])("returns undefined for external or empty href %j", (href) => {
    expect(resolveHref("a.xhtml", href)).toBeUndefined();
  });

  it("survives malformed percent-encoding", () => {
    expect(resolveHref("a.xhtml", "bad%zz.xhtml")?.path).toBe("bad%zz.xhtml");
  });

  test.prop([relativePath, relativePath])(
    "never yields '.', '..' or empty segments",
    (base, href) => {
      const resolved = resolveHref(`${base}/file.xhtml`, href);
      const segments = resolved?.path.split("/") ?? [];
      expect(segments.every((part) => part !== "." && part !== "..")).toBe(true);
      expect(resolved?.path.startsWith("/")).not.toBe(true);
    },
  );
});

describe("joinPath", () => {
  test.prop([
    fc.array(segment, { maxLength: 5 }),
    fc.array(segment, { minLength: 1, maxLength: 5 }),
  ])("joining plain segments is concatenation", (base, rest) => {
    expect(joinPath(base.join("/"), rest.join("/"))).toBe([...base, ...rest].join("/"));
  });

  test.prop([relativePath])("is idempotent on its own output", (path) => {
    const once = joinPath("", path);
    expect(joinPath("", once)).toBe(once);
  });

  it("cannot escape the archive root", () => {
    expect(joinPath("a", "../../../../etc/passwd")).toBe("etc/passwd");
  });
});

describe("dirname / isExternalHref", () => {
  it("returns the parent directory", () => {
    expect(dirname("OEBPS/Text/ch1.xhtml")).toBe("OEBPS/Text");
    expect(dirname("root.opf")).toBe("");
  });

  it("detects URL schemes", () => {
    expect(isExternalHref("HTTPS://x")).toBe(true);
    expect(isExternalHref("chapter.xhtml")).toBe(false);
  });
});
