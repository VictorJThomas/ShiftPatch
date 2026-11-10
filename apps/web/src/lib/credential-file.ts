import "@/lib/zod-csp"; // first: the contracts import below builds zod schemas
import { CredentialDownloadResponse } from "@shiftpatch/contracts";
import { apiFetch } from "@/lib/api-client";

/** Credential file types (contracts CREDENTIAL_MIME_TYPES), told apart by their first bytes like the API does on upload. */
export type CredentialFileType = "application/pdf" | "image/jpeg" | "image/png" | "image/heic";

const EXT: Record<CredentialFileType, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" };
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const at = (b: Uint8Array, sig: readonly number[], offset = 0) => b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * The real type from the magic bytes (mirror of the API's `sniffCredentialMime`). The storage Content-Type header is never
 * trusted: the preview is a same-origin `blob:` document, so only these exact types may ever be rendered (never HTML/SVG).
 */
export function sniffCredentialFile(b: Uint8Array): CredentialFileType | null {
  if (at(b, ascii("%PDF-"))) return "application/pdf";
  if (at(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(b, ascii("ftyp"), 4) && b.length >= 12 && HEIF_BRANDS.has(String.fromCharCode(...b.subarray(8, 12)))) return "image/heic";
  return null;
}

/** Same name scheme as the stored object's Content-Disposition (`credential.<ext>`): never the original file name. */
export const credentialFileName = (type: CredentialFileType) => `credential.${EXT[type]}`;

/** How the preview can show a file in this browser. HEIC: no browser engine we target decodes it in <img>. */
export function previewKind(type: CredentialFileType | null, pdfViewer: boolean): "pdf" | "image" | "none" {
  if (type === "application/pdf") return pdfViewer ? "pdf" : "none";
  if (type === "image/jpeg" || type === "image/png") return "image";
  return "none";
}

/** False only where the browser says it cannot show PDFs inline (e.g. Android Chrome); unknown = assume it can. */
export const browserShowsPdf = () => typeof navigator === "undefined" || (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;

export type CredentialFileProblem = "expired" | "unreachable" | "failed";

/** A failure after the API answered: the signed link expired or was refused, storage was unreachable (network/CORS/CSP), or another HTTP error. */
export class CredentialFileError extends Error {
  readonly problem: CredentialFileProblem;
  constructor(problem: CredentialFileProblem) {
    super(
      problem === "expired"
        ? "The secure link expired before the file loaded. Retry to get a new one."
        : problem === "unreachable"
          ? "The file couldn't be reached from this browser. You can still download it."
          : "The file couldn't be loaded. Retry, or download it instead.",
    );
    this.name = "CredentialFileError";
    this.problem = problem;
  }
}

export interface CredentialFile {
  bytes: Uint8Array<ArrayBuffer>;
  type: CredentialFileType | null;
}

/**
 * Requests a fresh 5-minute signed link (one audit row, like Download) and reads the bytes. The object is stored as an
 * attachment, so it cannot be framed directly; the bytes become a typed `blob:` URL instead. Needs CSP `connect-src`
 * to allow the storage origin and a bucket CORS rule for GET from the app origin (see next.config.ts).
 */
export async function loadCredentialFile(credentialId: string, signal?: AbortSignal): Promise<CredentialFile> {
  const { url } = await apiFetch(`/api/credentials/${encodeURIComponent(credentialId)}/download-url`, { schema: CredentialDownloadResponse, signal });
  let res: Response;
  try {
    // No cookies or referrer to storage: the signature in the URL is the only credential.
    res = await fetch(url, { signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new CredentialFileError("unreachable");
  }
  // S3/R2/MinIO answer an expired (or otherwise refused) presigned GET with 403.
  if (res.status === 403) throw new CredentialFileError("expired");
  if (!res.ok) throw new CredentialFileError("failed");
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, type: sniffCredentialFile(bytes) };
}
