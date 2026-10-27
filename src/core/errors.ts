export type ConversionErrorCode =
  | "invalid-archive"
  | "archive-too-large"
  | "missing-container"
  | "missing-package"
  | "empty-book"
  | "drm-protected"
  | "render-failed"
  | "cancelled";

/** A user-presentable failure raised anywhere in the conversion pipeline. */
export class ConversionError extends Error {
  public readonly code: ConversionErrorCode;

  public constructor(code: ConversionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConversionError";
    this.code = code;
  }
}

export const describeError = (error: unknown): { code: ConversionErrorCode; message: string } => {
  if (error instanceof ConversionError) {
    return { code: error.code, message: error.message };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { code: "render-failed", message: `Unexpected error: ${detail}` };
};
