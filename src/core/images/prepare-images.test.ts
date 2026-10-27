import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { openArchive } from "@/core/epub/archive";
import { prepareImages } from "@/core/images/prepare-images";
import { IMAGE_QUALITIES } from "@/core/settings";
import { RGB_PNG, TINY_PNG } from "@/test/epub-builder";

const archive = openArchive(
  zipSync({ "rgb.png": RGB_PNG, "rgba.png": TINY_PNG, "vector.svg": strToU8("<svg/>") }),
);

describe("prepareImages", () => {
  it("passes embeddable images through untouched and reports progress", async () => {
    const progress: number[] = [];
    const prepared = await prepareImages(
      archive,
      new Set(["rgb.png"]),
      IMAGE_QUALITIES.original,
      (fraction) => {
        progress.push(fraction);
      },
    );
    expect(prepared.get("rgb.png")).toEqual({ bytes: RGB_PNG, width: 3, height: 2 });
    expect(progress).toEqual([1]);
  });

  it("skips images it cannot prepare instead of failing the book", async () => {
    // Node has no createImageBitmap, so the RGBA PNG's re-encode fails — exactly like a corrupt image would.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const prepared = await prepareImages(
      archive,
      new Set(["rgb.png", "rgba.png", "vector.svg", "missing.png"]),
      IMAGE_QUALITIES.original,
    );
    expect([...prepared.keys()]).toEqual(["rgb.png"]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("handles an empty set", async () => {
    expect((await prepareImages(archive, new Set(), IMAGE_QUALITIES.balanced)).size).toBe(0);
  });
});
