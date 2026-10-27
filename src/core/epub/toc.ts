import type { EpubArchive } from "@/core/epub/archive";
import type { EpubPackage, ManifestItem } from "@/core/epub/package";
import type { ResolvedHref } from "@/core/epub/paths";
import { resolveHref } from "@/core/epub/paths";
import type { Element } from "@/core/xml/dom";
import {
  attr,
  byLocalName,
  childElements,
  findAll,
  findFirst,
  localName,
  parseXhtml,
  parseXml,
  text,
} from "@/core/xml/dom";

export type TocEntry = {
  readonly title: string;
  readonly target: ResolvedHref | undefined;
  readonly children: readonly TocEntry[];
};

// ---------------------------------------------------------------------------
// EPUB 3 navigation document: <nav epub:type="toc"><ol><li><a href>…
// ---------------------------------------------------------------------------

const parseNavList = (list: Element, navPath: string): TocEntry[] =>
  childElements(list)
    .filter((element) => localName(element) === "li")
    .flatMap((item): TocEntry[] => {
      const label = childElements(item).find((child) => ["a", "span"].includes(localName(child)));
      const nested = childElements(item).find((child) => localName(child) === "ol");
      const children = nested === undefined ? [] : parseNavList(nested, navPath);
      const title = label === undefined ? "" : text(label);
      if (title === "") {
        return children;
      }
      const href = label === undefined ? undefined : attr(label, "href");
      return [
        { title, target: href === undefined ? undefined : resolveHref(navPath, href), children },
      ];
    });

const readNav = (archive: EpubArchive, nav: ManifestItem): TocEntry[] => {
  const source = archive.text(nav.path);
  if (source === undefined) {
    return [];
  }
  const navs = findAll(parseXhtml(source), byLocalName("nav"));
  const tocNav =
    navs.find((element) => (attr(element, "type") ?? "").split(/\s+/u).includes("toc")) ?? navs[0];
  const list = tocNav === undefined ? undefined : findFirst(tocNav, byLocalName("ol"));
  return list === undefined ? [] : parseNavList(list, nav.path);
};

// ---------------------------------------------------------------------------
// EPUB 2 NCX: <navMap><navPoint><navLabel><text/></navLabel><content src/>…
// ---------------------------------------------------------------------------

const parseNavPoints = (parent: Element, ncxPath: string): TocEntry[] =>
  childElements(parent)
    .filter((element) => localName(element) === "navpoint")
    .flatMap((point): TocEntry[] => {
      const label = childElements(point).find((child) => localName(child) === "navlabel");
      const content = childElements(point).find((child) => localName(child) === "content");
      const children = parseNavPoints(point, ncxPath);
      const title = label === undefined ? "" : text(label);
      if (title === "") {
        return children;
      }
      const src = content === undefined ? undefined : attr(content, "src");
      return [
        { title, target: src === undefined ? undefined : resolveHref(ncxPath, src), children },
      ];
    });

const readNcx = (archive: EpubArchive, ncx: ManifestItem): TocEntry[] => {
  const source = archive.text(ncx.path);
  const navMap =
    source === undefined ? undefined : findFirst(parseXml(source), byLocalName("navmap"));
  return navMap === undefined ? [] : parseNavPoints(navMap, ncx.path);
};

/** Reads the book's table of contents, preferring EPUB 3 navigation over the legacy NCX. */
export const readToc = (archive: EpubArchive, pkg: EpubPackage): readonly TocEntry[] => {
  const fromNav = pkg.nav === undefined ? [] : readNav(archive, pkg.nav);
  if (fromNav.length > 0) {
    return fromNav;
  }
  return pkg.ncx === undefined ? [] : readNcx(archive, pkg.ncx);
};
