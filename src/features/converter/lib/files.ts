import { zipSync } from "fflate";

import type { CompletedJob } from "@/features/converter/model/job";

const EPUB_EXTENSION = /\.epub$/iu;
// Control characters are deliberately matched: they are invalid in file names.
// oxlint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001F]+/gu;

export const isEpubFile = (file: File): boolean =>
  EPUB_EXTENSION.test(file.name) || file.type === "application/epub+zip";

export const pdfFileName = (epubName: string): string => {
  const base = epubName.replace(EPUB_EXTENSION, "").replaceAll(UNSAFE_FILENAME_CHARS, "_").trim();
  return `${base === "" ? "book" : base}.pdf`;
};

export const formatBytes = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 || value >= 10 ? 0 : 1)} ${units[unit] ?? "B"}`;
};

export const formatDuration = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

/** Triggers a browser download for a blob without leaking its object URL. */
export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

/** Opens a PDF in the browser's built-in viewer in a new tab. */
export const openBlob = (blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // Give the new tab ample time to load before releasing the URL.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
};

/** Appends " (2)", " (3)", … to repeated names so archive entries never collide (case-insensitively). */
const uniqueNames = (names: readonly string[]): string[] => {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let counter = 2; taken.has(candidate.toLowerCase()); counter++) {
      candidate = name.replace(/\.pdf$/u, ` (${counter}).pdf`);
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
};

/** Bundles finished PDFs into a ZIP. PDFs are already compressed, so entries are stored as-is. */
export const zipPdfs = async (jobs: readonly CompletedJob[]): Promise<Blob> => {
  const names = uniqueNames(jobs.map((job) => pdfFileName(job.file.name)));
  const contents = await Promise.all(
    jobs.map(async (job) => new Uint8Array(await job.status.pdf.arrayBuffer())),
  );
  const archive = zipSync(
    Object.fromEntries(
      names.map((name, index) => [name, [contents[index] ?? new Uint8Array(), { level: 0 }]]),
    ),
  );
  return new Blob([archive], { type: "application/zip" });
};
