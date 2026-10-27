import type { FontFamilyId } from "@/core/settings";

export type FontRole = FontFamilyId | "mono";
export type FontVariant = "normal" | "bold" | "italics" | "bolditalics";

export const FONT_VARIANTS: readonly FontVariant[] = ["normal", "bold", "italics", "bolditalics"];

/** Family names as registered with the PDF renderer. */
export const FONT_NAMES: Readonly<Record<FontRole, string>> = {
  serif: "Literata",
  sans: "Inter",
  mono: "JetBrainsMono",
};

/**
 * Supplies raw font files (TTF/OTF). Injected so the core never knows how assets are bundled
 * or fetched — the worker provides an implementation backed by Vite asset URLs.
 */
export type FontLoader = (role: FontRole, variant: FontVariant) => Promise<Uint8Array>;
