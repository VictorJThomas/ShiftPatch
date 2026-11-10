/**
 * HTTP contracts for the 6 required routes (docs/original/ShiftPatch-Technical-Spec.md).
 *
 * Strictness policy (reconciles ARCHITECTURE.md security "Unknown fields stripped" with testing "exact keys"):
 * - Requests (body, params): z.object -> unknown keys are STRIPPED, never trusted. E.g. an `agencyId`
 *   sent in the POST /api/shifts body is dropped; the agency comes from the token.
 * - Responses: z.strictObject -> an extra key FAILS, so the API can't leak fields past the spec shape.
 *
 * HTTP only: no domain/DB types here. Mappers in apps/api translate domain -> these shapes.
 */
import { z } from "zod";

// ---------- Primitives ----------

/** `YYYY-MM-DD`, real calendar date (rejects 2026-02-30). */
export const IsoDate = z.iso.date();
/** `HH:MM`, 24h, facility-local. Seconds rejected (Postgres `time` must be formatted by the mapper). */
export const HhMm = z.iso.time({ precision: -1 });
/** Route ids like `shift-1`, `agency-a`. Bounded charset keeps junk out of queries and logs. */
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id");

export const UserRole = z.enum(["nurse", "agency", "admin"]);
export const ShiftRole = z.enum(["RN", "LPN", "CNA"]);
export const ShiftStatus = z.enum(["open", "filled", "cancelled", "completed"]);
export const CancelReason = z.enum(["no-show", "advance"]);

// ---------- Errors ----------

/** Every error body: `{ "error": "<message>" }`, nothing else. */
export const ErrorBody = z.strictObject({ error: z.string().min(1) });

/** Exact texts. `[Spec]` = trial spec, the rest = ARCHITECTURE.md (§5.3, §7, §8.2). */
export const ErrorMessage = {
  invalidCredentials: "Invalid email or password", // [Spec] 401 login
  credentialExpired: "Credential expired, cannot claim shift", // [Spec] 403 claim
  noValidCredential: "No valid credential on file, cannot claim shift", // 403 claim
  licenseRoleMismatch: "License type does not match shift role", // 403 claim: nurse license type (RN/LPN/CNA) differs from the shift role
  unauthorized: "Unauthorized", // 401 every route but login
  forbidden: "Forbidden", // 403 authorization
  agencyNotAllowed: "Agency not available", // 403 X-Agency-Id is stale, foreign or revoked (distinct from a permission denial)
  agencyRequired: "Select an agency", // 400 write action by a multi-agency user without X-Agency-Id (ARCHITECTURE §7.2)
  invalidFacility: "Facility not found in this network", // 400 POST /api/shifts facilityId outside the agency's network
  shiftNotFound: "Shift not found", // 404 claim / cancel (ARCHITECTURE §5.2); also an out-of-network shift (no existence leak)
  shiftNotOpen: "Shift is no longer open", // 409 claim (ARCHITECTURE §5.2)
  shiftOverlap: "You already hold a shift that overlaps this one", // 409 claim: the nurse's filled shifts may touch but not overlap
  shiftNotFilled: "Shift is not filled", // 409 cancel of a shift that is not filled (ARCHITECTURE §5.1)
  fileRequired: "Attach a file to upload", // 400 credential upload without a file part
  fileTooLarge: "File is larger than 10 MB", // 413 credential upload
  unsupportedFileType: "Unsupported file type. Upload a PDF, JPEG, PNG or HEIC file", // 415 credential upload (sniffed bytes)
  notFound: "Not found", // 404 admin lookups / credential review outside the caller's network (no existence leak)
  shiftHasNoNurse: "No nurse has claimed this shift", // 404 GET /api/shifts/:id/nurse on an open shift
  credentialAlreadyReviewed: "Credential already has this status", // 409 review to the status it already has
} as const;

// ---------- Shift shape (shared by routes 2-6) ----------

