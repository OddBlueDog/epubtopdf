import { parseLength } from "@/core/css/values";
import type { PageMargins } from "@/core/document/ast";
import type { ConversionSettings } from "@/core/settings";
import { effectiveBaseFontSize, mmToPoints, PAGE_SIZES, usesCustomMargins } from "@/core/settings";

/** Page dimensions and printable area, all in PDF points. */
export type PageGeometry = {
  readonly width: number;
  readonly height: number;
  readonly margins: readonly [left: number, top: number, right: number, bottom: number];
  readonly contentWidth: number;
  readonly contentHeight: number;
};

/** Minimum bottom margin needed to fit a page number below the text block. */
const FOOTER_ROOM_PT = 28;

/** A margin may take at most this share of the page, so a broken `@page` rule can't erase the text. */
const MAX_MARGIN_SHARE = 0.35;

type Sides = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

/**
 * Resolves the book's `@page` margins to points. Percentages refer to the page width
 * (left/right) or height (top/bottom); unset or invalid sides use `fallback`.
 */
export const resolvePageMargins = (
  margins: PageMargins,
  page: { readonly width: number; readonly height: number },
  baseFontSize: number,
  fallback: number,
): Sides => {
  const resolve = (side: keyof Sides, extent: number): number => {
    const value = margins[side];
    const resolved =
      value === undefined
        ? undefined
        : parseLength(value, {
            fontSize: baseFontSize,
            rootFontSize: baseFontSize,
            pixel: baseFontSize / 16,
            percentBase: extent,
          });
    return Math.min(Math.max(resolved ?? fallback, 0), extent * MAX_MARGIN_SHARE);
  };
  return {
    top: resolve("top", page.height),
    right: resolve("right", page.width),
    bottom: resolve("bottom", page.height),
    left: resolve("left", page.width),
  };
};

/**
 * Page size and margins. Publisher layout uses the book's `@page` margins unless the user
 * opted into custom margins; books that set none get the user's margin.
 */
export const pageGeometry = (
  settings: ConversionSettings,
  bookMargins?: PageMargins,
): PageGeometry => {
  const size = PAGE_SIZES[settings.pageSize];
  const width = mmToPoints(size.widthMm);
  const height = mmToPoints(size.heightMm);
  const fallback = mmToPoints(settings.marginMm);
  const sides =
    bookMargins === undefined || usesCustomMargins(settings)
      ? { top: fallback, right: fallback, bottom: fallback, left: fallback }
      : resolvePageMargins(
          bookMargins,
          { width, height },
          effectiveBaseFontSize(settings),
          fallback,
        );
  const bottom = settings.pageNumbers ? Math.max(sides.bottom, FOOTER_ROOM_PT) : sides.bottom;
  return {
    width,
    height,
    margins: [sides.left, sides.top, sides.right, bottom],
    contentWidth: width - sides.left - sides.right,
    contentHeight: height - sides.top - bottom,
  };
};

/** Scales `source` to fit inside `bounds` without upscaling. */
export const fitWithin = (
  source: { readonly width: number; readonly height: number },
  bounds: { readonly width: number; readonly height: number },
  allowUpscale = false,
): { readonly width: number; readonly height: number } => {
  const scale = Math.min(bounds.width / source.width, bounds.height / source.height);
  const factor = allowUpscale ? scale : Math.min(1, scale);
  return { width: source.width * factor, height: source.height * factor };
};
