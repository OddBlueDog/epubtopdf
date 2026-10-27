/**
 * Typed adapter over pdfmake's prebuilt browser bundle.
 *
 * The bundle is a UMD script that registers itself on `globalThis.pdfMake`; its published
 * typings also under-describe the virtual file system (it accepts raw bytes, not just base64).
 * This module narrows the runtime value to exactly the surface we rely on, validated at load.
 */
import "pdfmake/build/pdfmake";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

export type VirtualFile = { readonly data: Uint8Array };

export type PdfMakeRuntime = {
  readonly addVirtualFileSystem: (vfs: Readonly<Record<string, VirtualFile>>) => void;
  readonly addFonts: (fonts: TFontDictionary) => void;
  readonly setProgressCallback: (callback: (progress: number) => void) => void;
  readonly createPdf: (definition: TDocumentDefinitions) => {
    readonly getBuffer: () => Promise<Uint8Array>;
  };
};

const REQUIRED_METHODS = [
  "addVirtualFileSystem",
  "addFonts",
  "setProgressCallback",
  "createPdf",
] as const;

const isPdfMakeRuntime = (value: unknown): value is PdfMakeRuntime =>
  typeof value === "object" &&
  value !== null &&
  REQUIRED_METHODS.every((method) => typeof Reflect.get(value, method) === "function");

export const getPdfMake = (): PdfMakeRuntime => {
  const candidate: unknown = Reflect.get(globalThis, "pdfMake");
  if (!isPdfMakeRuntime(candidate)) {
    throw new Error("pdfmake failed to initialise");
  }
  return candidate;
};