export const Shift = z.strictObject({
  id: Id,
  agencyId: Id,
  agencyName: z.string().min(1),
  role: ShiftRole,
  date: IsoDate,
  startTime: HhMm, // endTime < startTime = overnight shift, valid
  endTime: HhMm,
  status: ShiftStatus,
  claimedBy: Id.nullable(), // null when open
});

// ---------- 1. POST /api/auth/login ----------

export const LoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256), // cap bounds argon2 work per request
});
export const LoginResponse = z.strictObject({
  token: z.string().min(1),
  user: z.strictObject({ id: Id, name: z.string().min(1), role: UserRole }),
});

// ---------- 2. GET /api/shifts ----------

export const ListShiftsResponse = z.strictObject({ shifts: z.array(Shift) });
/**
 * Additive nurse view (ARCHITECTURE §8.3): `?matchable=true`. Absent or `false` = the full marketplace.
 * Optional AND filters (UI polish): no params = the exact spec behaviour. Unknown values are a 400.
 */
export const ListShiftsQuery = z.object({
  matchable: z.enum(["true", "false"]).optional(),
  status: ShiftStatus.optional(),
  role: ShiftRole.optional(),
  date: IsoDate.optional(),
  agencyId: Id.optional(),
});

// ---------- 3. POST /api/shifts ----------

/** Writable fields are exactly these; anything else (agencyId, status, claimedBy, id...) is stripped. facilityId is an additive optional. */
export const CreateShiftRequest = z
  .object({
    role: ShiftRole,
    date: IsoDate,
    startTime: HhMm,
    endTime: HhMm,
    facilityId: Id.optional(),
  })
  .refine((s) => s.startTime !== s.endTime, { message: "endTime must differ from startTime", path: ["endTime"] }); // DB CHECK shifts_times_differ
export const CreateShiftResponse = Shift.extend({ status: z.literal("open"), claimedBy: z.null() });

// ---------- Path params (routes 4-6) ----------

export const ShiftIdParams = z.object({ id: Id });
export const AgencyIdParams = z.object({ agencyId: Id });

// ---------- 4. POST /api/shifts/:id/claim ----------

/** Spec: empty body, nurse comes from the token. Absent or `{}`; extra keys stripped. */
export const ClaimShiftRequest = z.object({}).optional();
export const ClaimShiftResponse = Shift.extend({ status: z.literal("filled"), claimedBy: Id });

// ---------- 5. POST /api/shifts/:id/cancel ----------

export const CancelShiftRequest = z.object({ reason: CancelReason });
export const Cancellation = z.strictObject({ reason: CancelReason, previousNurseId: Id });
export const CancelShiftResponse = Shift.extend({
  status: z.literal("open"), // cancel reopens the shift
  claimedBy: z.null(),
  cancellation: Cancellation,
});

// ---------- POST /api/shifts/:id/withdraw (additive): agency pulls an open shift, open -> cancelled ----------

export const WithdrawShiftResponse = Shift.extend({ status: z.literal("cancelled"), claimedBy: z.null() });

// ---------- GET /api/nurses/me/shifts (additive): shifts the calling nurse holds or worked (filled + completed) ----------

export const NurseShiftsResponse = z.strictObject({ shifts: z.array(Shift) });

// ---------- GET /api/me (additive): who am I + which agencies can I act for ----------

export const AgencyMembershipRole = z.enum(["owner", "manager", "viewer"]);
export const MeResponse = z.strictObject({
  user: z.strictObject({ id: Id, name: z.string().min(1), email: z.email(), role: UserRole }),
  // timezone: the IANA zone new shifts of this agency are posted in (its network's default), so the Post-shift form can refuse a
  // past date the same way the server would compute "today". Optional for older clients/mocks.
  agencies: z.array(z.strictObject({ agencyId: Id, name: z.string().min(1), role: AgencyMembershipRole, timezone: z.string().min(1).optional() })),
});

