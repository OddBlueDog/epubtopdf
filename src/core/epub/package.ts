import type { EpubArchive } from "@/core/epub/archive";
import { resolveHref } from "@/core/epub/paths";
import { ConversionError } from "@/core/errors";
import type { Element } from "@/core/xml/dom";
import {
  attr,
  byLocalName,
  childElements,
  findAll,
  findFirst,
  localName,
  parseXml,
  text,
} from "@/core/xml/dom";

export type ManifestItem = {
  readonly id: string;
  /** Archive path, resolved relative to the package document. */
  readonly path: string;
  readonly mediaType: string;
  readonly properties: ReadonlySet<string>;
};

export type SpineItem = {
  readonly item: ManifestItem;
  readonly linear: boolean;
};

export type EpubMetadata = {
  readonly title: string | undefined;
  readonly creators: readonly string[];
  readonly language: string | undefined;
  readonly publisher: string | undefined;
  readonly subjects: readonly string[];
  /** Every `dc:identifier`, in document order. */
  readonly identifiers: readonly string[];
  /** The identifier named by `<package unique-identifier>` (the font obfuscation key). */
  readonly uniqueIdentifier: string | undefined;
};

export type EpubPackage = {
  readonly path: string;
  readonly metadata: EpubMetadata;
  readonly manifest: ReadonlyMap<string, ManifestItem>;
  readonly spine: readonly SpineItem[];
  readonly cover: ManifestItem | undefined;
  readonly nav: ManifestItem | undefined;
  readonly ncx: ManifestItem | undefined;
};

const CONTAINER_PATH = "META-INF/container.xml";

const locatePackagePath = (archive: EpubArchive): string => {
  const container = archive.text(CONTAINER_PATH);
  if (container === undefined) {
    throw new ConversionError("missing-container", "This EPUB has no META-INF/container.xml.");
  }
  const rootfile = findFirst(parseXml(container), byLocalName("rootfile"));
  const path = rootfile === undefined ? undefined : attr(rootfile, "full-path");
  if (path === undefined || path === "") {
    throw new ConversionError(
      "missing-package",
      "The EPUB container does not name a package file.",
    );
  }
  return path;
};

const parseManifest = (
  manifest: Element | undefined,
  packagePath: string,
): Map<string, ManifestItem> => {
  const items = new Map<string, ManifestItem>();
  for (const element of manifest === undefined ? [] : childElements(manifest)) {
    const id = attr(element, "id");
    const href = attr(element, "href");
    const resolved = href === undefined ? undefined : resolveHref(packagePath, href);
    if (localName(element) !== "item" || id === undefined || resolved === undefined) {
      continue;
    }
    items.set(id, {
      id,
      path: resolved.path,
      mediaType: (attr(element, "media-type") ?? "").toLowerCase(),
      properties: new Set((attr(element, "properties") ?? "").split(/\s+/u).filter(Boolean)),
    });
  }
  return items;
};

const parseSpine = (
  spine: Element | undefined,
  manifest: ReadonlyMap<string, ManifestItem>,
): SpineItem[] =>
  (spine === undefined ? [] : childElements(spine)).flatMap((element) => {
    const item = manifest.get(attr(element, "idref") ?? "");
    if (localName(element) !== "itemref" || item === undefined) {
      return [];
    }
    return [{ item, linear: attr(element, "linear") !== "no" }];
  });

const parseMetadata = (
  metadata: Element | undefined,
  uniqueId: string | undefined,
): EpubMetadata => {
  const values = (name: string): string[] =>
    metadata === undefined
      ? []
      : findAll(metadata, byLocalName(name))
          .map((element) => text(element))
          .filter(Boolean);
  return {
    title: values("title")[0],
    creators: values("creator"),
    language: values("language")[0],
    publisher: values("publisher")[0],
    subjects: values("subject"),
    identifiers: values("identifier"),
    uniqueIdentifier:
      metadata === undefined
        ? undefined
        : findAll(metadata, byLocalName("identifier"))
            .filter((element) => uniqueId !== undefined && attr(element, "id") === uniqueId)
            .map((element) => text(element))[0],
  };
};

const isImage = (item: ManifestItem): boolean => item.mediaType.startsWith("image/");

const findCover = (
  metadata: Element | undefined,
  manifest: ReadonlyMap<string, ManifestItem>,
): ManifestItem | undefined => {
  const items = [...manifest.values()];
  // EPUB 3: <item properties="cover-image">
  const epub3 = items.find((item) => item.properties.has("cover-image"));
  if (epub3 !== undefined) {
    return epub3;
  }
  // EPUB 2: <meta name="cover" content="item-id">
  const meta =
    metadata === undefined
      ? undefined
      : findAll(metadata, byLocalName("meta")).find((element) => attr(element, "name") === "cover");
  const metaItem = manifest.get(meta === undefined ? "" : (attr(meta, "content") ?? ""));
  if (metaItem !== undefined && isImage(metaItem)) {
    return metaItem;
  }
  // Heuristic fallback used by many generators.
  return items.find((item) => isImage(item) && /cover/iu.test(`${item.id} ${item.path}`));
};

export const readPackage = (archive: EpubArchive): EpubPackage => {
  const path = locatePackagePath(archive);
  const source = archive.text(path);
  if (source === undefined) {
    throw new ConversionError("missing-package", `The package file "${path}" is missing.`);
  }
  const root = parseXml(source);
  const packageElement = findFirst(root, byLocalName("package"));
  const metadataElement = findFirst(root, byLocalName("metadata"));
  const spineElement = findFirst(root, byLocalName("spine"));
  const manifest = parseManifest(findFirst(root, byLocalName("manifest")), path);
  const items = [...manifest.values()];
  const tocId = spineElement === undefined ? undefined : attr(spineElement, "toc");

  return {
    path,
    metadata: parseMetadata(
      metadataElement,
      packageElement === undefined ? undefined : attr(packageElement, "unique-identifier"),
    ),
    manifest,
    spine: parseSpine(spineElement, manifest),
    cover: findCover(metadataElement, manifest),
    nav: items.find((item) => item.properties.has("nav")),
    ncx:
      (tocId === undefined ? undefined : manifest.get(tocId)) ??
      items.find((item) => item.mediaType === "application/x-dtbncx+xml"),
  };
};
