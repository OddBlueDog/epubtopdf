import type { EpubArchive } from "@/core/epub/archive";
import { openArchive } from "@/core/epub/archive";
import type { EpubPackage } from "@/core/epub/package";
import { readPackage } from "@/core/epub/package";
import type { TocEntry } from "@/core/epub/toc";
import { readToc } from "@/core/epub/toc";

/** A parsed-but-not-yet-rendered EPUB: raw files plus its structural metadata. */
export type EpubBook = {
  readonly archive: EpubArchive;
  readonly pkg: EpubPackage;
  readonly toc: readonly TocEntry[];
};

export const loadEpub = (data: Uint8Array): EpubBook => {
  const archive = openArchive(data);
  const pkg = readPackage(archive);
  return { archive, pkg, toc: readToc(archive, pkg) };
};
