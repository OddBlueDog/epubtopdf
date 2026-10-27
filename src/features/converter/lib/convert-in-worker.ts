import type { ConversionProgress } from "@/core/convert";
import { ConversionError } from "@/core/errors";
import type { ConversionSettings } from "@/core/settings";
import type { ConvertRequest, WorkerResponse } from "@/worker/protocol";

export type WorkerResult = {
  readonly pdf: Blob;
  readonly title: string | undefined;
  readonly authors: readonly string[];
};

export type ConversionTask = {
  readonly result: Promise<WorkerResult>;
  readonly cancel: () => void;
};

/**
 * Runs one conversion in a dedicated worker. The worker is terminated when the task
 * settles or is cancelled, which frees all of its memory immediately.
 */
export const convertInWorker = (
  file: File,
  settings: ConversionSettings,
  onProgress: (progress: ConversionProgress) => void,
): ConversionTask => {
  const worker = new Worker(new URL("../../../worker/convert.worker.ts", import.meta.url), {
    type: "module",
    name: `convert:${file.name}`,
  });
  const { promise, resolve, reject } = Promise.withResolvers<WorkerResult>();

  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    switch (message.type) {
      case "progress":
        onProgress({ stage: message.stage, fraction: message.fraction });
        break;
      case "done":
        resolve({
          pdf: new Blob([message.pdf], { type: "application/pdf" }),
          title: message.title,
          authors: message.authors,
        });
        break;
      case "error":
        reject(new ConversionError(message.code, message.message));
        break;
    }
  });
  worker.addEventListener("error", (event) => {
    reject(new ConversionError("render-failed", event.message || "The conversion worker crashed."));
  });

  const start = async (): Promise<void> => {
    try {
      const epub = await file.arrayBuffer();
      const request: ConvertRequest = { type: "convert", fileName: file.name, epub, settings };
      worker.postMessage(request, [epub]);
    } catch (error) {
      reject(
        new ConversionError("invalid-archive", "The file could not be read.", { cause: error }),
      );
    }
  };
  void start();

  const result = promise.finally(() => {
    worker.terminate();
  });

  return {
    result,
    cancel: () => {
      worker.terminate();
      reject(new ConversionError("cancelled", "Conversion cancelled."));
    },
  };
};
