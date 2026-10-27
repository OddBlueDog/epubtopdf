import {
  BookOpenIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PrinterIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JobStatusBadge, JobStatusDetail } from "@/features/converter/components/job-status";
import { downloadBlob, openBlob, pdfFileName } from "@/features/converter/lib/files";
import type { ConversionJob, JobId } from "@/features/converter/model/job";
import { isPermanentFailure } from "@/features/converter/model/job";

type JobListItemProps = {
  readonly job: ConversionJob;
  readonly outdated: boolean;
  readonly onSelect: (id: JobId, selected: boolean) => void;
  readonly onRetry: (ids: readonly JobId[]) => void;
  readonly onRemove: (ids: readonly JobId[]) => void;
  readonly onPrint: (job: ConversionJob) => void;
};

const IconAction = ({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

export const JobListItem = memo(
  ({ job, outdated, onSelect, onRetry, onRemove, onPrint }: JobListItemProps) => {
    const { status } = job;
    const title =
      status.kind === "done" && status.title !== undefined ? status.title : job.file.name;
    const checkboxId = `select-${job.id}`;

    return (
      <Item variant="outline" className="bg-card">
        <Checkbox
          id={checkboxId}
          checked={job.selected}
          aria-label={`Select ${job.file.name}`}
          onCheckedChange={(checked) => {
            onSelect(job.id, checked === true);
          }}
        />
        <ItemMedia variant="icon" className="hidden sm:flex">
          <BookOpenIcon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full">
            <label htmlFor={checkboxId} className="truncate" title={job.file.name}>
              {title}
            </label>
          </ItemTitle>
          <div className="truncate text-sm text-muted-foreground">
            <JobStatusDetail status={status} fileSize={job.file.size} />
          </div>
        </ItemContent>
        <ItemActions className="gap-1">
          <JobStatusBadge status={status} outdated={outdated} />
          {status.kind === "done" ? (
            <>
              <IconAction
                label="Open in new tab"
                onClick={() => {
                  openBlob(status.pdf);
                }}
              >
                <ExternalLinkIcon />
              </IconAction>
              <Button
                size="sm"
                variant={outdated ? "outline" : "default"}
                onClick={() => {
                  downloadBlob(status.pdf, pdfFileName(job.file.name));
                }}
              >
                <DownloadIcon />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </>
          ) : null}
          {(status.kind === "failed" && !isPermanentFailure(status)) || outdated ? (
            <IconAction
              label={outdated ? "Convert again with current settings" : "Retry"}
              onClick={() => {
                onRetry([job.id]);
              }}
            >
              <RotateCwIcon />
            </IconAction>
          ) : null}
          <IconAction
            label="Print exact copy (browser layout, Save as PDF)"
            onClick={() => {
              onPrint(job);
            }}
          >
            <PrinterIcon />
          </IconAction>
          <IconAction
            label={status.kind === "converting" ? "Cancel and remove" : "Remove"}
            onClick={() => {
              onRemove([job.id]);
            }}
          >
            <XIcon />
          </IconAction>
        </ItemActions>
      </Item>
    );
  },
);
JobListItem.displayName = "JobListItem";
