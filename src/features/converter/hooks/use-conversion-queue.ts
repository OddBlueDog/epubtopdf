import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { ConversionError } from "@/core/errors";
import type { ConversionSettings } from "@/core/settings";
import { settingsKey } from "@/core/settings";
import type { ConversionTask } from "@/features/converter/lib/convert-in-worker";
import { convertInWorker } from "@/features/converter/lib/convert-in-worker";
import { isEpubFile } from "@/features/converter/lib/files";
import type { CompletedJob, ConversionJob, JobId, JobStatus } from "@/features/converter/model/job";
import { isActive, isCompleted } from "@/features/converter/model/job";
import { INITIAL_QUEUE, queueReducer } from "@/features/converter/model/queue-reducer";

/** Each conversion is CPU-heavy; a couple in parallel keeps the UI responsive. */
const MAX_CONCURRENT = Math.max(
  1,
  Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2)),
);

export type ConversionQueue = {
  readonly jobs: readonly ConversionJob[];
  readonly completed: readonly CompletedJob[];
  /** Completed jobs whose output was produced with different settings than the current ones. */
  readonly outdated: readonly CompletedJob[];
  readonly activeCount: number;
  /** Adds files, returning how many were rejected for not being EPUBs. */
  readonly addFiles: (files: readonly File[]) => { readonly rejected: number };
  readonly reconvert: (ids: readonly JobId[]) => void;
  readonly remove: (ids: readonly JobId[]) => void;
  readonly setSelected: (id: JobId, selected: boolean) => void;
  readonly setAllSelected: (selected: boolean) => void;
};

/** Waits for a task and maps its outcome to a final job status. Cancellation reports nothing. */
const settle = async (
  task: ConversionTask,
  settings: ConversionSettings,
  report: (status: JobStatus) => void,
): Promise<void> => {
  const startedAt = performance.now();
  try {
    const { pdf, title, authors } = await task.result;
    report({
      kind: "done",
      pdf,
      title,
      authors,
      settingsKey: settingsKey(settings),
      durationMs: performance.now() - startedAt,
    });
  } catch (error) {
    if (error instanceof ConversionError && error.code === "cancelled") {
      return;
    }
    report({
      kind: "failed",
      code: error instanceof ConversionError ? error.code : "render-failed",
      message: error instanceof Error ? error.message : "Conversion failed.",
    });
  }
};

export const useConversionQueue = (settings: ConversionSettings): ConversionQueue => {
  const [state, dispatch] = useReducer(queueReducer, INITIAL_QUEUE);
  const tasks = useRef(new Map<JobId, ConversionTask>());

  // Scheduler: start queued jobs whenever a slot is free.
  useEffect(() => {
    const running = state.jobs.filter((job) => job.status.kind === "converting").length;
    const startable = state.jobs
      .filter((job) => job.status.kind === "queued")
      .slice(0, MAX_CONCURRENT - running);

    for (const job of startable) {
      if (job.status.kind !== "queued" || tasks.current.has(job.id)) {
        continue;
      }
      const jobSettings = job.status.settings;
      const task = convertInWorker(job.file, jobSettings, ({ stage, fraction }) => {
        dispatch({ type: "progress", id: job.id, stage, progress: fraction });
      });
      tasks.current.set(job.id, task);
      dispatch({ type: "started", id: job.id });

      void settle(task, jobSettings, (status) => {
        dispatch({ type: "finished", id: job.id, status });
      }).finally(() => {
        if (tasks.current.get(job.id) === task) {
          tasks.current.delete(job.id);
        }
      });
    }
  }, [state.jobs]);

  // Terminate any running workers when the component unmounts.
  useEffect(() => {
    const running = tasks.current;
    return () => {
      running.forEach((task) => {
        task.cancel();
      });
      running.clear();
    };
  }, []);

  const cancelTasks = useCallback((ids: readonly JobId[]) => {
    for (const id of ids) {
      tasks.current.get(id)?.cancel();
      tasks.current.delete(id);
    }
  }, []);

  const addFiles = useCallback(
    (files: readonly File[]) => {
      const accepted = files.filter((file) => isEpubFile(file));
      if (accepted.length > 0) {
        dispatch({
          type: "add",
          jobs: accepted.map((file) => ({ id: crypto.randomUUID(), file })),
          settings,
        });
      }
      return { rejected: files.length - accepted.length };
    },
    [settings],
  );

  const reconvert = useCallback(
    (ids: readonly JobId[]) => {
      cancelTasks(ids);
      dispatch({ type: "requeue", ids, settings });
    },
    [cancelTasks, settings],
  );

  const remove = useCallback(
    (ids: readonly JobId[]) => {
      cancelTasks(ids);
      dispatch({ type: "remove", ids });
    },
    [cancelTasks],
  );

  const setSelected = useCallback((id: JobId, selected: boolean) => {
    dispatch({ type: "select", id, selected });
  }, []);

  const setAllSelected = useCallback((selected: boolean) => {
    dispatch({ type: "selectAll", selected });
  }, []);

  const currentKey = settingsKey(settings);
  const completed = useMemo(() => state.jobs.filter(isCompleted), [state.jobs]);
  const outdated = useMemo(
    () => completed.filter((job) => job.status.settingsKey !== currentKey),
    [completed, currentKey],
  );

  return {
    jobs: state.jobs,
    completed,
    outdated,
    activeCount: state.jobs.filter(isActive).length,
    addFiles,
    reconvert,
    remove,
    setSelected,
    setAllSelected,
  };
};
