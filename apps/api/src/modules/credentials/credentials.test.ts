// POST / GET /api/nurses/me/credentials (Stage 7, ARCHITECTURE §9.2) against a real throwaway Postgres, storage faked in memory.
import { createHash } from "node:crypto";
import { CREDENTIAL_MAX_BYTES, ErrorBody, ErrorMessage, NurseCredentialsResponse, UploadCredentialResponse } from "@shiftpatch/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { auditLog, credentials, files, nurseProfiles, userProfiles, users } from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import type { ObjectStorage } from "../../lib/storage.js";
import { signAccessToken } from "../auth/tokens.js";
import { sniffCredentialMime } from "./file-type.js";

type Role = "agency" | "nurse" | "admin";
const roles = new Map<string, Role>([["agency-a", "agency"], ["nurse-1", "nurse"], ["nurse-2", "nurse"], ["admin-1", "admin"], ["nurse-dbfail", "nurse"]]);
const URL = "/api/nurses/me/credentials";
const KEY_RE = /^credentials\/[0-9a-f-]{36}$/;

/** In-memory ObjectStorage: records puts and deletes; `failPut` simulates an unreachable bucket. */
const fake = { objects: new Map<string, { bytes: Uint8Array; contentType: string }>(), deleted: [] as string[], failPut: false };
const storage: ObjectStorage = {
  putObject: async (key, bytes, contentType) => {
    if (fake.failPut) throw new Error("connect ECONNREFUSED");
    fake.objects.set(key, { bytes, contentType });
  },
  deleteObject: async (key) => {
    fake.deleted.push(key);
    fake.objects.delete(key);
  },
};

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  // A nurse whose credential insert the DB refuses: drives the compensating-delete path with a real failing transaction.
  await t.db.insert(users).values({ id: "nurse-dbfail", email: "dbfail@example.com", role: "nurse", passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: "nurse-dbfail", fullName: "Db Fail" });
  await t.db.insert(nurseProfiles).values({ userId: "nurse-dbfail", networkId: "network-default" });
  await t.db.execute(sql`ALTER TABLE credentials ADD CONSTRAINT test_block_dbfail CHECK (nurse_id <> 'nurse-dbfail')`);
  // Fixed "today" (facility-local): nurse-1's license (2027-01-01) valid, nurse-2's (2026-06-01) expired. Only Date is faked.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-07T15:00:00Z") });
  app = buildApp({ storage });
  await app.ready();
});
afterAll(async () => {
  vi.useRealTimers();
  await app?.close();
  await t?.drop();
});

/** Multipart body serialized by the platform's own FormData encoder. */
async function multipart(fields: Record<string, string>, file?: { bytes: Buffer; name: string; type: string }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const req = new Request("http://local/", { method: "POST", body: fd });
  return { payload: Buffer.from(await req.arrayBuffer()), contentType: req.headers.get("content-type")! };
}

async function call(method: "GET" | "POST", who: string | null, body?: { payload: Buffer; contentType: string }) {
  const headers: Record<string, string> = {};
  if (who) headers.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  if (body) headers["content-type"] = body.contentType;
  const res = await app.inject({ method, url: URL, headers, ...(body ? { payload: body.payload } : {}) });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}
const upload = async (who: string, fields: Record<string, string>, file?: { bytes: Buffer; name: string; type: string }) =>
  call("POST", who, await multipart(fields, file));

