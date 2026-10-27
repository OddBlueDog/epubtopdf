import { FileArchiveIcon, LoaderCircleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadBlob, zipPdfs } from "@/features/converter/lib/files";
import type { CompletedJob, ConversionJob, JobId } from "@/features/converter/model/job";

type JobListToolbarProps = {
  readonly jobs: readonly ConversionJob[];
  readonly completed: readonly CompletedJob[];
  readonly outdated: readonly CompletedJob[];
  readonly activeCount: number;
  readonly onSelectAll: (selected: boolean) => void;
  readonly onReconvert: (ids: readonly JobId[]) => void;
  readonly onRemove: (ids: readonly JobId[]) => void;
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export const JobListToolbar = ({
  jobs,
  completed,
  outdated,
  activeCount,
  onSelectAll,
  onReconvert,
  onRemove,
}: JobListToolbarProps) => {
  const [zipping, setZipping] = useState(false);
  const selectedCount = jobs.filter((job) => job.selected).length;
  const selectedReady = completed.filter((job) => job.selected);
  const allSelected = selectedCount === jobs.length;

  const downloadZip = async (): Promise<void> => {
    setZipping(true);
    try {
      downloadBlob(await zipPdfs(selectedReady), "converted-pdfs.zip");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex items-center gap-2.5 px-3 text-sm font-medium">
        <Checkbox
          checked={allSelected ? true : selectedCount === 0 ? false : "indeterminate"}
          aria-label="Select all"
          onCheckedChange={() => {
            onSelectAll(!allSelected);
          }}
        />
        <span>
          {selectedCount > 0
            ? `${selectedCount} of ${jobs.length} selected`
            : plural(jobs.length, "file")}
          {activeCount > 0 ? (
            <span className="text-muted-foreground"> · {activeCount} converting</span>
          ) : null}
        </span>
      </label>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {outdated.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onReconvert(outdated.map((job) => job.id));
            }}
          >
            <RefreshCwIcon />
            Apply new settings ({outdated.length})
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={selectedCount === 0}
          onClick={() => {
            onRemove(jobs.filter((job) => job.selected).map((job) => job.id));
          }}
        >
          <Trash2Icon />
          Remove
        </Button>
        <Button
          size="sm"
          disabled={selectedReady.length === 0 || zipping}
          onClick={() => void downloadZip()}
        >
          {zipping ? <LoaderCircleIcon className="animate-spin" /> : <FileArchiveIcon />}
          Download {selectedReady.length > 0 ? plural(selectedReady.length, "PDF") : "PDFs"} as ZIP
        </Button>
      </div>
    </div>
  );
};
