import { describe, expect, it } from "vitest";
import { privateStorageFromEnv } from "./storage.js";

describe("privateStorageFromEnv", () => {
  const env = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "AKIDTEST", R2_SECRET_ACCESS_KEY: "secret-test", R2_PRIVATE_BUCKET: "private-credentials" };

  it("null when any piece of the env is missing (the API still boots)", () => {
    expect(privateStorageFromEnv({ ...env, R2_PRIVATE_BUCKET: "" })).toBeNull();
    expect(privateStorageFromEnv({ ...env, R2_ACCOUNT_ID: undefined })).toBeNull();
  });

  it("signedGetUrl: path-style R2 URL, query-signed GET with the requested expiry", async () => {
    const url = new URL(await privateStorageFromEnv(env)!.signedGetUrl("credentials/abc-123", 300));
    expect(`${url.origin}${url.pathname}`).toBe("https://acct.r2.cloudflarestorage.com/private-credentials/credentials/abc-123");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKIDTEST\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});
