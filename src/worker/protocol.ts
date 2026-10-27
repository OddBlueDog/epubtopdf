/** Message contract between the UI thread and the conversion worker. */
import type { ConversionStage } from "@/core/convert";
import type { ConversionErrorCode } from "@/core/errors";
import type { ConversionSettings } from "@/core/settings";

export type ConvertRequest = {
  readonly type: "convert";
  readonly fileName: string;
  /** Transferred, not copied. */
  readonly epub: ArrayBuffer;
  readonly settings: ConversionSettings;
};

export type WorkerResponse =
  | { readonly type: "progress"; readonly stage: ConversionStage; readonly fraction: number }
  | {
      readonly type: "done";
      /** Transferred, not copied. */
      readonly pdf: ArrayBuffer;
      readonly title: string | undefined;
      readonly authors: readonly string[];
    }
  | { readonly type: "error"; readonly code: ConversionErrorCode; readonly message: string };
