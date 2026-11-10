// Private object storage (ARCHITECTURE §9): Cloudflare R2 in production, MinIO locally, both through the S3 API.
// ponytail: aws4fetch (SigV4 over fetch, no deps) instead of @aws-sdk/client-s3: two calls don't need the full SDK.
// Its `sign(..., { aws: { signQuery: true } })` also signs the 5-minute download links (§9.3).
import { AwsClient } from "aws4fetch";

/** The only storage operations the API needs. Tests inject an in-memory fake. */
export interface ObjectStorage {
  /** `contentDisposition` is stored as object metadata, so a signed GET serves the file as that attachment. */
  putObject(key: string, body: Uint8Array, contentType: string, contentDisposition: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Presigned GET on the S3 endpoint (never a custom domain), valid `expiresInSeconds`. Never log the result. */
  signedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/** Storage unreachable or non-2xx. The message carries the method and status only: never the key, URL or response body. */
export class StorageError extends Error {
  constructor(method: string, readonly status: number | null, options?: { cause: unknown }) {
    super(`Object storage ${method} failed${status === null ? "" : ` (HTTP ${status})`}`, options);
    this.name = "StorageError";
  }
}

/**
 * S3-compatible storage for the private credentials bucket, or null when the env is incomplete (the API still boots;
 * the upload route answers 503). Endpoint: `S3_ENDPOINT` (MinIO `http://localhost:9000`), else R2 from `R2_ACCOUNT_ID`.
 * Path-style URLs (`<endpoint>/<bucket>/<key>`) work on both.
 */
export function privateStorageFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorage | null {
  const { R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_PRIVATE_BUCKET: bucket } = env;
  const endpoint = env.S3_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;
  // R2 wants region "auto"; MinIO without a configured region accepts any. S3_REGION overrides for other providers.
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: env.S3_REGION || "auto" });
  const base = `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(bucket)}`;
  const urlOf = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const send = async (method: "PUT" | "DELETE", key: string, init: RequestInit = {}) => {
    const res = await client.fetch(urlOf(key), { method, ...init });
    await res.body?.cancel(); // the body (XML) may echo the key: never read into logs
    if (!res.ok && !(method === "DELETE" && res.status === 404)) throw new StorageError(method, res.status);
  };
  return {
    putObject: (key, body, contentType, contentDisposition) =>
      send("PUT", key, {
        body: body as Uint8Array<ArrayBuffer> /* Buffers are never SharedArrayBuffer-backed here */,
        headers: { "content-type": contentType, "content-length": String(body.byteLength), "content-disposition": contentDisposition },
      }),
    deleteObject: (key) => send("DELETE", key),
    signedGetUrl: async (key, expiresInSeconds) => {
      const url = new URL(urlOf(key));
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      return (await client.sign(url, { method: "GET", aws: { signQuery: true } })).url;
    },
  };
}
