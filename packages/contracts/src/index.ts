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
  unauthorized: "Unauthorized", // 401 every route but login
  forbidden: "Forbidden", // 403 authorization
  agencyRequired: "Select an agency", // 400 write action by a multi-agency user without X-Agency-Id (ARCHITECTURE §7.2)
  invalidFacility: "Facility not found in this network", // 400 POST /api/shifts facilityId outside the agency's network
  shiftNotFound: "Shift not found", // 404 claim / cancel (ARCHITECTURE §5.2); also an out-of-network shift (no existence leak)
  shiftNotOpen: "Shift is no longer open", // 409 claim (ARCHITECTURE §5.2)
  shiftNotFilled: "Shift is not filled", // 409 cancel of a shift that is not filled (ARCHITECTURE §5.1)
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
/** Additive nurse view (ARCHITECTURE §8.3): `?matchable=true`. Absent or `false` = the full marketplace. */
export const ListShiftsQuery = z.object({ matchable: z.enum(["true", "false"]).optional() });

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

// ---------- 6. GET /api/agencies/:agencyId/shifts ----------

export const AgencyShiftsResponse = z.strictObject({ agencyId: Id, shifts: z.array(Shift) });

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
export type AgencyShiftsResponse = z.infer<typeof AgencyShiftsResponse>;
