import {
  OBFUSCATED_LENGTH,
  obfuscationKey,
  readObfuscatedResources,
  xorHead,
} from "@/core/epub/font-obfuscation";
/**
 * "Print exact copy": lays the book out with the browser's own engine — the publisher's
 * fonts and CSS, untouched — and opens the system print dialog (Save as PDF).
 *
 * The document is rendered in a sandboxed iframe: scripts can never run (no `allow-scripts`),
 * every resource is a same-origin `blob:` URL, and nothing touches the network.
 */
import { loadEpub } from "@/core/epub/load-epub";
import { sniffImageFormat } from "@/core/images/image-format";
import { buildPrintDocument } from "@/core/print/build-print-document";
import type { ConversionSettings } from "@/core/settings";

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  css: "text/css",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  svg: "image/svg+xml",
};

const IMAGE_MIME: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

const mimeTypeOf = (path: string, bytes: Uint8Array): string => {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    MIME_BY_EXTENSION[extension] ??
    IMAGE_MIME[sniffImageFormat(bytes)] ??
    "application/octet-stream"
  );
};

const waitForLoad = (iframe: HTMLIFrameElement): Promise<void> =>
  new Promise((resolve) => {
    iframe.addEventListener(
      "load",
      () => {
        resolve();
      },
      { once: true },
    );
  });

/** Waits for web fonts and images so the printout isn't missing glyphs or pictures. */
const waitForResources = async (document: Document): Promise<void> => {
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map(async (image) => {
      try {
        await image.decode();
      } catch {
        // A broken image prints as nothing, exactly as in a browser.
      }
    }),
  );
};

export const printExactCopy = async (file: File, settings: ConversionSettings): Promise<void> => {
  const book = loadEpub(new Uint8Array(await file.arrayBuffer()));
  const obfuscated = readObfuscatedResources(book.archive);
  const keys = new Map(
    await Promise.all(
      [...new Set(obfuscated.values())].map(
        async (algorithm) =>
          [algorithm, await obfuscationKey(algorithm, book.pkg.metadata)] as const,
      ),
    ),
  );

  const urls = new Map<string, string>();
  const resourceUrl = (path: string): string | undefined => {
    const cached = urls.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const raw = book.archive.bytes(path);
    if (raw === undefined) {
      return undefined;
    }
    const algorithm = obfuscated.get(path);
    const key = algorithm === undefined ? undefined : keys.get(algorithm);
    const bytes =
      algorithm === undefined || key === undefined
        ? raw
        : xorHead(raw, key, OBFUSCATED_LENGTH[algorithm]);
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: mimeTypeOf(path, bytes) }));
    urls.set(path, url);
    return url;
  };

  const html = buildPrintDocument(book, { settings, resourceUrl });

  const iframe = document.createElement("iframe");
  // allow-same-origin: the parent may drive print() and the blob: URLs resolve.
  // allow-modals: required for print(). Deliberately no allow-scripts.
  iframe.setAttribute("sandbox", "allow-same-origin allow-modals");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  const loaded = waitForLoad(iframe);
  iframe.srcdoc = html;
  document.body.append(iframe);

  const cleanup = (): void => {
    iframe.remove();
    for (const url of urls.values()) {
      URL.revokeObjectURL(url);
    }
  };

  try {
    await loaded;
    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument;
    if (frameWindow === null || frameDocument === null) {
      throw new Error("The print preview could not be prepared.");
    }
    await waitForResources(frameDocument);
    frameWindow.addEventListener(
      "afterprint",
      () => {
        setTimeout(cleanup, 1000);
      },
      { once: true },
    );
    frameWindow.focus();
    frameWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
};