describe("POST /api/nurses/me/credentials", () => {
  it("201: stores the object under a random key, inserts files + pending credential + audit, returns the contract shape", async () => {
    const before = fake.objects.size;
    const res = await upload("nurse-1", { type: "license", licenseType: "RN", expiresOn: "2027-06-30" }, { bytes: PDF, name: "Jane Doe license.pdf", type: "application/pdf" });

    expect(res.status).toBe(201);
    const { credential } = UploadCredentialResponse.parse(res.body);
    expect(credential).toMatchObject({ type: "license", licenseType: "RN", status: "pending", expiresOn: "2027-06-30", screenedOn: null, expired: false, hasFile: true });

    expect(fake.objects.size).toBe(before + 1);
    const [key, obj] = [...fake.objects].at(-1)!;
    expect(key).toMatch(KEY_RE); // no email, name or id in the key
    expect(obj.contentType).toBe("application/pdf");

    const [row] = await t.db.select().from(credentials).where(eq(credentials.id, credential.id));
    expect(row).toMatchObject({ nurseId: "nurse-1", status: "pending", uploadedBy: "nurse-1", reviewedAt: null });
    const [file] = await t.db.select().from(files).where(eq(files.id, row!.fileId!));
    expect(file).toMatchObject({
      bucket: "private_credentials", objectKey: key, mimeType: "application/pdf", sizeBytes: PDF.byteLength, uploadedBy: "nurse-1",
      sha256: createHash("sha256").update(PDF).digest("hex"),
    });

    const [audit] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, "credential.uploaded"), eq(auditLog.entityId, credential.id)));
    expect(audit).toMatchObject({ actorUserId: "nurse-1", actorRole: "nurse", entityType: "credential", networkId: "network-default", changes: { type: "license", expiresOn: "2027-06-30" } });
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain(key);
    expect(auditText).not.toContain("Jane Doe");
    expect(auditText).not.toContain("@");
  });

  it("201: the real type wins over the client's claim (PNG sent as application/octet-stream named .bin)", async () => {
    const res = await upload("nurse-1", { type: "other" }, { bytes: PNG, name: "scan.bin", type: "application/octet-stream" });
    expect(res.status).toBe(201);
    const { credential } = UploadCredentialResponse.parse(res.body);
    const [file] = await t.db.select({ mimeType: files.mimeType }).from(files).innerJoin(credentials, eq(credentials.fileId, files.id)).where(eq(credentials.id, credential.id));
    expect(file!.mimeType).toBe("image/png");
  });

  it("400 when no file part is sent", async () => {
    const res = await upload("nurse-1", { type: "license", expiresOn: "2027-06-30" });
    expect(res).toEqual({ status: 400, body: { error: ErrorMessage.fileRequired } });
  });

  it("400 when the request is not multipart at all", async () => {
    const res = await call("POST", "nurse-1", { payload: Buffer.from(JSON.stringify({ type: "other" })), contentType: "application/json" });
    expect(res).toEqual({ status: 400, body: { error: ErrorMessage.fileRequired } });
  });

  it("400 license without expiresOn (readable message, nothing stored)", async () => {
    const before = fake.objects.size;
    const res = await upload("nurse-1", { type: "license" }, { bytes: PDF, name: "l.pdf", type: "application/pdf" });
    expect(res).toEqual({ status: 400, body: { error: "Expiry date is required for a license" } });
    expect(fake.objects.size).toBe(before);
  });

  it("400 TB screening without screenedOn, 400 unknown type, 400 malformed date", async () => {
    const file = { bytes: PDF, name: "x.pdf", type: "application/pdf" };
    expect(await upload("nurse-1", { type: "tb_screening" }, file)).toEqual({ status: 400, body: { error: "Screening date is required for a TB screening" } });
    expect(await upload("nurse-1", { type: "passport" }, file)).toEqual({ status: 400, body: { error: "Invalid type" } });
    expect(await upload("nurse-1", { type: "license", expiresOn: "2027-02-30" }, file)).toEqual({ status: 400, body: { error: "Invalid expiresOn" } });
  });

  it("413 when the file is larger than 10 MB (nothing stored)", async () => {
    const before = fake.objects.size;
    const big = Buffer.concat([PDF, Buffer.alloc(CREDENTIAL_MAX_BYTES + 1 - PDF.byteLength + 1024, 0x20)]);
    const res = await upload("nurse-1", { type: "license", expiresOn: "2027-06-30" }, { bytes: big, name: "big.pdf", type: "application/pdf" });
    expect(res).toEqual({ status: 413, body: { error: ErrorMessage.fileTooLarge } });
    expect(fake.objects.size).toBe(before);
  });

  it("201 at exactly 10 MB (the limit is inclusive)", async () => {
    const exact = Buffer.concat([PDF, Buffer.alloc(CREDENTIAL_MAX_BYTES - PDF.byteLength, 0x20)]);
    const res = await upload("nurse-1", { type: "other" }, { bytes: exact, name: "exact.pdf", type: "application/pdf" });
    expect(res.status).toBe(201);
  });

  it("415 for a text file renamed .pdf", async () => {
    const res = await upload("nurse-1", { type: "license", expiresOn: "2027-06-30" }, { bytes: Buffer.from("just some text, not a PDF"), name: "license.pdf", type: "application/pdf" });
    expect(res).toEqual({ status: 415, body: { error: ErrorMessage.unsupportedFileType } });
  });

  it("415 for a spoofed Content-Type (Windows executable declared as image/png)", async () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0)]);
    const res = await upload("nurse-1", { type: "other" }, { bytes: exe, name: "photo.png", type: "image/png" });
    expect(res).toEqual({ status: 415, body: { error: ErrorMessage.unsupportedFileType } });
  });

  it.each([["agency-a"], ["admin-1"]])("403 for %s (nurse only)", async (who) => {
    const res = await upload(who, { type: "other" }, { bytes: PDF, name: "x.pdf", type: "application/pdf" });
    expect(res).toEqual({ status: 403, body: { error: ErrorMessage.forbidden } });
  });

  it("401 without a token", async () => {
    const res = await call("POST", null, await multipart({ type: "other" }, { bytes: PDF, name: "x.pdf", type: "application/pdf" }));
    expect(res).toEqual({ status: 401, body: { error: ErrorMessage.unauthorized } });
  });

  it("DB failure: deletes the uploaded object (compensation) and answers a generic 500", async () => {
    const res = await upload("nurse-dbfail", { type: "other" }, { bytes: PDF, name: "x.pdf", type: "application/pdf" });
    expect(res).toEqual({ status: 500, body: { error: "Internal server error" } });
    const key = fake.deleted.at(-1)!;
    expect(key).toMatch(KEY_RE);
    expect(fake.objects.has(key)).toBe(false);
    expect(await t.db.select().from(files).where(eq(files.objectKey, key))).toEqual([]); // the files row rolled back too
  });

  it("storage unreachable: 503 and no DB rows", async () => {
    const [{ n: before }] = (await t.db.execute(sql`SELECT count(*)::int AS n FROM files`)) as unknown as [{ n: number }];
    fake.failPut = true;
    try {
      const res = await upload("nurse-1", { type: "other" }, { bytes: PDF, name: "x.pdf", type: "application/pdf" });
      expect(res).toEqual({ status: 503, body: { error: "File storage is unavailable. Try again later" } });
    } finally {
      fake.failPut = false;
    }
    const [{ n: after }] = (await t.db.execute(sql`SELECT count(*)::int AS n FROM files`)) as unknown as [{ n: number }];
    expect(after).toBe(before);
  });

  it("no storage env: the app still boots and the upload answers 503 (not a crash)", async () => {
    const saved = { ...process.env };
    for (const k of ["S3_ENDPOINT", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET"]) delete process.env[k];
    const bare = buildApp();
    try {
      await bare.ready();
      const body = await multipart({ type: "other" }, { bytes: PDF, name: "x.pdf", type: "application/pdf" });
      const res = await bare.inject({
        method: "POST", url: URL, payload: body.payload,
        headers: { "content-type": body.contentType, authorization: `Bearer ${await signAccessToken({ id: "nurse-1", role: "nurse" })}` },
      });
      expect(res.statusCode).toBe(503);
      expect(ErrorBody.parse(res.json())).toEqual({ error: "File storage is unavailable. Try again later" });
    } finally {
      await bare.close();
      process.env = saved;
    }
  });
});

