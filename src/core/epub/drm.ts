/**
 * DRM detection. DRM-protected books are refused outright: their content is encrypted with
 * keys bound to a reader's account or device, and circumventing that is not something this
 * tool does. Font obfuscation (IDPF/Adobe) is not DRM and is handled separately.
 */
import type { EpubArchive } from "@/core/epub/archive";
import { FONT_OBFUSCATION_ALGORITHMS } from "@/core/epub/font-obfuscation";
import { attr, byLocalName, findAll, findFirst, parseXml } from "@/core/xml/dom";

export type DrmScheme = "adobe-adept" | "apple-fairplay" | "readium-lcp" | "encrypted";

export const DRM_LABELS: Readonly<Record<DrmScheme, string>> = {
  "adobe-adept": "Adobe DRM",
  "apple-fairplay": "Apple FairPlay DRM",
  "readium-lcp": "Readium LCP DRM",
  encrypted: "encryption",
};

/** Licence files that only DRM schemes add to an EPUB container. */
const LICENCE_FILES: readonly (readonly [path: string, scheme: DrmScheme])[] = [
  ["META-INF/rights.xml", "adobe-adept"],
  ["META-INF/sinf.xml", "apple-fairplay"],
  ["META-INF/license.lcpl", "readium-lcp"],
  ["license.lcpl", "readium-lcp"],
];

/** Whether `encryption.xml` encrypts anything with a real cipher rather than font obfuscation. */
const hasEncryptedResources = (archive: EpubArchive): boolean => {
  const source = archive.text("META-INF/encryption.xml");
  if (source === undefined) {
    return false;
  }
  return findAll(parseXml(source), byLocalName("encrypteddata")).some((data) => {
    const method = findFirst(data, byLocalName("encryptionmethod"));
    const algorithm = method === undefined ? undefined : attr(method, "Algorithm");
    return algorithm === undefined || !FONT_OBFUSCATION_ALGORITHMS.has(algorithm);
  });
};

/** Identifies the DRM scheme protecting a book, or `undefined` for a DRM-free EPUB. */
export const detectDrm = (archive: EpubArchive): DrmScheme | undefined => {
  const licence = LICENCE_FILES.find(([path]) => archive.has(path));
  if (licence !== undefined) {
    return licence[1];
  }
  return hasEncryptedResources(archive) ? "encrypted" : undefined;
};
