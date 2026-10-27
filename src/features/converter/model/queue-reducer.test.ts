import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/core/settings";
import type { QueueAction, QueueState } from "@/features/converter/model/queue-reducer";
import { INITIAL_QUEUE, queueReducer } from "@/features/converter/model/queue-reducer";

const file = (name: string): File => new File(["x"], name);

const withJobs = (...ids: string[]): QueueState =>
  queueReducer(INITIAL_QUEUE, {
    type: "add",
    jobs: ids.map((id) => ({ id, file: file(`${id}.epub`) })),
    settings: DEFAULT_SETTINGS,
  });

const done = {
  kind: "done",
  pdf: new Blob(),
  settingsKey: "k",
  title: undefined,
  authors: [],
  durationMs: 1,
} as const;

describe("queueReducer", () => {
  it("adds jobs queued and selected, preserving order", () => {
    const state = withJobs("a", "b");
    expect(state.jobs.map((job) => [job.id, job.status.kind, job.selected])).toEqual([
      ["a", "queued", true],
      ["b", "queued", true],
    ]);
  });

  it("walks a job through its lifecycle", () => {
    let state = withJobs("a");
    state = queueReducer(state, { type: "started", id: "a" });
    expect(state.jobs[0]?.status).toMatchObject({ kind: "converting", progress: 0 });
    state = queueReducer(state, { type: "progress", id: "a", stage: "rendering", progress: 0.5 });
    expect(state.jobs[0]?.status).toMatchObject({
      kind: "converting",
      stage: "rendering",
      progress: 0.5,
    });
    state = queueReducer(state, { type: "finished", id: "a", status: done });
    expect(state.jobs[0]?.status.kind).toBe("done");
  });

  it("ignores stale progress for jobs that are not converting", () => {
    const state = withJobs("a");
    expect(
      queueReducer(state, { type: "progress", id: "a", stage: "images", progress: 0.3 }),
    ).toEqual(state);
  });

  it("requeues finished jobs with new settings", () => {
    let state = queueReducer(withJobs("a"), { type: "finished", id: "a", status: done });
    state = queueReducer(state, {
      type: "requeue",
      ids: ["a"],
      settings: { ...DEFAULT_SETTINGS, marginMm: 3 },
    });
    expect(state.jobs[0]?.status).toMatchObject({ kind: "queued", settings: { marginMm: 3 } });
  });

  const action: fc.Arbitrary<QueueAction> = fc.oneof(
    fc.record({
      type: fc.constant("select" as const),
      id: fc.constantFrom("a", "b", "c", "z"),
      selected: fc.boolean(),
    }),
    fc.record({ type: fc.constant("selectAll" as const), selected: fc.boolean() }),
    fc.record({
      type: fc.constant("remove" as const),
      ids: fc.array(fc.constantFrom("a", "b", "c", "z")),
    }),
    fc.record({ type: fc.constant("started" as const), id: fc.constantFrom("a", "b", "c") }),
  );

  test.prop([fc.array(action, { maxLength: 20 })])(
    "never invents, duplicates or reorders jobs",
    (actions) => {
      const final = actions.reduce(
        (state, next) => queueReducer(state, next),
        withJobs("a", "b", "c"),
      );
      const ids = final.jobs.map((job) => job.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(["a", "b", "c"].filter((id) => ids.includes(id)));
    },
  );

  test.prop([fc.array(action, { maxLength: 20 }), fc.boolean()])(
    "selectAll always wins over prior selection",
    (actions, selected) => {
      const state = queueReducer(
        actions.reduce((current, next) => queueReducer(current, next), withJobs("a", "b", "c")),
        {
          type: "selectAll",
          selected,
        },
      );
      expect(state.jobs.every((job) => job.selected === selected)).toBe(true);
    },
  );
});
