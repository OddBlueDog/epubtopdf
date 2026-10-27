import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { DEFAULT_BLOCK_STYLE, DEFAULT_RUN_STYLE, NO_MARKS } from "@/core/document/ast";
import type { Block, TextRun } from "@/core/document/ast";
import type { TextStyle } from "@/core/document/block-sink";
import { createBlockSink } from "@/core/document/block-sink";

const BODY: TextStyle = {
  marks: NO_MARKS,
  run: DEFAULT_RUN_STYLE,
  block: DEFAULT_BLOCK_STYLE,
  link: undefined,
  align: undefined,
  variant: { kind: "body" },
  preformatted: false,
};
const ITALIC: TextStyle = { ...BODY, marks: { ...NO_MARKS, italic: true } };

const runsOf = (blocks: readonly Block[]): readonly TextRun[] =>
  blocks.flatMap((block) =>
    block.kind === "paragraph" || block.kind === "heading" ? block.content : [],
  );

const textOf = (blocks: readonly Block[]): string =>
  runsOf(blocks)
    .map((run) => run.text)
    .join("");

const collect = (pieces: readonly (readonly [string, TextStyle])[]): readonly Block[] => {
  const sink = createBlockSink();
  for (const [text, style] of pieces) {
    sink.appendText(text, style);
  }
  return sink.drain().blocks;
};

describe("createBlockSink", () => {
  it("collapses HTML whitespace across runs", () => {
    const blocks = collect([
      ["  Hello \n\t ", BODY],
      ["  brave ", ITALIC],
      [" new   world  ", BODY],
    ]);
    expect(textOf(blocks)).toBe("Hello brave new world");
  });

  it("merges adjacent runs with identical formatting", () => {
    const blocks = collect([
      ["a ", BODY],
      ["b", BODY],
    ]);
    expect(runsOf(blocks)).toHaveLength(1);
  });

  it("keeps non-breaking spaces", () => {
    expect(textOf(collect([["a  b", BODY]]))).toBe("a  b");
  });

  it("trims spaces around hard line breaks", () => {
    const sink = createBlockSink();
    sink.appendText("line one ", BODY);
    sink.appendText("\n", { ...BODY, preformatted: true });
    sink.appendText(" line two", BODY);
    expect(textOf(sink.drain().blocks)).toBe("line one\nline two");
  });

  it("emits nothing for whitespace-only content but keeps its anchors pending", () => {
    const sink = createBlockSink();
    const anchor = "f0#x" as Parameters<typeof sink.addAnchor>[0]; // oxlint-disable-line typescript/no-unsafe-type-assertion
    sink.addAnchor(anchor);
    sink.appendText("   \n ", BODY);
    sink.flush();
    sink.appendText("Real text", BODY);
    const { blocks, orphanAnchors } = sink.drain();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.anchors).toEqual([anchor]);
    expect(orphanAnchors).toEqual([]);
  });

  it("produces headings for heading variants", () => {
    const blocks = collect([["Title", { ...BODY, variant: { kind: "heading", level: 2 } }]]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
  });

  test.prop([fc.array(fc.tuple(fc.string(), fc.boolean()), { maxLength: 12 })])(
    "output is trimmed, has no double spaces, and keeps every word in order",
    (pieces) => {
      const blocks = collect(
        pieces.map(([text, italic]) => [text, italic ? ITALIC : BODY] as const),
      );
      const text = textOf(blocks);
      const expected = pieces
        .map(([piece]) => piece)
        .join("")
        .split(/[ \t\n\r\f]+/u)
        .filter(Boolean)
        .join(" ");
      expect(text).toBe(expected);
      expect(text).not.toMatch(/ {2}/u);
      expect(text).toBe(text.trim());
    },
  );

  test.prop([fc.array(fc.tuple(fc.string({ minLength: 1 }), fc.boolean()), { maxLength: 12 })])(
    "never leaves two adjacent runs with identical formatting",
    (pieces) => {
      const runs = runsOf(
        collect(pieces.map(([text, italic]) => [text, italic ? ITALIC : BODY] as const)),
      );
      runs.slice(1).forEach((run, index) => {
        expect(run.marks.italic).not.toBe(runs[index]?.marks.italic);
      });
    },
  );
});
