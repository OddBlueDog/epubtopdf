import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { LengthContext } from "@/core/css/values";
import {
  expandBox,
  parseColor,
  parseFontFamilies,
  parseFontSize,
  parseFontWeight,
  parseLength,
  parseLineHeight,
} from "@/core/css/values";

const CONTEXT: LengthContext = { fontSize: 10, rootFontSize: 12, pixel: 0.75, percentBase: 200 };

describe("parseLength", () => {
  it.each([
    ["0", 0],
    ["16px", 12],
    ["2em", 20],
    ["1.5rem", 18],
    ["50%", 100],
    ["1in", 72],
    ["25.4mm", 72],
    ["12pt", 12],
    [".5em", 5],
    ["-1em", -10],
  ])("%s → %d pt", (value, points) => {
    expect(parseLength(value, CONTEXT)).toBeCloseTo(points);
  });

  it.each(["12", "auto", "", "em", "10vw", "calc(1em + 2px)"])("rejects %j", (value) => {
    expect(parseLength(value, CONTEXT)).toBeUndefined();
  });

  test.prop([fc.string()])("never throws and never returns NaN", (value) => {
    const result = parseLength(value, CONTEXT);
    expect(result === undefined || Number.isFinite(result)).toBe(true);
  });
});

describe("parseFontSize", () => {
  it("resolves keywords against the root and relative values against the parent", () => {
    expect(parseFontSize("medium", 20, CONTEXT)).toBe(12);
    expect(parseFontSize("larger", 10, CONTEXT)).toBeCloseTo(12);
    expect(parseFontSize("150%", 10, CONTEXT)).toBe(15);
    expect(parseFontSize("2em", 10, CONTEXT)).toBe(20);
  });

  it("rejects non-positive sizes", () => {
    expect(parseFontSize("0", 10, CONTEXT)).toBeUndefined();
    expect(parseFontSize("-2em", 10, CONTEXT)).toBeUndefined();
  });
});

describe("parseLineHeight", () => {
  it("returns a multiple of the font size", () => {
    expect(parseLineHeight("1.5", 10, CONTEXT)).toBe(1.5);
    expect(parseLineHeight("150%", 10, CONTEXT)).toBe(1.5);
    expect(parseLineHeight("15pt", 10, CONTEXT)).toBe(1.5);
    expect(parseLineHeight("normal", 10, CONTEXT)).toBeUndefined();
  });
});

describe("parseFontWeight", () => {
  it.each([
    ["bold", 400, 700],
    ["normal", 700, 400],
    ["bolder", 400, 700],
    ["lighter", 700, 400],
    ["600", 400, 600],
    ["heavy", 400, undefined],
  ])("%s (parent %d) → %s", (value, parent, expected) => {
    expect(parseFontWeight(value, parent)).toBe(expected);
  });
});

describe("parseFontFamilies", () => {
  it("unquotes, lower-cases and drops empties", () => {
    expect(parseFontFamilies(` "Linux Libertine", 'Times New Roman' ,serif, `)).toEqual([
      "linux libertine",
      "times new roman",
      "serif",
    ]);
  });
});

describe("expandBox", () => {
  it.each([
    ["1em", ["1em", "1em", "1em", "1em"]],
    ["1em 2em", ["1em", "2em", "1em", "2em"]],
    ["1em 2em 3em", ["1em", "2em", "3em", "2em"]],
    ["1 2 3 4", ["1", "2", "3", "4"]],
  ])("expands %j", (value, expected) => {
    expect(expandBox(value)).toEqual(expected);
  });

  it("rejects more than four values", () => {
    expect(expandBox("1 2 3 4 5")).toBeUndefined();
  });
});

describe("parseColor", () => {
  it.each([
    ["#ABC", "#aabbcc"],
    ["#a1b2c3", "#a1b2c3"],
    ["rgb(255, 0, 128)", "#ff0080"],
    ["rgba(100%, 0%, 0%, 0.5)", "#ff0000"],
    ["Navy", "#000080"],
    ["transparent", undefined],
    ["hsl(0 100% 50%)", undefined],
  ])("%s → %s", (value, expected) => {
    expect(parseColor(value)).toBe(expected);
  });

  test.prop([
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  ])("round-trips rgb() through hex", (red, green, blue) => {
    const hex = parseColor(`rgb(${red}, ${green}, ${blue})`);
    expect(hex).toBe(
      `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`,
    );
  });
});
