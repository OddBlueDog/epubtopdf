/**
 * Conversion settings: the single source of truth shared by the UI and the worker.
 * Every option is a closed union or a bounded number so it can be validated at the boundary.
 */

const MM_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;

export const mmToPoints = (mm: number): number => (mm / MM_PER_INCH) * POINTS_PER_INCH;

export type PageSize = {
  readonly label: string;
  readonly description: string;
  /** Width in millimetres. */
  readonly widthMm: number;
  /** Height in millimetres. */
  readonly heightMm: number;
};

export const PAGE_SIZES = {
  a4: { label: "A4", description: "210 × 297 mm", widthMm: 210, heightMm: 297 },
  letter: { label: "US Letter", description: "8.5 × 11 in", widthMm: 215.9, heightMm: 279.4 },
  a5: { label: "A5", description: "148 × 210 mm", widthMm: 148, heightMm: 210 },
  trade: { label: "Trade paperback", description: "6 × 9 in", widthMm: 152.4, heightMm: 228.6 },
  pocket: { label: "Pocket book", description: "4.25 × 6.87 in", widthMm: 108, heightMm: 174.5 },
  ereader: { label: '6" e-reader', description: "Kindle / Kobo", widthMm: 90.6, heightMm: 122.4 },
} as const satisfies Record<string, PageSize>;

export type PageSizeId = keyof typeof PAGE_SIZES;

export const LAYOUT_MODES = {
  publisher: {
    label: "Publisher",
    description: "Keeps the book's own fonts, sizes and spacing",
  },
  custom: {
    label: "Custom",
    description: "Re-typesets the book with your typography",
  },
} as const satisfies Record<string, { readonly label: string; readonly description: string }>;

export type LayoutModeId = keyof typeof LAYOUT_MODES;

export const FONT_FAMILIES = {
  serif: { label: "Serif", description: "Literata — designed for books" },
  sans: { label: "Sans serif", description: "Inter — clean and modern" },
} as const satisfies Record<string, { readonly label: string; readonly description: string }>;

export type FontFamilyId = keyof typeof FONT_FAMILIES;

export const TEXT_ALIGNMENTS = {
  justify: { label: "Justified" },
  left: { label: "Left" },
} as const satisfies Record<string, { readonly label: string }>;

export type TextAlignId = keyof typeof TEXT_ALIGNMENTS;

export type ImageQualityProfile = {
  readonly label: string;
  readonly description: string;
  /** Longest edge in pixels; `undefined` keeps the original resolution. */
  readonly maxDimension: number | undefined;
  /** Re-encode everything as JPEG at this quality; `undefined` keeps JPEG/PNG untouched. */
  readonly jpegQuality: number | undefined;
};

export const IMAGE_QUALITIES = {
  original: {
    label: "Original",
    description: "Untouched, largest file",
    maxDimension: undefined,
    jpegQuality: undefined,
  },
  balanced: {
    label: "Balanced",
    description: "Up to 1600 px",
    maxDimension: 1600,
    jpegQuality: undefined,
  },
  compact: {
    label: "Compact",
    description: "Up to 1000 px, JPEG",
    maxDimension: 1000,
    jpegQuality: 0.72,
  },
} as const satisfies Record<string, ImageQualityProfile>;

export type ImageQualityId = keyof typeof IMAGE_QUALITIES;

export type NumericRange = {
  readonly min: number;
  readonly max: number;
  readonly step: number;
};

export const MARGIN_RANGE = { min: 0, max: 40, step: 1 } as const satisfies NumericRange;
export const FONT_SIZE_RANGE = { min: 8, max: 18, step: 0.5 } as const satisfies NumericRange;
export const LINE_HEIGHT_RANGE = { min: 1, max: 2, step: 0.05 } as const satisfies NumericRange;

export type ConversionSettings = {
  readonly layout: LayoutModeId;
  readonly pageSize: PageSizeId;
  readonly marginMm: number;
  readonly fontFamily: FontFamilyId;
  readonly fontSizePt: number;
  readonly lineHeight: number;
  readonly textAlign: TextAlignId;
  readonly includeImages: boolean;
  readonly imageQuality: ImageQualityId;
  readonly includeCover: boolean;
  readonly includeToc: boolean;
  readonly pageNumbers: boolean;
  readonly chapterPageBreaks: boolean;
};

export const DEFAULT_SETTINGS: ConversionSettings = {
  layout: "publisher",
  pageSize: "a4",
  marginMm: 18,
  fontFamily: "serif",
  fontSizePt: 11,
  lineHeight: 1.4,
  textAlign: "justify",
  includeImages: true,
  imageQuality: "balanced",
  includeCover: true,
  includeToc: true,
  pageNumbers: true,
  chapterPageBreaks: true,
};

// ---------------------------------------------------------------------------
// Validation: settings cross trust boundaries (localStorage, postMessage).
// ---------------------------------------------------------------------------

const isKeyOf = <T extends object>(record: T, value: unknown): value is keyof T =>
  typeof value === "string" && Object.hasOwn(record, value);

const clampToRange = (value: unknown, range: NumericRange, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(range.max, Math.max(range.min, value));
};

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const pick = <T extends object>(record: T, value: unknown, fallback: keyof T): keyof T =>
  isKeyOf(record, value) ? value : fallback;

/** Coerces arbitrary input into valid settings, falling back to defaults per field. */
export const parseSettings = (input: unknown): ConversionSettings => {
  const source: Readonly<Record<string, unknown>> =
    typeof input === "object" && input !== null ? { ...input } : {};
  const defaults = DEFAULT_SETTINGS;

  return {
    layout: pick(LAYOUT_MODES, source["layout"], defaults.layout),
    pageSize: pick(PAGE_SIZES, source["pageSize"], defaults.pageSize),
    marginMm: clampToRange(source["marginMm"], MARGIN_RANGE, defaults.marginMm),
    fontFamily: pick(FONT_FAMILIES, source["fontFamily"], defaults.fontFamily),
    fontSizePt: clampToRange(source["fontSizePt"], FONT_SIZE_RANGE, defaults.fontSizePt),
    lineHeight: clampToRange(source["lineHeight"], LINE_HEIGHT_RANGE, defaults.lineHeight),
    textAlign: pick(TEXT_ALIGNMENTS, source["textAlign"], defaults.textAlign),
    includeImages: booleanOr(source["includeImages"], defaults.includeImages),
    imageQuality: pick(IMAGE_QUALITIES, source["imageQuality"], defaults.imageQuality),
    includeCover: booleanOr(source["includeCover"], defaults.includeCover),
    includeToc: booleanOr(source["includeToc"], defaults.includeToc),
    pageNumbers: booleanOr(source["pageNumbers"], defaults.pageNumbers),
    chapterPageBreaks: booleanOr(source["chapterPageBreaks"], defaults.chapterPageBreaks),
  };
};

/** Stable fingerprint, used to detect results produced with outdated settings. */
export const settingsKey = (settings: ConversionSettings): string =>
  JSON.stringify(parseSettings(settings));
