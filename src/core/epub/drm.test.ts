import { describe, expect, it } from "vitest";

import { convertEpubToPdf } from "@/core/convert";
import { openArchive } from "@/core/epub/archive";
import { detectDrm } from "@/core/epub/drm";
import { loadEpub } from "@/core/epub/load-epub";
import { ConversionError } from "@/core/errors";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { buildEpub } from "@/test/epub-builder";

const encryption = (
  ...entries: readonly (readonly [algorithm: string, uri: string])[]
): string => `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
${entries
  .map(
    ([algorithm, uri]) => `  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="${algorithm}"/>
    <enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData>
  </enc:EncryptedData>`,
  )
  .join("\n")}
</encryption>`;

const AES = "http://www.w3.org/2001/04/xmlenc#aes128-cbc";
const IDPF = "http://www.idpf.org/2008/embedding";
const ADOBE_FONT = "http://ns.adobe.com/pdf/enc#RC";

const detect = (rootFiles: Readonly<Record<string, string>>) =>
  detectDrm(openArchive(buildEpub({ rootFiles })));

describe("detectDrm", () => {
  it("passes DRM-free books", () => {
    expect(detect({})).toBeUndefined();
  });

  it.each([
    ["META-INF/rights.xml", "adobe-adept"],
    ["META-INF/sinf.xml", "apple-fairplay"],
    ["META-INF/license.lcpl", "readium-lcp"],
    ["license.lcpl", "readium-lcp"],
  ])("recognises the %s licence file", (path, scheme) => {
    expect(detect({ [path]: "<licence/>" })).toBe(scheme);
  });

  it("flags content encrypted with a real cipher", () => {
    expect(detect({ "META-INF/encryption.xml": encryption([AES, "OEBPS/chapter1.xhtml"]) })).toBe(
      "encrypted",
    );
  });

  it("does not mistake font obfuscation for DRM", () => {
    expect(
      detect({
        "META-INF/encryption.xml": encryption([IDPF, "OEBPS/a.otf"], [ADOBE_FONT, "OEBPS/b.ttf"]),
      }),
    ).toBeUndefined();
  });

  it("flags a book that mixes font obfuscation with encrypted content", () => {
    expect(
      detect({
        "META-INF/encryption.xml": encryption([IDPF, "OEBPS/a.otf"], [AES, "OEBPS/c.xhtml"]),
      }),
    ).toBe("encrypted");
  });
});

const loadFont = (): Promise<Uint8Array> => Promise.reject(new Error("must not load fonts"));

describe("DRM rejection", () => {
  const protectedBook = buildEpub({ rootFiles: { "META-INF/rights.xml": "<adept:rights/>" } });

  it("stops loading with a clear, typed error", () => {
    expect(() => loadEpub(protectedBook)).toThrow(ConversionError);
    expect(() => loadEpub(protectedBook)).toThrow(/protected by Adobe DRM/u);
  });

  it("refuses to convert before any rendering starts", async () => {
    const conversion = convertEpubToPdf({
      epub: protectedBook,
      fileName: "protected.epub",
      settings: DEFAULT_SETTINGS,
      loadFont,
    });
    await expect(conversion).rejects.toBeInstanceOf(ConversionError);
    await expect(conversion).rejects.toMatchObject({ code: "drm-protected" });
  });
});
