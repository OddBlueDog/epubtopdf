/** Path helpers for resolving hrefs inside an EPUB archive (always `/`-separated, no leading slash). */

export type ResolvedHref = {
  readonly path: string;
  readonly fragment: string | undefined;
};

const SCHEME = /^[a-z][a-z\d+.-]*:/iu;

export const isExternalHref = (href: string): boolean => SCHEME.test(href);

export const dirname = (path: string): string => {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeSegments = (path: string): string => {
  const output: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      output.pop();
    } else {
      output.push(segment);
    }
  }
  return output.join("/");
};

/** Joins a base directory and a relative path, collapsing `.` and `..` segments. */
export const joinPath = (baseDir: string, relative: string): string =>
  relative.startsWith("/")
    ? normalizeSegments(relative)
    : normalizeSegments(`${baseDir}/${relative}`);

/**
 * Resolves an href found in `fromFile` to an archive path plus optional fragment.
 * Returns `undefined` for external links (http:, mailto:, data:, …).
 */
export const resolveHref = (fromFile: string, href: string): ResolvedHref | undefined => {
  const trimmed = href.trim();
  if (trimmed === "" || isExternalHref(trimmed)) {
    return undefined;
  }
  const hashIndex = trimmed.indexOf("#");
  const rawPath = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const rawFragment = hashIndex === -1 ? undefined : trimmed.slice(hashIndex + 1);
  const withoutQuery = rawPath.split("?", 1)[0] ?? "";
  const path =
    withoutQuery === "" ? fromFile : joinPath(dirname(fromFile), safeDecode(withoutQuery));
  const fragment =
    rawFragment === undefined || rawFragment === "" ? undefined : safeDecode(rawFragment);
  return { path, fragment };
};