// ---------- 6. GET /api/agencies/:agencyId/shifts ----------

export const AgencyShiftsResponse = z.strictObject({ agencyId: Id, shifts: z.array(Shift) });

// ---------- Coverage (additive): shifts + the claiming nurse's name, for the agency and admin tables ----------

/** Free-text search: trimmed, case-insensitive on the server. Capped so a request can't ship a huge pattern. */
const SearchText = z.string().trim().min(1).max(100);
/** The Shift shape plus the claimer's display name (null while open). Strict like every response. */
export const CoverageRow = Shift.extend({ claimedByName: z.string().min(1).nullable() });
export const StatusCounts = z.strictObject({ open: z.number().int(), filled: z.number().int(), cancelled: z.number().int(), completed: z.number().int() });

/** GET /api/agencies/:agencyId/coverage. `q` matches the nurse name or the shift id. */
export const AgencyCoverageQuery = z.object({ status: ShiftStatus.optional(), role: ShiftRole.optional(), date: IsoDate.optional(), q: SearchText.optional() });
export const AgencyCoverageResponse = z.strictObject({ agencyId: Id, shifts: z.array(CoverageRow) });

export const ADMIN_PAGE_SIZE_MAX = 100;
/** GET /api/admin/coverage. `q` matches the agency name, the nurse name or the shift id. `statusCounts` ignore `status` (chip counts). */
export const AdminCoverageQuery = z.object({
  status: ShiftStatus.optional(),
  agencyId: Id.optional(),
  q: SearchText.optional(),
  sort: z.enum(["asc", "desc"]).default("asc"), // by date, then start time; ties by shift id
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(ADMIN_PAGE_SIZE_MAX).default(25),
});
export const AdminCoverageResponse = z.strictObject({
  shifts: z.array(CoverageRow),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(), // rows matching every filter incl. status
  statusCounts: StatusCounts, // rows matching agencyId + q only, per status
});

// ---------- GET /api/audit-logs (additive, not one of the 6 required routes; ARCHITECTURE §11) ----------

