/// <reference lib="webworker" />
/**
 * Conversion worker: one instance per job, terminated afterwards so all memory
 * (archive, images, renderer state) is released and jobs can be cancelled instantly.
 */
import type { ConversionProgress, ConversionStage } from "@/core/convert";
import { convertEpubToPdf } from "@/core/convert";
import { describeError } from "@/core/errors";
import { parseSettings } from "@/core/settings";
import { fetchFont } from "@/worker/font-assets";
import type { ConvertRequest, WorkerResponse } from "@/worker/protocol";

declare const self: DedicatedWorkerGlobalScope;

const post = (message: WorkerResponse, transfer: Transferable[] = []): void => {
  self.postMessage(message, transfer);
};

const isConvertRequest = (data: unknown): data is ConvertRequest =>
  typeof data === "object" &&
  data !== null &&
  Reflect.get(data, "type") === "convert" &&
  Reflect.get(data, "epub") instanceof ArrayBuffer &&
  typeof Reflect.get(data, "fileName") === "string";

/** Minimum change in overall progress worth telling the UI about (pdfmake reports per item). */
const PROGRESS_STEP = 0.01;
let lastReported: { stage: ConversionStage; fraction: number } | undefined;

const reportProgress = ({ stage, fraction }: ConversionProgress): void => {
  if (lastReported?.stage === stage && fraction - lastReported.fraction < PROGRESS_STEP) {
    return;
  }
  lastReported = { stage, fraction };
  post({ type: "progress", stage, fraction });
};

const handle = async (request: ConvertRequest): Promise<void> => {
  try {
    const result = await convertEpubToPdf({
      epub: new Uint8Array(request.epub),
      fileName: request.fileName,
      // Never trust structured-clone input blindly.
      settings: parseSettings(request.settings),
      loadFont: fetchFont,
      onProgress: reportProgress,
    });
    const pdf = result.pdf.buffer;
    post({ type: "done", pdf, title: result.title, authors: result.authors }, [pdf]);
  } catch (error) {
    post({ type: "error", ...describeError(error) });
  }
};

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (isConvertRequest(event.data)) {
    void handle(event.data);
  }
});
