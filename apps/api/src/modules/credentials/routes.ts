import multipart from "@fastify/multipart";
import {
  CREDENTIAL_MAX_BYTES, ErrorMessage, NurseCredentialsResponse, UploadCredentialFields, UploadCredentialResponse,
} from "@shiftpatch/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../db/client.js";
import { type ObjectStorage, privateStorageFromEnv, StorageError } from "../../lib/storage.js";
import type { RequestMeta } from "../audit/audit.js";
import { can } from "../authz/can.js";
import { sendDenial } from "../authz/plugin.js";
import { sniffCredentialMime } from "./file-type.js";
import * as service from "./service.js";

const meta = (req: FastifyRequest): RequestMeta => ({ requestId: req.id, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });
const STORAGE_DOWN = "File storage is unavailable. Try again later";

type Parsed = { fields: Record<string, string>; file: { bytes: Buffer; name: string | null } | null };
/** Multipart error -> the client answer. Anything else (malformed body) is a 400 too: the body is the client's. */
const multipartFailure = (err: unknown): { status: number; error: string } => {
  const code = (err as { code?: string }).code;
  if (code === "FST_REQ_FILE_TOO_LARGE") return { status: 413, error: ErrorMessage.fileTooLarge };
  if (code === "FST_FILES_LIMIT") return { status: 400, error: "Upload exactly one file" };
  if (code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT") return { status: 400, error: "Too many form fields" };
  return { status: 400, error: "Malformed multipart body" };
};

/** Reads every part. The single `file` part is buffered, bounded by the multipart `fileSize` limit (10 MB). */
async function readParts(req: FastifyRequest): Promise<Parsed> {
  const out: Parsed = { fields: {}, file: null };
  for await (const part of req.parts()) {
    if (part.type === "field") {
      if (typeof part.value === "string" && part.value !== "") out.fields[part.fieldname] = part.value; // "" = a blank form input
      continue;
    }
    if (part.fieldname !== "file") throw Object.assign(new Error("unexpected file field"), { code: "FST_FILES_LIMIT" });
    const bytes = await part.toBuffer(); // throws FST_REQ_FILE_TOO_LARGE past the limit
    if (part.file.truncated) throw Object.assign(new Error("truncated"), { code: "FST_REQ_FILE_TOO_LARGE" }); // belt and braces
    out.file = { bytes, name: part.filename ? part.filename.slice(0, 255) : null };
  }
  return out;
}

/** Stage 7 credential routes (ARCHITECTURE §8.4, §9.2). `storage` is injected by tests; otherwise read lazily from the env. */
export async function credentialRoutes(app: FastifyInstance, db: () => Db, storage?: ObjectStorage) {
  // Scoped to this plugin: multipart parsing exists only on these routes. 1 file, a few short text fields.
  await app.register(multipart, { limits: { fileSize: CREDENTIAL_MAX_BYTES, files: 1, fields: 10, parts: 11, fieldSize: 256, fieldNameSize: 32, headerPairs: 50 } });
  let envStorage: ObjectStorage | null | undefined;
  const store = () => storage ?? (envStorage ??= privateStorageFromEnv());

  // createRateLimit, not app.rateLimit (see auth routes). ponytail: in-memory per instance; Redis store if >1 replica.
  const uploadLimit = app.createRateLimit({ max: 20, timeWindow: 60_000, keyGenerator: (req) => `cred-upload:${req.actor?.userId}` });

  const pre = { onRequest: [app.authenticate, app.loadActor] };
  const nurseOnly = (req: FastifyRequest, reply: FastifyReply) => sendDenial(reply, can(req.actor!, "credential:manage-own", {}));

  app.get("/api/nurses/me/credentials", pre, async (req, reply) => {
    if (nurseOnly(req, reply)) return reply;
    return NurseCredentialsResponse.parse(await service.listOwn(db(), req.actor!));
  });

  app.post("/api/nurses/me/credentials", pre, async (req, reply) => {
    if (nurseOnly(req, reply)) return reply; // 403 before reading a byte of the body
    const limit = await uploadLimit(req);
    if (!limit.isAllowed && limit.isExceeded) {
      return reply.header("retry-after", String(limit.ttlInSeconds)).code(429).send({ error: "Too many requests, try again later" });
    }
    if (!req.isMultipart()) return reply.code(400).send({ error: ErrorMessage.fileRequired });

    let parsed: Parsed;
    try {
      parsed = await readParts(req);
    } catch (err) {
      const f = multipartFailure(err);
      return reply.code(f.status).send({ error: f.error });
    }
    const fields = UploadCredentialFields.safeParse(parsed.fields);
    if (!fields.success) {
      const issue = fields.error.issues[0]!;
      return reply.code(400).send({ error: issue.code === "custom" ? issue.message : `Invalid ${issue.path.join(".") || "request"}` });
    }
    if (!parsed.file || parsed.file.bytes.byteLength === 0) return reply.code(400).send({ error: ErrorMessage.fileRequired });
    const mimeType = sniffCredentialMime(parsed.file.bytes);
    if (!mimeType) return reply.code(415).send({ error: ErrorMessage.unsupportedFileType });

    const storage = store();
    if (!storage) {
      req.log.error("credential upload: object storage is not configured (S3_ENDPOINT / R2_* env)");
      return reply.code(503).send({ error: STORAGE_DOWN });
    }
    try {
      const credential = await service.upload(
        db(), storage, req.actor!, { ...fields.data, bytes: parsed.file.bytes, mimeType, originalName: parsed.file.name }, meta(req),
        (err) => req.log.error({ err }, "credential upload: compensating delete failed (orphan object left in the private bucket)"),
      );
      return reply.code(201).send(UploadCredentialResponse.parse({ credential }));
    } catch (err) {
      if (err instanceof StorageError) { // only the upload itself throws this: nothing was written to the DB
        req.log.error({ err }, "credential upload: object storage write failed");
        return reply.code(503).send({ error: STORAGE_DOWN });
      }
      throw err; // DB failure: the object was already deleted; the error handler logs it and answers a generic 500
    }
  });
}
