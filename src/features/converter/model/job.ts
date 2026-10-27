import type { ConversionStage } from "@/core/convert";
import type { ConversionErrorCode } from "@/core/errors";
import type { ConversionSettings } from "@/core/settings";

export type JobId = string;

export type JobStatus =
  | { readonly kind: "queued"; readonly settings: ConversionSettings }
  | {
      readonly kind: "converting";
      readonly settings: ConversionSettings;
      readonly stage: ConversionStage;
      readonly progress: number;
    }
  | {
      readonly kind: "done";
      readonly pdf: Blob;
      /** Fingerprint of the settings used, to flag results that are out of date. */
      readonly settingsKey: string;
      readonly title: string | undefined;
      readonly authors: readonly string[];
      readonly durationMs: number;
    }
  | {
      readonly kind: "failed";
      readonly code: ConversionErrorCode;
      readonly message: string;
    };

export type ConversionJob = {
  readonly id: JobId;
  readonly file: File;
  readonly selected: boolean;
  readonly status: JobStatus;
};

export type CompletedJob = ConversionJob & {
  readonly status: Extract<JobStatus, { kind: "done" }>;
};

export const isCompleted = (job: ConversionJob): job is CompletedJob => job.status.kind === "done";

export const isActive = (job: ConversionJob): boolean =>
  job.status.kind === "queued" || job.status.kind === "converting";

export const STAGE_LABELS: Readonly<Record<ConversionStage, string>> = {
  reading: "Reading archive",
  parsing: "Parsing chapters",
  images: "Optimising images",
  rendering: "Typesetting PDF",
};

/** Failures that converting again cannot fix. */
export const isPermanentFailure = (status: JobStatus): boolean =>
  status.kind === "failed" &&
  (status.code === "drm-protected" || status.code === "invalid-archive");
