import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { fitWithin, pageGeometry } from "@/core/pdf/page-geometry";
import { DEFAULT_SETTINGS, MARGIN_RANGE, PAGE_SIZES } from "@/core/settings";
import { typedEntries } from "@/lib/object";

const size = fc.record({
  width: fc.double({ min: 1, max: 10_000, noNaN: true }),
  height: fc.double({ min: 1, max: 10_000, noNaN: true }),
});

describe("fitWithin", () => {
  test.prop([size, size])("fits inside the bounds and keeps the aspect ratio", (source, bounds) => {
    const fitted = fitWithin(source, bounds);
    expect(fitted.width).toBeLessThanOrEqual(bounds.width + 1e-6);
    expect(fitted.height).toBeLessThanOrEqual(bounds.height + 1e-6);
    expect(fitted.width / fitted.height).toBeCloseTo(source.width / source.height, 6);
  });

  test.prop([size, size])("never upscales unless asked to", (source, bounds) => {
    const fitted = fitWithin(source, bounds);
    expect(fitted.width).toBeLessThanOrEqual(source.width + 1e-6);
  });

  test.prop([size, size])("with upscaling, touches at least one edge", (source, bounds) => {
    const fitted = fitWithin(source, bounds, true);
    const touches =
      Math.abs(fitted.width - bounds.width) < 1e-6 ||
      Math.abs(fitted.height - bounds.height) < 1e-6;
    expect(touches).toBe(true);
  });
});

describe("pageGeometry", () => {
  it("computes A4 in points", () => {
    const geometry = pageGeometry({ ...DEFAULT_SETTINGS, pageSize: "a4" });
    expect(geometry.width).toBeCloseTo(595.28, 1);
    expect(geometry.height).toBeCloseTo(841.89, 1);
  });

  it("reserves room for page numbers even with zero margins", () => {
    const geometry = pageGeometry({ ...DEFAULT_SETTINGS, marginMm: 0, pageNumbers: true });
    expect(geometry.margins[3]).toBeGreaterThan(0);
    expect(pageGeometry({ ...DEFAULT_SETTINGS, marginMm: 0, pageNumbers: false }).margins[3]).toBe(
      0,
    );
  });

  test.prop([
    fc.constantFrom(...typedEntries(PAGE_SIZES).map(([id]) => id)),
    fc.integer({ min: MARGIN_RANGE.min, max: MARGIN_RANGE.max }),
    fc.boolean(),
  ])("always leaves a positive content area", (pageSize, marginMm, pageNumbers) => {
    const geometry = pageGeometry({ ...DEFAULT_SETTINGS, pageSize, marginMm, pageNumbers });
    expect(geometry.contentWidth).toBeGreaterThan(0);
    expect(geometry.contentHeight).toBeGreaterThan(0);
    const [left, top, right, bottom] = geometry.margins;
    expect(left + right + geometry.contentWidth).toBeCloseTo(geometry.width);
    expect(top + bottom + geometry.contentHeight).toBeCloseTo(geometry.height);
  });
});

describe("book page margins", () => {
  const a4 = { ...DEFAULT_SETTINGS, pageSize: "a4" as const, marginMm: 10, pageNumbers: false };
  const fallback = (10 / 25.4) * 72;

  it("uses the book's @page margins in publisher layout", () => {
    const geometry = pageGeometry(a4, { top: "1in", right: "36pt", bottom: "2cm", left: "10%" });
    const [left, top, right, bottom] = geometry.margins;
    expect(top).toBeCloseTo(72);
    expect(right).toBeCloseTo(36);
    expect(bottom).toBeCloseTo((2 / 2.54) * 72);
    expect(left).toBeCloseTo(geometry.width * 0.1);
  });

  it("falls back to the user's margin for sides the book leaves unset or invalid", () => {
    const [left, top] = pageGeometry(a4, { top: "auto" }).margins;
    expect(top).toBeCloseTo(fallback);
    expect(left).toBeCloseTo(fallback);
  });

  it("ignores the book's margins when the user overrides them or uses custom layout", () => {
    const book = { top: "1in", right: "1in", bottom: "1in", left: "1in" };
    for (const settings of [
      { ...a4, overrideMargins: true },
      { ...a4, layout: "custom" as const },
    ]) {
      expect(pageGeometry(settings, book).margins[1]).toBeCloseTo(fallback);
    }
  });

  it("caps absurd margins so text always has room", () => {
    const geometry = pageGeometry(a4, { left: "500mm", right: "500mm" });
    expect(geometry.contentWidth).toBeGreaterThan(geometry.width * 0.25);
  });

  test.prop([
    fc.record(
      {
        top: fc.string(),
        right: fc.string(),
        bottom: fc.string(),
        left: fc.string(),
      },
      { requiredKeys: [] },
    ),
  ])("always leaves a positive content area for any @page values", (margins) => {
    const geometry = pageGeometry(a4, margins);
    expect(geometry.contentWidth).toBeGreaterThan(0);
    expect(geometry.contentHeight).toBeGreaterThan(0);
  });
});
