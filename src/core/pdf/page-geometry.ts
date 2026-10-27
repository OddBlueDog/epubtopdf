import type { ConversionSettings } from "@/core/settings";
import { mmToPoints, PAGE_SIZES } from "@/core/settings";

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

export const pageGeometry = (settings: ConversionSettings): PageGeometry => {
  const size = PAGE_SIZES[settings.pageSize];
  const width = mmToPoints(size.widthMm);
  const height = mmToPoints(size.heightMm);
  const margin = mmToPoints(settings.marginMm);
  const bottom = settings.pageNumbers ? Math.max(margin, FOOTER_ROOM_PT) : margin;
  return {
    width,
    height,
    margins: [margin, margin, margin, bottom],
    contentWidth: width - margin * 2,
    contentHeight: height - margin - bottom,
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
