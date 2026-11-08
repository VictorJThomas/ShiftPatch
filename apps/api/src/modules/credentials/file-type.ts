import type { CREDENTIAL_MIME_TYPES } from "@shiftpatch/contracts";

type CredentialMime = (typeof CREDENTIAL_MIME_TYPES)[number];

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
// ISO-BMFF major brands for HEIF/HEIC stills and sequences (ARCHITECTURE §9.2). ponytail: major brand only, no box walk.
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/**
 * The real type from the first bytes (ARCHITECTURE §9.2). The client's Content-Type and file name are never consulted.
 * Null = not an accepted credential document -> 415.
 */
export function sniffCredentialMime(b: Uint8Array): CredentialMime | null {
  if (startsWith(b, ascii("%PDF-"))) return "application/pdf";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, ascii("ftyp"), 4) && b.length >= 12 && HEIF_BRANDS.has(String.fromCharCode(...b.subarray(8, 12)))) return "image/heic";
  return null;
}
