import type { ContentText, Style } from "pdfmake/interfaces";

/**
 * pdfmake's published typings omit `id` on text nodes, although the runtime supports it
 * (it becomes a named destination for links, page references and bookmarks).
 */
export type TextNode = ContentText & { readonly id?: string | undefined };

type FontFeatures = NonNullable<Style["fontFeatures"]>;

/**
 * Disables ligatures. Ligature glyphs (fi, ft, Th…) lose characters in the PDF's text layer,
 * which breaks copy, search and screen readers.
 *
 * fontkit accepts a `{ feature: boolean }` object — the only way to switch a default feature
 * *off* — while pdfmake's typings only describe the array form, hence the single cast here.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
export const WITHOUT_LIGATURES = { liga: false, clig: false } as unknown as FontFeatures;