const IsoInstant = z.iso.datetime({ offset: true });
export const AuditLogQuery = z.object({
  entityType: z.string().min(1).max(64).optional(),
  entityId: z.string().min(1).max(128).optional(),
  action: z.string().min(1).max(64).optional(),
  from: IsoInstant.optional(), // inclusive
  to: IsoInstant.optional(), // inclusive
  agencyId: Id.optional(), // QA-005: filter by agency (admin: within the caller's network)
  cursor: z.string().min(1).max(64).optional(), // opaque: the `nextCursor` of the previous page
  limit: z.coerce.number().int().min(1).max(100).optional(), // default 50
});
/** No ip / userAgent: request metadata stays in the table, it is not part of the read model. `changes` is `{ field: [before, after] }`, redacted. */
export const AuditLogEntry = z.strictObject({
  id: z.string().regex(/^\d{1,19}$/),
  occurredAt: IsoInstant,
  actorUserId: z.string().nullable(),
  actorRole: UserRole.nullable(),
  networkId: z.string().nullable(),
  agencyId: z.string().nullable(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  changes: z.record(z.string(), z.unknown()).nullable(),
  requestId: z.string().nullable(),
});
export const AuditLogResponse = z.strictObject({ items: z.array(AuditLogEntry), nextCursor: z.string().nullable() });

// ---------- Nurse credentials (additive, Stage 7; ARCHITECTURE §9) ----------

export const CredentialType = z.enum(["license", "tb_screening", "other"]);
export const CredentialStatus = z.enum(["pending", "verified", "rejected"]);
/** Upload limits shared by the API (hard 413/415) and the web form (early, friendly check). */
export const CREDENTIAL_MAX_BYTES = 10 * 1024 * 1024;
export const CREDENTIAL_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic"] as const;

/**
 * POST /api/nurses/me/credentials is multipart: these are the TEXT fields; the `file` part is validated by the route.
 * license -> expiresOn required (DB CHECK credentials_license_needs_expiry); tb_screening -> screenedOn required.
 */
export const UploadCredentialFields = z
  .object({
    type: CredentialType,
    licenseType: ShiftRole.optional(),
    expiresOn: IsoDate.optional(),
    screenedOn: IsoDate.optional(),
  })
  .refine((c) => c.type !== "license" || !!c.expiresOn, { message: "Expiry date is required for a license", path: ["expiresOn"] })
  .refine((c) => c.type !== "tb_screening" || !!c.screenedOn, { message: "Screening date is required for a TB screening", path: ["screenedOn"] });

/** `expired` = expiresOn is before today (derived, not a stored status). No file key, size or hash: the read model stays PII-light. */
export const NurseCredential = z.strictObject({
  id: Id,
  type: CredentialType,
  licenseType: ShiftRole.nullable(),
  status: CredentialStatus,
  expiresOn: IsoDate.nullable(),
  screenedOn: IsoDate.nullable(),
  uploadedAt: IsoInstant,
  expired: z.boolean(),
  hasFile: z.boolean(),
});
export const UploadCredentialResponse = z.strictObject({ credential: NurseCredential });
/** `licenseValid` = the same rule the claim uses (`isEligible`: unexpired license, verified OR pending per ARCHITECTURE §5.3). Drives the lapsed-license warning. */
export const NurseCredentialsResponse = z.strictObject({ credentials: z.array(NurseCredential), licenseValid: z.boolean() });
/** GET /api/credentials/:id/download-url: a short-lived signed link to the file (an attachment). Fetch on click, never in advance. */
export const CredentialDownloadResponse = z.strictObject({ url: z.url(), expiresAt: IsoInstant });

// ---------- Nurse detail + admin users + credential review (additive, UI polish) ----------

/** Who a nurse is and what is on file. Credentials never carry object keys or URLs (hasFile is a boolean). */
export const NurseDetail = z.strictObject({
  id: Id,
  name: z.string().min(1),
  email: z.email(),
  licenseType: ShiftRole.nullable(),
  credentials: z.array(NurseCredential),
});
export const ShiftNurseResponse = NurseDetail;
export const AdminNurseResponse = NurseDetail;

export const AdminUserType = z.enum(["nurse", "agency"]);
export const AdminUsersQuery = z.object({
  type: AdminUserType,
  q: SearchText.optional(), // name or email
  cursor: z.string().min(1).max(64).optional(), // opaque: the `nextCursor` of the previous page
  limit: z.coerce.number().int().min(1).max(ADMIN_PAGE_SIZE_MAX).default(25),
});
/** List rows are minimal: open the detail for the rest. `licenseType` is null for agencies. */
export const AdminUserRow = z.strictObject({
  id: Id,
  type: AdminUserType,
  name: z.string().min(1),
  email: z.string().nullable(),
  licenseType: ShiftRole.nullable(),
});
export const AdminUsersResponse = z.strictObject({ items: z.array(AdminUserRow), nextCursor: z.string().nullable() });

export const AdminAgencyResponse = z.strictObject({
  id: Id,
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  status: z.enum(["active", "suspended"]),
  members: z.array(z.strictObject({ userId: Id, name: z.string().min(1), email: z.string(), role: AgencyMembershipRole })),
  shiftCounts: StatusCounts,
});

/** PATCH /api/credentials/:id/review. Only the two outcomes: a credential never returns to `pending`. */
export const ReviewCredentialRequest = z.object({ status: z.enum(["verified", "rejected"]) });
/** `unassignedShifts`: upcoming filled shifts reopened because a rejection left the nurse without a valid license (0 otherwise). */
export const ReviewCredentialResponse = z.strictObject({ credential: NurseCredential, unassignedShifts: z.number().int().min(0).default(0) });

// ---------- Inferred types ----------
// Requests use z.input (what a client sends), responses z.output (what the API returns).

export type UserRole = z.infer<typeof UserRole>;
export type ShiftRole = z.infer<typeof ShiftRole>;
export type ShiftStatus = z.infer<typeof ShiftStatus>;
export type CancelReason = z.infer<typeof CancelReason>;
export type ErrorBody = z.infer<typeof ErrorBody>;
export type ErrorMessage = (typeof ErrorMessage)[keyof typeof ErrorMessage];
export type Shift = z.infer<typeof Shift>;
export type LoginRequest = z.input<typeof LoginRequest>;
export type LoginResponse = z.infer<typeof LoginResponse>;
export type ListShiftsResponse = z.infer<typeof ListShiftsResponse>;
export type ListShiftsQuery = z.infer<typeof ListShiftsQuery>;
export type CreateShiftRequest = z.input<typeof CreateShiftRequest>;
export type CreateShiftResponse = z.infer<typeof CreateShiftResponse>;
export type ShiftIdParams = z.infer<typeof ShiftIdParams>;
export type AgencyIdParams = z.infer<typeof AgencyIdParams>;
export type ClaimShiftRequest = z.input<typeof ClaimShiftRequest>;
export type ClaimShiftResponse = z.infer<typeof ClaimShiftResponse>;
export type CancelShiftRequest = z.input<typeof CancelShiftRequest>;
export type Cancellation = z.infer<typeof Cancellation>;
export type CancelShiftResponse = z.infer<typeof CancelShiftResponse>;
export type WithdrawShiftResponse = z.infer<typeof WithdrawShiftResponse>;
export type NurseShiftsResponse = z.infer<typeof NurseShiftsResponse>;
export type AgencyMembershipRole = z.infer<typeof AgencyMembershipRole>;
export type MeResponse = z.infer<typeof MeResponse>;
export type AgencyShiftsResponse = z.infer<typeof AgencyShiftsResponse>;
export type AuditLogQuery = z.infer<typeof AuditLogQuery>;
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;
export type AuditLogResponse = z.infer<typeof AuditLogResponse>;
export type CredentialType = z.infer<typeof CredentialType>;
export type CredentialStatus = z.infer<typeof CredentialStatus>;
export type UploadCredentialFields = z.input<typeof UploadCredentialFields>;
export type NurseCredential = z.infer<typeof NurseCredential>;
export type UploadCredentialResponse = z.infer<typeof UploadCredentialResponse>;
export type NurseCredentialsResponse = z.infer<typeof NurseCredentialsResponse>;
export type CoverageRow = z.infer<typeof CoverageRow>;
export type StatusCounts = z.infer<typeof StatusCounts>;
export type AgencyCoverageQuery = z.infer<typeof AgencyCoverageQuery>;
export type AgencyCoverageResponse = z.infer<typeof AgencyCoverageResponse>;
export type AdminCoverageQuery = z.infer<typeof AdminCoverageQuery>;
export type AdminCoverageResponse = z.infer<typeof AdminCoverageResponse>;
export type NurseDetail = z.infer<typeof NurseDetail>;
export type ShiftNurseResponse = z.infer<typeof ShiftNurseResponse>;
export type AdminNurseResponse = z.infer<typeof AdminNurseResponse>;
export type AdminUserType = z.infer<typeof AdminUserType>;
export type AdminUsersQuery = z.infer<typeof AdminUsersQuery>;
export type AdminUserRow = z.infer<typeof AdminUserRow>;
export type AdminUsersResponse = z.infer<typeof AdminUsersResponse>;
export type AdminAgencyResponse = z.infer<typeof AdminAgencyResponse>;
export type ReviewCredentialRequest = z.input<typeof ReviewCredentialRequest>;
export type ReviewCredentialResponse = z.infer<typeof ReviewCredentialResponse>;