describe("GET /api/nurses/me/credentials", () => {
  it("nurse-1: licenseValid true, own credentials only, newest first, contract shape", async () => {
    const res = await call("GET", "nurse-1");
    expect(res.status).toBe(200);
    const body = NurseCredentialsResponse.parse(res.body);
    expect(body.licenseValid).toBe(true);
    const own = await t.db.select({ id: credentials.id }).from(credentials).where(eq(credentials.nurseId, "nurse-1"));
    expect(body.credentials.map((c) => c.id).sort()).toEqual(own.map((c) => c.id).sort());
    expect(body.credentials.at(-1)).toMatchObject({ id: "cred-nurse-1", status: "verified", expiresOn: "2027-01-01", expired: false, hasFile: false });
    const times = body.credentials.map((c) => c.uploadedAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("nurse-2: licenseValid false, the seeded license is flagged expired", async () => {
    const res = await call("GET", "nurse-2");
    const body = NurseCredentialsResponse.parse(res.body);
    expect(body).toEqual({
      licenseValid: false,
      credentials: [expect.objectContaining({ id: "cred-nurse-2", type: "license", status: "verified", expiresOn: "2026-06-01", expired: true, hasFile: false })],
    });
  });

  it.each([["agency-a", 403, ErrorMessage.forbidden], ["admin-1", 403, ErrorMessage.forbidden], [null, 401, ErrorMessage.unauthorized]] as const)(
    "%s -> %i", async (who, status, error) => {
      expect(await call("GET", who)).toEqual({ status, body: { error } });
    },
  );
});

describe("sniffCredentialMime (magic bytes only)", () => {
  const heic = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.alloc(8)]);
  it.each([
    ["pdf", PDF, "application/pdf"],
    ["png", PNG, "image/png"],
    ["jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), "image/jpeg"],
    ["heic", heic("heic"), "image/heic"],
    ["mif1", heic("mif1"), "image/heic"],
    ["mp4 (ftyp isom)", heic("isom"), null],
    ["gif", Buffer.from("GIF89a"), null],
    ["empty", Buffer.alloc(0), null],
    ["truncated pdf", Buffer.from("%PD"), null],
  ])("%s", (_, bytes, mime) => {
    expect(sniffCredentialMime(bytes)).toBe(mime);
  });
});
