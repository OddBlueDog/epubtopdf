import { fc, test } from "@fast-check/vitest";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { openArchive } from "@/core/epub/archive";
import {
  deobfuscate,
  obfuscationKey,
  readObfuscatedResources,
  xorHead,
} from "@/core/epub/font-obfuscation";

const ENCRYPTION_XML = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/Fonts/Book%20Serif.otf"/></enc:CipherData>
  </enc:EncryptedData>
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://ns.adobe.com/pdf/enc#RC"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/Fonts/legacy.ttf"/></enc:CipherData>
  </enc:EncryptedData>
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/drm.xhtml"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>`;

describe("readObfuscatedResources", () => {
  it("lists font-obfuscated resources and ignores real encryption", () => {
    const archive = openArchive(zipSync({ "META-INF/encryption.xml": strToU8(ENCRYPTION_XML) }));
    expect([...readObfuscatedResources(archive)]).toEqual([
      ["OEBPS/Fonts/Book Serif.otf", "idpf"],
      ["OEBPS/Fonts/legacy.ttf", "adobe"],
    ]);
  });

  it("is empty without encryption.xml", () => {
    expect(readObfuscatedResources(openArchive(zipSync({ a: strToU8("a") }))).size).toBe(0);
  });
});

describe("xorHead", () => {
  test.prop([
    fc.uint8Array({ maxLength: 2000 }),
    fc.uint8Array({ minLength: 1, maxLength: 20 }),
    fc.nat(1100),
  ])("is its own inverse and leaves the tail untouched", (bytes, key, length) => {
    const once = xorHead(bytes, key, length);
    expect(xorHead(once, key, length)).toEqual(bytes);
    expect(once.subarray(length)).toEqual(bytes.subarray(length));
  });
});

describe("obfuscationKey", () => {
  it("derives the IDPF key as SHA-1 of the whitespace-stripped unique identifier", async () => {
    const key = await obfuscationKey("idpf", {
      identifiers: [],
      uniqueIdentifier: " urn:uuid:abc \n",
    });
    const expected = new Uint8Array(await crypto.subtle.digest("SHA-1", strToU8("urn:uuid:abc")));
    expect(key).toEqual(expected);
    expect(key).toHaveLength(20);
  });

  it("derives the Adobe key from the urn:uuid identifier", async () => {
    const key = await obfuscationKey("adobe", {
      identifiers: ["isbn:123", "urn:uuid:00112233-4455-6677-8899-AABBCCDDEEFF"],
      uniqueIdentifier: undefined,
    });
    expect(key).toEqual(
      Uint8Array.from([
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
        0xff,
      ]),
    );
  });

  it("returns undefined when no suitable identifier exists", async () => {
    expect(
      await obfuscationKey("adobe", { identifiers: ["isbn:1"], uniqueIdentifier: undefined }),
    ).toBeUndefined();
    expect(
      await obfuscationKey("idpf", { identifiers: [], uniqueIdentifier: undefined }),
    ).toBeUndefined();
  });
});

describe("deobfuscate", () => {
  test.prop([fc.uint8Array({ minLength: 1, maxLength: 3000 }), fc.string({ minLength: 1 })])(
    "restores IDPF-obfuscated fonts",
    async (font, identifier) => {
      const metadata = { identifiers: [identifier], uniqueIdentifier: identifier };
      const key = await obfuscationKey("idpf", metadata);
      const obfuscated = xorHead(font, key ?? new Uint8Array(), 1040);
      expect(await deobfuscate(obfuscated, "idpf", metadata)).toEqual(font);
    },
  );
});
