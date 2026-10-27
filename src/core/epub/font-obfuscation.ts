/**
 * EPUB font obfuscation (not encryption): the first bytes of embedded fonts are XOR-ed with
 * a key derived from the book's identifier, so they can't be trivially extracted.
 *
 * - IDPF (EPUB OCF 3): key = SHA-1 of the unique identifier (whitespace removed), 1040 bytes.
 * - Adobe: key = the 16 bytes of the `urn:uuid:` identifier, 1024 bytes.
 */
import type { EpubArchive } from "@/core/epub/archive";
import type { EpubMetadata } from "@/core/epub/package";
import { byLocalName, findAll, findFirst, parseXml, attr } from "@/core/xml/dom";

export type ObfuscationAlgorithm = "idpf" | "adobe";

const ALGORITHMS: Readonly<Record<string, ObfuscationAlgorithm>> = {
  "http://www.idpf.org/2008/embedding": "idpf",
  "http://ns.adobe.com/pdf/enc#RC": "adobe",
};

export const OBFUSCATED_LENGTH: Readonly<Record<ObfuscationAlgorithm, number>> = {
  idpf: 1040,
  adobe: 1024,
};

/** Archive paths of obfuscated resources, from `META-INF/encryption.xml`. */
export const readObfuscatedResources = (
  archive: EpubArchive,
): ReadonlyMap<string, ObfuscationAlgorithm> => {
  const source = archive.text("META-INF/encryption.xml");
  const resources = new Map<string, ObfuscationAlgorithm>();
  if (source === undefined) {
    return resources;
  }
  for (const data of findAll(parseXml(source), byLocalName("encrypteddata"))) {
    const method = findFirst(data, byLocalName("encryptionmethod"));
    const reference = findFirst(data, byLocalName("cipherreference"));
    const algorithm =
      ALGORITHMS[(method === undefined ? undefined : attr(method, "Algorithm")) ?? ""];
    const uri = reference === undefined ? undefined : attr(reference, "URI");
    if (algorithm !== undefined && uri !== undefined) {
      // URIs are relative to the container root.
      resources.set(decodeURIComponent(uri.replace(/^\//u, "")), algorithm);
    }
  }
  return resources;
};

/** XORs the head of `bytes` with a repeating key. Applying it twice restores the input. */
export const xorHead = (bytes: Uint8Array, key: Uint8Array, length: number): Uint8Array => {
  const output = bytes.slice();
  const limit = Math.min(length, output.length);
  for (let index = 0; index < limit && key.length > 0; index++) {
    output[index] = (output[index] ?? 0) ^ (key[index % key.length] ?? 0);
  }
  return output;
};

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));

export const obfuscationKey = async (
  algorithm: ObfuscationAlgorithm,
  metadata: Pick<EpubMetadata, "identifiers" | "uniqueIdentifier">,
): Promise<Uint8Array | undefined> => {
  if (algorithm === "idpf") {
    const identifier = metadata.uniqueIdentifier ?? metadata.identifiers[0];
    if (identifier === undefined) {
      return undefined;
    }
    // OCF: remove space, tab, carriage return and line feed.
    const cleaned = identifier.replaceAll(/[ \t\r\n]/gu, "");
    return new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(cleaned)));
  }
  const uuid = metadata.identifiers
    .map((identifier) => identifier.trim().toLowerCase())
    .find((identifier) => identifier.startsWith("urn:uuid:"))
    ?.slice("urn:uuid:".length)
    .replaceAll("-", "");
  return uuid?.length === 32 ? hexToBytes(uuid) : undefined;
};

/** Restores an obfuscated font; returns the input unchanged when no key can be derived. */
export const deobfuscate = async (
  bytes: Uint8Array,
  algorithm: ObfuscationAlgorithm,
  metadata: Pick<EpubMetadata, "identifiers" | "uniqueIdentifier">,
): Promise<Uint8Array> => {
  const key = await obfuscationKey(algorithm, metadata);
  return key === undefined ? bytes : xorHead(bytes, key, OBFUSCATED_LENGTH[algorithm]);
};
