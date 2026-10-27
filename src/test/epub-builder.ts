/**
 * Builds small, valid EPUB archives in memory for tests. Every part has a sensible default,
 * so a test only spells out what it is actually about.
 */
import { strToU8, zipSync } from "fflate";

import { encodeRgbPng } from "@/core/images/png-encoder";

export type FixtureDocument = {
  /** Path relative to `OEBPS/`. */
  readonly href: string;
  readonly body: string;
  readonly head?: string;
  readonly linear?: boolean;
};

export type FixtureOptions = {
  readonly title?: string;
  readonly creators?: readonly string[];
  readonly documents?: readonly FixtureDocument[];
  /** Inner HTML of the EPUB 3 `<nav epub:type="toc"><ol>`; omitted → no nav document. */
  readonly navList?: string;
  readonly navLinear?: boolean;
  /** Extra files relative to `OEBPS/` (stylesheets, images…). */
  readonly files?: Readonly<Record<string, string | Uint8Array>>;
  /** Path (relative to `OEBPS/`) of an image in `files` to declare as the cover. */
  readonly coverImage?: string;
};

/** A valid, opaque 3×2 RGB PNG — embeddable without decoding. */
export const RGB_PNG = encodeRgbPng(3, 2, new Uint8Array(3 * 2 * 4).fill(200));

/** A valid 1×1 RGBA PNG — needs alpha handling, i.e. canvas re-encoding. */
export const TINY_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (char) => char.codePointAt(0) ?? 0,
);

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const escapeXml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

export const xhtml = (body: string, head = ""): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>t</title>${head}</head><body>${body}</body></html>`;

const mediaTypeOf = (href: string): string => {
  if (href.endsWith(".css")) {
    return "text/css";
  }
  if (href.endsWith(".png")) {
    return "image/png";
  }
  if (href.endsWith(".jpg") || href.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/octet-stream";
};

const DEFAULT_DOCUMENTS: readonly FixtureDocument[] = [
  { href: "chapter1.xhtml", body: "<h1>Chapter One</h1><p>Hello world.</p>" },
];

export const buildEpub = ({
  title = "Fixture Book",
  creators = ["Test Author"],
  documents = DEFAULT_DOCUMENTS,
  navList,
  navLinear = false,
  files = {},
  coverImage,
}: FixtureOptions = {}): Uint8Array => {
  const manifest = [
    ...documents.map(
      (document, index) =>
        `<item id="doc${index}" href="${escapeXml(encodeURI(document.href))}" media-type="application/xhtml+xml"/>`,
    ),
    ...Object.keys(files).map(
      (href, index) =>
        `<item id="file${index}" href="${escapeXml(encodeURI(href))}" media-type="${mediaTypeOf(href)}"${
          href === coverImage ? ' properties="cover-image"' : ""
        }/>`,
    ),
    ...(navList === undefined
      ? []
      : ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>']),
  ];
  const spine = [
    ...(navList === undefined
      ? []
      : [`<itemref idref="nav" linear="${navLinear ? "yes" : "no"}"/>`]),
    ...documents.map(
      (document, index) =>
        `<itemref idref="doc${index}"${document.linear === false ? ' linear="no"' : ""}/>`,
    ),
  ];
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">fixture</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    ${creators.map((creator) => `<dc:creator>${escapeXml(creator)}</dc:creator>`).join("")}
    <dc:language>en</dc:language>
  </metadata>
  <manifest>${manifest.join("")}</manifest>
  <spine>${spine.join("")}</spine>
</package>`;

  const entries: Record<string, Uint8Array> = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(CONTAINER),
    "OEBPS/content.opf": strToU8(opf),
  };
  for (const document of documents) {
    entries[`OEBPS/${document.href}`] = strToU8(xhtml(document.body, document.head));
  }
  for (const [href, content] of Object.entries(files)) {
    entries[`OEBPS/${href}`] = typeof content === "string" ? strToU8(content) : content;
  }
  if (navList !== undefined) {
    entries["OEBPS/nav.xhtml"] = strToU8(xhtml(`<nav epub:type="toc"><ol>${navList}</ol></nav>`));
  }
  return zipSync(entries);
};
