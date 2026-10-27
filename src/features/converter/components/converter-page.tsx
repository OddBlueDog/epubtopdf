import { InfoIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { parseSettings } from "@/core/settings";
import { FileDropZone } from "@/features/converter/components/file-drop-zone";
import { JobListItem } from "@/features/converter/components/job-list-item";
import { JobListToolbar } from "@/features/converter/components/job-list-toolbar";
import { SettingsPanel } from "@/features/converter/components/settings/settings-panel";
import { useConversionQueue } from "@/features/converter/hooks/use-conversion-queue";
import type { ConversionJob } from "@/features/converter/model/job";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";

const SETTINGS_STORAGE_KEY = "epubtopdf:settings";

/** Feature root: wires settings, the queue and the presentational pieces together. */
export const ConverterPage = () => {
  const [settings, setSettings] = useLocalStorageState(SETTINGS_STORAGE_KEY, parseSettings);
  const queue = useConversionQueue(settings);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const outdatedIds = new Set(queue.outdated.map((job) => job.id));

  const addFiles = useCallback(
    (files: readonly File[]) => {
      const { rejected } = queue.addFiles(files);
      setNotice(
        rejected > 0
          ? `Skipped ${rejected} file${rejected === 1 ? "" : "s"} that ${rejected === 1 ? "isn't an EPUB" : "aren't EPUBs"}.`
          : undefined,
      );
    },
    [queue],
  );

  const printJob = useCallback(
    (job: ConversionJob) => {
      setNotice(undefined);
      import("@/features/converter/lib/print-exact")
        .then(({ printExactCopy }) => printExactCopy(job.file, settings))
        .catch((error: unknown) => {
          setNotice(error instanceof Error ? error.message : "Printing failed.");
        });
    },
    [settings],
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Files" className="flex min-w-0 flex-col gap-4">
        <FileDropZone onFiles={addFiles} compact={queue.jobs.length > 0} />
        {notice === undefined ? null : (
          <output className="flex items-center gap-2 text-sm text-muted-foreground">
            <InfoIcon className="size-4" />
            {notice}
          </output>
        )}
        {queue.jobs.length > 0 ? (
          <>
            <JobListToolbar
              jobs={queue.jobs}
              completed={queue.completed}
              outdated={queue.outdated}
              activeCount={queue.activeCount}
              onSelectAll={queue.setAllSelected}
              onReconvert={queue.reconvert}
              onRemove={queue.remove}
            />
            <ul className="flex flex-col gap-2">
              {queue.jobs.map((job) => (
                <li key={job.id}>
                  <JobListItem
                    job={job}
                    outdated={outdatedIds.has(job.id)}
                    onSelect={queue.setSelected}
                    onRetry={queue.reconvert}
                    onRemove={queue.remove}
                    onPrint={printJob}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
      <aside aria-label="Settings" className="lg:sticky lg:top-6">
        <SettingsPanel settings={settings} onChange={setSettings} />
      </aside>
    </div>
  );
};
