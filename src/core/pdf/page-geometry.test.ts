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
