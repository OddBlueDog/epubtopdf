import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  CSS_MEDIUM_PT,
  DEFAULT_SETTINGS,
  effectiveBaseFontSize,
  FONT_FAMILIES,
  FONT_SIZE_RANGE,
  IMAGE_QUALITIES,
  LINE_HEIGHT_RANGE,
  MARGIN_RANGE,
  mmToPoints,
  PAGE_SIZES,
  parseSettings,
  settingsKey,
  TEXT_ALIGNMENTS,
  usesCustomMargins,
} from "@/core/settings";

const keysOf = (record: object): string[] => Object.keys(record);

/** Arbitrary objects that sometimes contain valid values, sometimes garbage. */
const settingsLike = fc.record(
  {
    pageSize: fc.oneof(fc.constantFrom(...keysOf(PAGE_SIZES)), fc.anything()),
    marginMm: fc.oneof(fc.double(), fc.anything()),
    fontFamily: fc.oneof(fc.constantFrom(...keysOf(FONT_FAMILIES)), fc.string()),
    fontSizePt: fc.oneof(fc.double(), fc.anything()),
    lineHeight: fc.double(),
    textAlign: fc.oneof(fc.constantFrom(...keysOf(TEXT_ALIGNMENTS)), fc.string()),
    includeImages: fc.anything(),
    imageQuality: fc.oneof(fc.constantFrom(...keysOf(IMAGE_QUALITIES)), fc.string()),
    includeCover: fc.boolean(),
    includeToc: fc.anything(),
    pageNumbers: fc.boolean(),
    chapterPageBreaks: fc.anything(),
  },
  { requiredKeys: [] },
);

describe("parseSettings", () => {
  it("returns defaults for non-objects", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores prototype keys such as toString", () => {
    expect(parseSettings({ pageSize: "toString" }).pageSize).toBe(DEFAULT_SETTINGS.pageSize);
  });

  test.prop([fc.oneof(settingsLike, fc.anything())])("always produces valid settings", (input) => {
    const settings = parseSettings(input);
    expect(keysOf(PAGE_SIZES)).toContain(settings.pageSize);
    expect(keysOf(FONT_FAMILIES)).toContain(settings.fontFamily);
    expect(keysOf(TEXT_ALIGNMENTS)).toContain(settings.textAlign);
    expect(keysOf(IMAGE_QUALITIES)).toContain(settings.imageQuality);
    for (const [value, range] of [
      [settings.marginMm, MARGIN_RANGE],
      [settings.fontSizePt, FONT_SIZE_RANGE],
      [settings.lineHeight, LINE_HEIGHT_RANGE],
    ] as const) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
    for (const flag of [
      settings.includeImages,
      settings.includeCover,
      settings.includeToc,
      settings.pageNumbers,
      settings.chapterPageBreaks,
    ]) {
      expect(typeof flag).toBe("boolean");
    }
  });

  test.prop([fc.anything()])("is idempotent", (input) => {
    const once = parseSettings(input);
    expect(parseSettings(once)).toEqual(once);
  });

  test.prop([fc.anything()])("survives a JSON round trip (localStorage)", (input) => {
    const settings = parseSettings(input);
    expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });
});

describe("settingsKey", () => {
  it("is insensitive to key order", () => {
    const reversed = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).toReversed());
    expect(settingsKey(parseSettings(reversed))).toBe(settingsKey(DEFAULT_SETTINGS));
  });

  it("changes when any setting changes", () => {
    expect(settingsKey({ ...DEFAULT_SETTINGS, marginMm: 5 })).not.toBe(
      settingsKey(DEFAULT_SETTINGS),
    );
  });
});

describe("mmToPoints", () => {
  it("converts an inch exactly", () => {
    expect(mmToPoints(25.4)).toBeCloseTo(72);
  });
});

describe("effective text size and margins", () => {
  it.each([
    [{ layout: "publisher", overrideTextSize: false, fontSizePt: 15 }, CSS_MEDIUM_PT],
    [{ layout: "publisher", overrideTextSize: true, fontSizePt: 15 }, 15],
    [{ layout: "custom", overrideTextSize: false, fontSizePt: 15 }, 15],
  ] as const)("base size for %j is %d pt", (settings, expected) => {
    expect(effectiveBaseFontSize(settings)).toBe(expected);
  });

  it.each([
    [{ layout: "publisher", overrideMargins: false }, false],
    [{ layout: "publisher", overrideMargins: true }, true],
    [{ layout: "custom", overrideMargins: false }, true],
  ] as const)("custom margins for %j: %s", (settings, expected) => {
    expect(usesCustomMargins(settings)).toBe(expected);
  });

  it("defaults to the book's own sizes and margins", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      layout: "publisher",
      overrideTextSize: false,
      overrideMargins: false,
    });
  });
});
