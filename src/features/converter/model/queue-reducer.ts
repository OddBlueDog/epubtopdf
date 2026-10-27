import type { ConversionStage } from "@/core/convert";
import type { ConversionSettings } from "@/core/settings";
import type { ConversionJob, JobId, JobStatus } from "@/features/converter/model/job";

export type QueueState = {
  readonly jobs: readonly ConversionJob[];
};

export type QueueAction =
  | {
      readonly type: "add";
      readonly jobs: readonly { readonly id: JobId; readonly file: File }[];
      readonly settings: ConversionSettings;
    }
  | {
      readonly type: "requeue";
      readonly ids: readonly JobId[];
      readonly settings: ConversionSettings;
    }
  | { readonly type: "started"; readonly id: JobId }
  | {
      readonly type: "progress";
      readonly id: JobId;
      readonly stage: ConversionStage;
      readonly progress: number;
    }
  | { readonly type: "finished"; readonly id: JobId; readonly status: JobStatus }
  | { readonly type: "remove"; readonly ids: readonly JobId[] }
  | { readonly type: "select"; readonly id: JobId; readonly selected: boolean }
  | { readonly type: "selectAll"; readonly selected: boolean };

export const INITIAL_QUEUE: QueueState = { jobs: [] };

const updateJob = (
  state: QueueState,
  id: JobId,
  update: (job: ConversionJob) => ConversionJob,
): QueueState => ({
  jobs: state.jobs.map((job) => (job.id === id ? update(job) : job)),
});

/** Pure state transitions for the conversion queue. Side effects live in `useConversionQueue`. */
export const queueReducer = (state: QueueState, action: QueueAction): QueueState => {
  switch (action.type) {
    case "add":
      return {
        jobs: [
          ...state.jobs,
          ...action.jobs.map(({ id, file }): ConversionJob => ({
            id,
            file,
            selected: true,
            status: { kind: "queued", settings: action.settings },
          })),
        ],
      };
    case "requeue": {
      const ids = new Set(action.ids);
      return {
        jobs: state.jobs.map((job) =>
          ids.has(job.id) ? { ...job, status: { kind: "queued", settings: action.settings } } : job,
        ),
      };
    }
    case "started":
      return updateJob(state, action.id, (job) =>
        job.status.kind === "queued"
          ? {
              ...job,
              status: {
                kind: "converting",
                settings: job.status.settings,
                stage: "reading",
                progress: 0,
              },
            }
          : job,
      );
    case "progress":
      return updateJob(state, action.id, (job) =>
        job.status.kind === "converting"
          ? { ...job, status: { ...job.status, stage: action.stage, progress: action.progress } }
          : job,
      );
    case "finished":
      return updateJob(state, action.id, (job) => ({ ...job, status: action.status }));
    case "remove": {
      const ids = new Set(action.ids);
      return { jobs: state.jobs.filter((job) => !ids.has(job.id)) };
    }
    case "select":
      return updateJob(state, action.id, (job) => ({ ...job, selected: action.selected }));
    case "selectAll":
      return { jobs: state.jobs.map((job) => ({ ...job, selected: action.selected })) };
  }
};
