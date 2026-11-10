# Cloudflare R2 Production Storage Plan

## Goal
Credential files (nursing license, TB screening, other) must work in production on Cloudflare R2, with upload and read from the frontend.

**Exists, tested with fake storage/MinIO:** S3 client `apps/api/src/lib/storage.ts` (`aws4fetch`, R2 endpoint from `R2_ACCOUNT_ID`, `region: auto`); `POST /api/nurses/me/credentials` (10 MB, sniffed type, random key, DB transaction + audit, compensating delete); upload screen `/nurse/credentials/new` (`CredentialUploadForm.tsx`). In prod it answers 503 only because bucket and env are missing.

**Missing:** (1) R2 bucket + Railway env. (2) Read path: `GET /api/credentials/:id/download-url` is designed (ARCHITECTURE §8.4 table, §9.3) but not built, and no screen offers the file. (3) Proof that a 10 MB upload passes the Vercel `/api` rewrite.

So: little new upload code, one new route, one shared button.

## Constraints
- TypeScript. Error shape always `{ "error": "<message>" }`. The 6 spec routes and 15 test IDs stay unchanged; this route is additive.
- `private-credentials` is never public: no r2.dev URL, no custom domain. Reads only through 5-minute signed links issued by the API (§9.1, ADR-006).
- Uploads keep going through the API (ADR-006): server sniffs type, audit + DB atomic. No browser-to-R2 presigned PUT, unless step 1 forces it.
- Never log or audit object keys, original file names, or signed URLs (§9.3; `audit/redact.ts` already strips them).
- Out of scope answers 404, not 403 (`credential:read-document` returns `out_of_scope`).
- Secrets only in Railway env / local `.env`, never git. New deps: none (`aws4fetch` already signs queries).
- Bulk export stays escalated (`ESCALATION.md`). This is one document per click, audited.
- Follow the repo rules: `import "@/lib/zod-csp"` first in web modules touching contracts/zod; modals stay on shared `AppDialog`; run `/verify` before Done/commit; regenerate Postman after route/contract changes; update `/task` + brain.
- Start from `feature/11-ui-ux-polish` once its ~70 uncommitted paths are committed by Victor. Do not mix them in.

## Steps

