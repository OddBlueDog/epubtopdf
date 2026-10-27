import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  isDirectlyEmbeddablePng,
  jpegDimensions,
  pngInfo,
  sniffImageFormat,
} from "@/core/images/image-format";
import { RGB_PNG, TINY_PNG } from "@/test/epub-builder";

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

/** Minimal PNG header: signature + IHDR with the given size and interlace flag (CRC not checked). */
const pngHeader = (width: number, height: number, interlaced: boolean): Uint8Array => {
  const data = new Uint8Array(33);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(data.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  data[24] = 8;
  data[28] = interlaced ? 1 : 0;
  return data;
};

/** Minimal JPEG: SOI, an APP0 segment, then a baseline SOF0 with the given size. */
const jpegHeader = (width: number, height: number): Uint8Array => {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x00,
  ];
  return bytes(0xff, 0xd8, ...app0, ...sof, 0x00);
};

describe("sniffImageFormat", () => {
  it.each([
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["png", TINY_PNG],
    ["gif", new TextEncoder().encode("GIF89a")],
    ["webp", new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")],
    ["bmp", new TextEncoder().encode("BM....")],
    ["svg", new TextEncoder().encode('  <?xml version="1.0"?>\n<svg xmlns="…"/>')],
    ["unknown", new TextEncoder().encode("hello")],
  ] as const)("detects %s", (format, data) => {
    expect(sniffImageFormat(data)).toBe(format);
  });

  test.prop([fc.uint8Array({ maxLength: 64 })])("never throws", (data) => {
    expect(() => sniffImageFormat(data)).not.toThrow();
  });
});

describe("pngInfo", () => {
  it("reads the real 1×1 fixture", () => {
    expect(pngInfo(TINY_PNG)).toEqual({
      width: 1,
      height: 1,
      bitDepth: 8,
      colorType: 6,
      interlaced: false,
      hasTransparencyChunk: false,
    });
  });

  test.prop([
    fc.integer({ min: 1, max: 2 ** 31 - 1 }),
    fc.integer({ min: 1, max: 2 ** 31 - 1 }),
    fc.boolean(),
  ])("round-trips IHDR dimensions and interlacing", (width, height, interlaced) => {
    expect(pngInfo(pngHeader(width, height, interlaced))).toMatchObject({
      width,
      height,
      interlaced,
    });
  });

  it("rejects truncated data", () => {
    expect(pngInfo(TINY_PNG.subarray(0, 20))).toBeUndefined();
  });
});

describe("jpegDimensions", () => {
  test.prop([fc.integer({ min: 1, max: 65_535 }), fc.integer({ min: 1, max: 65_535 })])(
    "finds the frame size after other segments",
    (width, height) => {
      expect(jpegDimensions(jpegHeader(width, height))).toEqual({ width, height });
    },
  );

  test.prop([fc.uint8Array({ maxLength: 128 })])("never throws on garbage", (data) => {
    expect(() => jpegDimensions(data)).not.toThrow();
  });
});

describe("isDirectlyEmbeddablePng", () => {
  const base = {
    width: 1,
    height: 1,
    bitDepth: 8,
    colorType: 2,
    interlaced: false,
    hasTransparencyChunk: false,
  };

  it("accepts opaque gray, RGB and palette images", () => {
    for (const colorType of [0, 2, 3]) {
      expect(isDirectlyEmbeddablePng({ ...base, colorType })).toBe(true);
    }
    expect(pngInfo(RGB_PNG)).toMatchObject({ colorType: 2 });
  });

  it.each([
    ["alpha channels", { colorType: 6 }],
    ["gray + alpha", { colorType: 4 }],
    ["tRNS transparency", { hasTransparencyChunk: true }],
    ["interlacing", { interlaced: true }],
    ["16-bit depth", { bitDepth: 16 }],
  ])("rejects %s", (_, override) => {
    expect(isDirectlyEmbeddablePng({ ...base, ...override })).toBe(false);
  });
});
