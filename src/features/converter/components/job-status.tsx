import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  LoaderCircleIcon,
  LockIcon,
  RefreshCwIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatDuration } from "@/features/converter/lib/files";
import type { JobStatus } from "@/features/converter/model/job";
import { STAGE_LABELS } from "@/features/converter/model/job";

export const JobStatusBadge = ({
  status,
  outdated,
}: {
  readonly status: JobStatus;
  readonly outdated: boolean;
}) => {
  switch (status.kind) {
    case "queued":
      return (
        <Badge variant="secondary">
          <ClockIcon />
          Queued
        </Badge>
      );
    case "converting":
      return (
        <Badge variant="secondary">
          <LoaderCircleIcon className="animate-spin" />
          {Math.round(status.progress * 100)}%
        </Badge>
      );
    case "done":
      return outdated ? (
        <Badge variant="outline">
          <RefreshCwIcon />
          Outdated
        </Badge>
      ) : (
        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2Icon />
          Ready
        </Badge>
      );
    case "failed":
      return status.code === "drm-protected" ? (
        <Badge variant="outline">
          <LockIcon />
          DRM-protected
        </Badge>
      ) : (
        <Badge variant="destructive">
          <AlertCircleIcon />
          Failed
        </Badge>
      );
  }
};

/** Secondary line under the file name: progress, result details or error. */
export const JobStatusDetail = ({
  status,
  fileSize,
}: {
  readonly status: JobStatus;
  readonly fileSize: number;
}) => {
  switch (status.kind) {
    case "queued":
      return <span>{formatBytes(fileSize)} · Waiting…</span>;
    case "converting":
      return (
        <span className="flex w-full flex-col gap-1.5">
          <span>{STAGE_LABELS[status.stage]}…</span>
          <Progress
            value={status.progress * 100}
            className="h-1"
            aria-label="Conversion progress"
          />
        </span>
      );
    case "done": {
      const byline = status.authors.length > 0 ? `${status.authors.join(", ")} · ` : "";
      return (
        <span>
          {byline}
          {formatBytes(fileSize)} → {formatBytes(status.pdf.size)} PDF ·{" "}
          {formatDuration(status.durationMs)}
        </span>
      );
    }
    case "failed":
      return <span className="text-destructive">{status.message}</span>;
  }
};