### 1. Provision R2, test the real upload FIRST (no code)
Dashboard steps below in "Migrations / config". Then deploy the API and upload a ~9 MB PDF through the Vercel domain.
- **Passes:** go to step 2.
- **413 from Vercel:** real risk. Vercel documents a 4.5 MB function body limit and does not document whether external rewrites are exempt ([limit](https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE), [bypass guide](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions); [one blog](https://nickb-dev.pages.dev/blog/split-nextjs-across-hosting-providers-and-advocate-for-direct-s3-uploads) reports rewrites proxying past it). Fallback, upload only: `POST` straight to the Railway domain. Auth is already `Authorization: Bearer` from the in-memory store (`lib/api-client.ts:170`), so no cookies needed. Add `@fastify/cors` limited to `APP_ORIGIN` and this one route, add the Railway origin to `connect-src` in `apps/web/next.config.ts`, add an optional `origin` to `apiFetch`. Do not lower the 10 MB limit without asking the founder: phone photos are large.

### 2. Storage: signed GET + attachment on PUT
`apps/api/src/lib/storage.ts`:
```ts
export interface ObjectStorage {
  putObject(key: string, body: Uint8Array, contentType: string, contentDisposition: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  signedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
}
// in privateStorageFromEnv:
signedGetUrl: async (key, expiresInSeconds) => {
  const url = new URL(urlOf(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  return (await client.sign(url, { method: "GET", aws: { signQuery: true } })).url;
},
```
Add `"content-disposition": contentDisposition` to the PUT headers. Why at PUT, not `response-content-disposition` on the link: R2 stores it as object metadata, and R2 support for that query override on presigned GETs could not be confirmed in its docs. Presigned URLs must use the S3 endpoint, not a custom domain ([docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)); `urlOf` already does.

`credentials/service.ts` `upload()`: pass a personal-data-free name from the sniffed type:
```ts
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" };
await storage.putObject(objectKey, input.bytes, input.mimeType, `attachment; filename="credential.${EXT[input.mimeType]}"`)
```

### 3. Contract
`packages/contracts/src/index.ts`:
```ts
export const CredentialDownloadResponse = z.object({ url: z.string().url(), expiresAt: z.string().datetime() });
```
Add a `fileNotOnRecord`-style entry to `ErrorMessage` only if `notFound` reads badly; default is reuse `notFound`. Rebuild contracts (prod reads `packages/contracts/dist`).

### 4. Service: `documentUrl`
`apps/api/src/modules/credentials/service.ts`:
```ts
export const DOWNLOAD_TTL_SECONDS = 300;
export async function documentUrl(db, storage, actor, credentialId, meta, now = new Date()): Promise<Result>
```
1. Select `credentials` (not deleted) joined to `nurseProfiles` (for `networkId`) and left-joined to `files` (`objectKey`).
2. `agencyIdsHoldingNurse`: only when `actor.role === "agency"`, distinct `shifts.agencyId` where `claimedBy = nurseId` and `status = 'filled'` and not deleted (policy comment: "holds a shift (status filled)"; copy the live-row filter from `shifts/repository.ts` `findLiveShift`).
3. `can(actor, "credential:read-document", { nurseId, nurseNetworkId, agencyIdsHoldingNurse })`. Missing row or denied → `{ status: 404, error: ErrorMessage.notFound }`. Same 404 when `fileId` is null (seeded credentials have no file).
4. `recordAudit(db, { action: "credential.document_viewed", entityType: "credential", entityId, actorUserId: actor.userId, actorRole: actor.role, networkId, agencyId: actor.activeAgencyId ?? null, changes: { nurseId }, ...meta })`. Audit BEFORE signing: no audit row, no link.
5. Return `{ url: await storage.signedGetUrl(objectKey, DOWNLOAD_TTL_SECONDS), expiresAt: new Date(now.getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() }`.

### 5. Route
`apps/api/src/modules/credentials/routes.ts`, `app.get("/api/credentials/:id/download-url", pre, ...)`:
- `ShiftIdParams.safeParse(req.params)` (same `Id` charset as the review route); invalid → 404.
- Rate limit: new `app.createRateLimit({ max: 60, timeWindow: 60_000, keyGenerator: (req) => \`cred-download:${req.actor?.userId}\` })`. Separate instance, never reuse the upload one (see Status gotcha on shared flags).
- `store()` null → log + 503 `STORAGE_DOWN`, same as upload.
- Success: `reply.header("cache-control", "no-store")`, `CredentialDownloadResponse.parse(...)`.

### 6. Frontend: one shared button, three surfaces
New `apps/web/src/components/ui/CredentialDownloadButton.tsx`:
```tsx
export function CredentialDownloadButton({ credentialId, label }: { credentialId: string; label: string }) {
  const m = useMutation({
    mutationFn: () => apiFetch(`/api/credentials/${encodeURIComponent(credentialId)}/download-url`, { schema: CredentialDownloadResponse }),
    onSuccess: ({ url }) => window.location.assign(url), // attachment: the page stays, no popup blocker on iOS Safari
    onError: showError,
  });
  return <Button variant="secondary" size="sm" loading={m.isPending} aria-label={`Download ${label}`} onClick={() => m.mutate()}><Icon name="file" />Download</Button>;
}
```
No CSP change: this is a navigation, not `fetch`/`img`, so `connect-src 'self'` is untouched. No R2 CORS needed. Fetch the link on click, never in advance (5-minute expiry, one audit row per real view).

Render only when `c.hasFile`:
| Surface | Who | Where |
|---|---|---|
| `features/nurse/CredentialDetailDialog.tsx` | owner nurse | Replace the `File` row value "On file" with the button; update the "no download link" comment |
| `components/ui/NurseDetailDialog.tsx` | admin (`UserDialogs.tsx`, `ShiftDetailsDialog.tsx`) + agency owner/manager (`agency/shift-dialogs.tsx`) | In each `nd-creds` `<li>`, before `credentialActions` |

Add a toast-free mobile check: `nd-creds` row must not overflow at 375 px with Verify, Reject and Download. Agency scope on a non-`filled` shift gives 404 → `showError` toast; acceptable, API stays the authority.

Upload screen: no change unless step 1 forced the fallback.

### 7. Tests (write with the code)
`apps/api/src/modules/credentials/credentials.test.ts` (extend in-memory fake with `signedGetUrl` returning a recognizable URL, capture `contentDisposition`):
- 200: owner nurse, admin of network, agency owner/manager with a `filled` shift. Body matches contract, `expiresAt` = now + 300 s, `cache-control: no-store`, exactly one `credential.document_viewed` audit row.
- 404: other nurse, admin of another network, agency with no filled shift, agency staff role below manager, unknown id, credential with no file, soft-deleted.
- 503: storage null. 401: no token.
- Audit row contains no key, URL or file name.
- Upload stores `attachment; filename="credential.pdf"`, with no original name.
`authz/matrix.test.ts:250`: update title (the `/api/credentials` root assertions stay true).
`lib/storage`: unit test on `signedGetUrl` with dummy keys: URL holds `X-Amz-Expires=300`, `X-Amz-Signature`, and the path-style key.
Web: Vitest on the button (renders by `hasFile`, calls route, assigns URL, error toast). `e2e/mock-api.ts`: handle the new path. One real-API check via MinIO below.

## Files touched
| File | Change |
|---|---|
| `apps/api/src/lib/storage.ts` | `signedGetUrl`, PUT `content-disposition` |
| `apps/api/src/modules/credentials/service.ts` | `documentUrl`, disposition in `upload` |
| `apps/api/src/modules/credentials/routes.ts` | new GET route |
| `apps/api/src/modules/credentials/credentials.test.ts`, `authz/matrix.test.ts` | coverage |
| `packages/contracts/src/index.ts` | `CredentialDownloadResponse` |
| `apps/web/src/components/ui/CredentialDownloadButton.tsx` | new |
| `apps/web/src/components/ui/NurseDetailDialog.tsx`, `features/nurse/CredentialDetailDialog.tsx` | render button |
| `apps/web/e2e/mock-api.ts`, web tests | mock + coverage |
| `docs/postman/` | regenerate via `/postman-export` |
| `brain/Decisions.md`, `Status.md`, `Tasks.md`, `Session-Log.md`; `docs/ARCHITECTURE.md` §9.3 | Disposition set at PUT; supersede "no document links until R2 exists" |
| `.claude/skills/ponytail/`, `.claude/skills/plan-md/` | copy per CLAUDE.md skills rule |

No DB migration: `files.object_key`, `credentials.file_id` and the audit table already exist.

## Migrations / config
Victor, Cloudflare dashboard:
1. R2 → Create bucket `private-credentials`, location hint Eastern North America. Public access stays disabled; no custom domain; no CORS rule.
2. R2 → Manage API Tokens → Create **Account** token, permission **Object Read & Write**, scoped to `private-credentials` only. Note Access Key ID, Secret, Account ID.

Railway service `api` variables:
```
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<token access key>
R2_SECRET_ACCESS_KEY=<token secret>
R2_PRIVATE_BUCKET=private-credentials
```
`S3_ENDPOINT` must be **unset or empty** in prod, else the MinIO path wins. `S3_REGION` unset (defaults to `auto`). Vercel: no change. `R2_PUBLIC_*`: not needed, nothing uses them yet.

Rollback: remove any `R2_*` variable → uploads and links answer 503, rest of app unaffected. Revert the web deploy to drop the button.

## Verify
Local (`docker compose up -d postgres minio minio-init minio-policy`, `.env` from `.env.example`):
1. `/verify` green; `pnpm --filter web test`; `pnpm --filter web test:e2e`; `pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs --check`.
2. Log in as nurse, upload a PDF, open the credential, Download: file saves as `credential.pdf`, bytes identical to the original. Admin downloads it from Users → View details.
3. Query `audit_log`: one `credential.document_viewed` per click, no key or URL in `changes`.

Production, after deploy:
1. Upload ~9 MB PDF and a phone HEIC through the Vercel domain → 201, object visible in R2 dashboard (step 1 gate).
2. Download as nurse, admin, and an agency manager holding a filled shift.
3. Signed link in a private window works; after 5 minutes → `403` from R2.
4. Same object at a guessed unsigned R2 URL → denied. Other seeded nurse → API 404.
5. Railway logs: no `X-Amz-Signature` and no `credentials/` key. Smoke the 5 seeded users.

## Out of scope (deliberate)
- Inline preview, including the `Admin-Doc-Preview` design screen. Download per §9.3; HEIC doesn't render in Chrome anyway. Add when admins ask: needs `frame-src`/`img-src` for the R2 host and inline disposition.
- `public-assets` bucket, avatars, logos: no route uses them.
- Upload progress bar: `apiFetch` uses fetch; indeterminate bar stays.
- Malware scan, image re-encoding, retention/disposal job (§9.3 Future). Ask the founder before real nurse data goes live.
- Key rotation automation, multi-replica rate limit store, bulk export.
