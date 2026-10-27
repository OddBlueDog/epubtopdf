import type { FontLoader, FontRole, FontVariant } from "@/core/pdf/fonts";
import { FONT_NAMES } from "@/core/pdf/fonts";
import type { FontFamilyId } from "@/core/settings";

/** The four files pdfmake needs for a family, loaded on demand. */
export type FontFamilyFiles = Readonly<Record<FontVariant, () => Promise<Uint8Array>>>;

export type FontLibrary = {
  /** Maps a CSS `font-family` list to a registered font name and records that it is used. */
  readonly resolve: (families: readonly string[]) => string;
  /** Families referenced so far, by registered name. */
  readonly used: () => ReadonlyMap<string, FontFamilyFiles>;
};

/** Well-known family names mapped to the closest bundled typeface. */
const KNOWN_FAMILIES: Readonly<Record<string, FontRole>> = Object.fromEntries([
  ...[
    "serif",
    "ui-serif",
    "cursive",
    "fantasy",
    "georgia",
    "times",
    "times new roman",
    "palatino",
    "palatino linotype",
    "book antiqua",
    "garamond",
    "baskerville",
    "cambria",
    "charis sil",
    "literata",
  ].map((name) => [name, "serif"] as const),
  ...[
    "sans-serif",
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "arial",
    "helvetica",
    "helvetica neue",
    "verdana",
    "tahoma",
    "trebuchet ms",
    "segoe ui",
    "calibri",
    "gill sans",
    "optima",
    "futura",
    "inter",
  ].map((name) => [name, "sans"] as const),
  ...[
    "monospace",
    "ui-monospace",
    "courier",
    "courier new",
    "consolas",
    "menlo",
    "monaco",
    "lucida console",
    "dejavu sans mono",
  ].map((name) => [name, "mono"] as const),
]);

const DEFAULT_ROLE: Readonly<Record<FontFamilyId, FontRole>> = { serif: "serif", sans: "sans" };

export type FontLibraryOptions = {
  readonly loadBuiltin: FontLoader;
  /** Fonts embedded in the book, keyed by lower-cased family name. */
  readonly bookFonts: ReadonlyMap<string, FontFamilyFiles>;
  /** `publisher` honours the book's families; `custom` forces the user's typeface. */
  readonly mode: "publisher" | "custom";
  readonly defaultFamily: FontFamilyId;
};

const builtinFiles = (role: FontRole, load: FontLoader): FontFamilyFiles => ({
  normal: () => load(role, "normal"),
  bold: () => load(role, "bold"),
  italics: () => load(role, "italics"),
  bolditalics: () => load(role, "bolditalics"),
});

export const createFontLibrary = ({
  loadBuiltin,
  bookFonts,
  mode,
  defaultFamily,
}: FontLibraryOptions): FontLibrary => {
  const used = new Map<string, FontFamilyFiles>();
  const bookNames = new Map([...bookFonts.keys()].map((family, index) => [family, `Book${index}`]));

  const registerBuiltin = (role: FontRole): string => {
    const name = FONT_NAMES[role];
    if (!used.has(name)) {
      used.set(name, builtinFiles(role, loadBuiltin));
    }
    return name;
  };

  const resolve = (families: readonly string[]): string => {
    for (const family of families) {
      const role = KNOWN_FAMILIES[family];
      if (mode === "custom") {
        if (role === "mono") {
          return registerBuiltin("mono");
        }
        continue;
      }
      const bookName = bookNames.get(family);
      const files = bookFonts.get(family);
      if (bookName !== undefined && files !== undefined) {
        used.set(bookName, files);
        return bookName;
      }
      if (role !== undefined) {
        return registerBuiltin(role);
      }
    }
    return registerBuiltin(DEFAULT_ROLE[defaultFamily]);
  };

  return { resolve, used: () => used };
};
