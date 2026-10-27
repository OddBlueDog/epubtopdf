import { fc, test } from "@fast-check/vitest";
import { unzlibSync } from "fflate";
import { describe, expect, it } from "vitest";

import { isDirectlyEmbeddablePng, pngInfo, sniffImageFormat } from "@/core/images/image-format";
import { crc32, encodeRgbPng } from "@/core/images/png-encoder";

/** Pulls the (single) IDAT payload out of a PNG produced by the encoder. */
const idatOf = (png: Uint8Array): Uint8Array => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCodePoint(...png.subarray(offset + 4, offset + 8));
    if (type === "IDAT") {
      return png.subarray(offset + 8, offset + 8 + length);
    }
    offset += 12 + length;
  }
  throw new Error("no IDAT");
};

const image = fc
  .record({ width: fc.integer({ min: 1, max: 24 }), height: fc.integer({ min: 1, max: 24 }) })
  .chain(({ width, height }) =>
    fc
      .uint8Array({ minLength: width * height * 4, maxLength: width * height * 4 })
      .map((rgba) => ({ width, height, rgba })),
  );

describe("crc32", () => {
  it("matches the well-known IEND checksum", () => {
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });
});

describe("encodeRgbPng", () => {
  test.prop([image])(
    "produces a directly embeddable RGB PNG with the right size",
    ({ width, height, rgba }) => {
      const png = encodeRgbPng(width, height, rgba);
      expect(sniffImageFormat(png)).toBe("png");
      const info = pngInfo(png);
      expect(info).toMatchObject({ width, height, colorType: 2, bitDepth: 8 });
      expect(info !== undefined && isDirectlyEmbeddablePng(info)).toBe(true);
    },
  );

  test.prop([image])("stores every pixel's RGB values losslessly", ({ width, height, rgba }) => {
    const raw = unzlibSync(idatOf(encodeRgbPng(width, height, rgba)));
    const stride = width * 3 + 1;
    expect(raw.length).toBe(stride * height);
    for (let y = 0; y < height; y++) {
      expect(raw[y * stride]).toBe(0);
      for (let x = 0; x < width; x++) {
        for (let channel = 0; channel < 3; channel++) {
          expect(raw[y * stride + 1 + x * 3 + channel]).toBe(rgba[(y * width + x) * 4 + channel]);
        }
      }
    }
  });

  it("rejects pixel buffers of the wrong size", () => {
    expect(() => encodeRgbPng(2, 2, new Uint8Array(3))).toThrow(RangeError);
  });
});
