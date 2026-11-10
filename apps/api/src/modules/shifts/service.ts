import { randomUUID } from "node:crypto";
import { CancelShiftRequest, CreateShiftRequest, ErrorMessage, type NurseDetail } from "@shiftpatch/contracts";
import type { Db } from "../../db/client.js";
import { recordAudit, type RequestMeta } from "../audit/audit.js";
import type { Actor } from "../authz/actor.js";
import { can } from "../authz/can.js";
import { type Decision, deny } from "../authz/decision.js";
import { type AgencyScope, agencyScope, agencyScopeForAdmin, marketplaceScope, matchableScope } from "../authz/scope.js";
import { loadNurseDetail } from "../credentials/service.js";
import { enqueue } from "../notifications/enqueue.js";
import { agencyManagers, eligibleNurses, userName, userRecipient } from "../notifications/recipients.js";
import { ineligibility, isEligible, roleMatchesLicense, todayIn } from "./eligibility.js";
import * as repo from "./repository.js";

// Business operations for shifts. Routes call these and map the rows; every read goes through a scoped repository call.

export type Failure = { status: 403 | 404 | 409; error: string };
export type Result<T> = { ok: true; value: T } | { ok: false; denied: Decision & { allow: false } } | { ok: false; invalid: string } | { ok: false; fail: Failure };
const denied = (d: Decision): Result<never> => ({ ok: false, denied: d as Decision & { allow: false } });
const failed = (status: Failure["status"], error: string): Result<never> => ({ ok: false, fail: { status, error } });

/** GET /api/shifts: every non-deleted shift across agencies, any role (spec). */
export const listMarketplace = (db: Db, actor: Actor, filters: repo.ShiftFilters = {}) =>
  repo.listMarketplace(db, marketplaceScope(actor), { openOnly: false, filters });

/** GET /api/shifts?matchable=true: open shifts in the nurse's network she is eligible for. */
export async function listMatchable(db: Db, actor: Actor, now = new Date(), filters: repo.ShiftFilters = {}): Promise<Result<Awaited<ReturnType<typeof repo.listMarketplace>>>> {
  const decision = can(actor, "shift:list-matchable", {});
  if (!decision.allow) return denied(decision);
  const [open, licenses, licenseType] = await Promise.all([
    repo.listMarketplace(db, matchableScope(actor), { openOnly: true, filters }),
    repo.licensesOf(db, actor.userId),
    repo.nurseLicenseType(db, actor.userId),
  ]);
  const value = open.filter(
    (s) => roleMatchesLicense(licenseType, s.role) && isEligible(licenses, { shiftDate: s.shiftDate }, todayIn(s.timezone, now)),
  );
  return { ok: true, value };
}

/** GET /api/agencies/:agencyId/shifts. The URL param is only a lookup key; membership/admin decides. */
export async function listForAgency(db: Db, actor: Actor, agencyId: string): Promise<Result<Awaited<ReturnType<typeof repo.listByAgency>>>> {
  // Unknown agency -> "" -> denied for everyone, same 403 as a foreign agency (no existence leak).
  const networkId = (await repo.agencyNetworkId(db, agencyId)) ?? "";
  const decision = can(actor, "shift:read-agency", { agencyId, networkId });
  if (!decision.allow) return denied(decision);
  const scope = actor.role === "admin" ? agencyScopeForAdmin(actor, agencyId, networkId) : agencyScope(actor, agencyId);
  return { ok: true, value: await repo.listByAgency(db, scope) };
}

/** GET /api/agencies/:agencyId/coverage, step 1: same authorization as route 6 (runs before the query is validated). */
export async function authorizeAgencyCoverage(db: Db, actor: Actor, agencyId: string): Promise<Result<AgencyScope>> {
  const networkId = (await repo.agencyNetworkId(db, agencyId)) ?? "";
  const decision = can(actor, "shift:read-agency", { agencyId, networkId });
  if (!decision.allow) return denied(decision);
  return { ok: true, value: actor.role === "admin" ? agencyScopeForAdmin(actor, agencyId, networkId) : agencyScope(actor, agencyId) };
}

/** Step 2: the agency's shifts with the claiming nurse's name, filters ANDed. */
export const coverageForAgency = (db: Db, scope: AgencyScope, f: Parameters<typeof repo.coverageByAgency>[2]) => repo.coverageByAgency(db, scope, f);

/**
 * GET /api/shifts/:id/nurse. Who may see a nurse's credentials follows `credential:read-metadata` (ARCHITECTURE §7.1): admins of
 * the shift's network, owners/managers of the owning agency. Nurses: 403. Everyone else outside the shift's scope: 404.
 */
export async function nurseOfShift(db: Db, actor: Actor, shiftId: string): Promise<Result<NurseDetail>> {
  if (actor.role === "nurse") return denied(deny("role_not_permitted"));
  const shift = await repo.findLiveShift(db, shiftId);
  const decision = can(actor, "credential:read-metadata", {
    nurseId: shift?.claimedBy ?? "",
    nurseNetworkId: shift?.networkId ?? "", // a nurse can only claim inside her own network, so the shift's network is hers
    agencyIdsHoldingNurse: shift ? [shift.agencyId] : [],
  });
  if (!shift || !decision.allow) return failed(404, ErrorMessage.shiftNotFound); // missing or out of scope: one answer, no existence leak
  if (!shift.claimedBy) return failed(404, ErrorMessage.shiftHasNoNurse);
  const nurse = await loadNurseDetail(db, shift.claimedBy);
  return nurse ? { ok: true, value: nurse } : failed(404, ErrorMessage.shiftHasNoNurse);
}

/** POST /api/shifts. Authorization first (403 / 400 "Select an agency" before any body error), then validation. */
export async function createShift(db: Db, actor: Actor, body: unknown, meta: RequestMeta, now = new Date()): Promise<Result<Awaited<ReturnType<typeof repo.insertShift>>>> {
  const decision = can(actor, "shift:create", { agencyId: actor.activeAgencyId });
  if (!decision.allow) return denied(decision);
  const agencyId = actor.activeAgencyId!; // allow implies a validated active agency
  const parsed = CreateShiftRequest.safeParse(body ?? {}); // strips agencyId/status/claimedBy/id/...
  if (!parsed.success) return { ok: false, invalid: parsed.error.issues[0]?.message ?? "Invalid request" };
  const input = parsed.data;

  const networkId = await repo.agencyNetworkId(db, agencyId);
  if (!networkId) return denied(deny("not_a_member")); // agency lost its network approval: nothing to post into
  let timezone: string;
  if (input.facilityId) {
    const facilityTz = await repo.facilityTimezone(db, input.facilityId, networkId);
    if (!facilityTz) return { ok: false, invalid: ErrorMessage.invalidFacility };
    timezone = facilityTz;
  } else {
    timezone = await repo.networkDefaultTimezone(db, networkId);
  }
  // Insert + audit in one transaction (ARCHITECTURE §11): no shift without its `shift.created` row, no row without its shift.
  const row = await db.transaction(async (tx) => {
    const created = await repo.insertShift(tx, agencyScope(actor, agencyId), {
      role: input.role,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      facilityId: input.facilityId ?? null,
      timezone,
      networkId,
      createdBy: actor.userId,
    });
    await recordAudit(tx, {
      ...meta,
      actorUserId: actor.userId,
      actorRole: actor.role,
      networkId,
      agencyId,
      action: "shift.created",
      entityType: "shift",
      entityId: created.id,
      changes: {
        status: [null, "open"], role: [null, input.role], date: [null, input.date],
        startTime: [null, input.startTime], endTime: [null, input.endTime], facilityId: [null, input.facilityId ?? null],
      },
    });
    // Outbox (§10): only nurses who could claim it right now. Same tx, so a failed insert rolls the post back.
    const facility = input.facilityId ? await repo.facilityName(tx, input.facilityId) : null;
    await enqueue(tx, {
      template: "shift.posted",
      recipients: await eligibleNurses(tx, networkId, input.role, input.date, todayIn(timezone, now)),
      payload: { shiftId: created.id, role: input.role, date: input.date, startTime: input.startTime.slice(0, 5), endTime: input.endTime.slice(0, 5), agencyName: created.agencyName, facilityName: facility },
    });
    return created;
  });
  return { ok: true, value: row };
}

type ShiftView = Awaited<ReturnType<typeof repo.shiftView>>;

/**
 * POST /api/shifts/:id/claim (ARCHITECTURE §5.2). One transaction: load shift, lock + check the nurse's licenses, atomic
 * `UPDATE ... WHERE status='open'`, audit. A refusal before the UPDATE writes nothing; any throw rolls the whole thing back.
 */
export async function claimShift(db: Db, actor: Actor, shiftId: string, meta: RequestMeta, now = new Date()): Promise<Result<ShiftView>> {
  const out: { blocked?: { reason: "credential_expired" | "no_valid_credential" | "license_role_mismatch" | "shift_overlap"; shift: { id: string; networkId: string; agencyId: string } } } = {};
  const result = await db.transaction(async (tx): Promise<Result<ShiftView>> => {
    const shift = await repo.findLiveShift(tx, shiftId);
    const decision = can(actor, "shift:claim", { networkId: shift?.networkId ?? "" });
    // Wrong role = 403. Missing shift, or one outside the nurse's network = the same 404 (no existence leak).
    if (!decision.allow && decision.reason !== "out_of_scope") return denied(decision);
    if (!shift || !decision.allow) return failed(404, ErrorMessage.shiftNotFound);

    const licenses = await repo.lockLicenses(tx, actor.userId); // FOR SHARE: a concurrent credential change can't slip past the check
    const why = ineligibility(licenses, { shiftDate: shift.shiftDate }, todayIn(shift.timezone, now));
    if (why) {
      out.blocked = { reason: why === "expired" ? "credential_expired" : "no_valid_credential", shift };
      return failed(403, why === "expired" ? ErrorMessage.credentialExpired : ErrorMessage.noValidCredential);
    }
    if (!roleMatchesLicense(await repo.nurseLicenseType(tx, actor.userId), shift.role)) { // same rule as the matchable list
      out.blocked = { reason: "license_role_mismatch", shift };
      return failed(403, ErrorMessage.licenseRoleMismatch);
    }

    // One claim at a time per nurse, then the overlap check: two racing claims of overlapping shifts can't both pass.
    if (shift.status === "open" && (await repo.overlapsHeldShift(tx, actor.userId, shift.id))) { // not open: the claim below answers 409 "no longer open"
      out.blocked = { reason: "shift_overlap", shift };
      return failed(409, ErrorMessage.shiftOverlap);
    }

    if (!(await repo.claimRow(tx, { id: shift.id, nurseId: actor.userId, networkId: shift.networkId, now }))) {
      return failed(409, ErrorMessage.shiftNotOpen); // another request got there first (or it was withdrawn / deleted meanwhile)
    }
    await recordAudit(tx, {
      ...meta,
      actorUserId: actor.userId,
      actorRole: actor.role,
      networkId: shift.networkId,
      agencyId: shift.agencyId,
      action: "shift.claimed",
      entityType: "shift",
      entityId: shift.id,
      changes: { status: ["open", "filled"], claimedBy: [null, actor.userId] },
    });
    // Outbox (§10): the agency's owners/managers, plus the claiming nurse's own confirmation (the one email an actor gets about their action).
    const view = await repo.shiftView(tx, shift.id);
    const times = { shiftId: shift.id, role: shift.role, date: shift.shiftDate, startTime: view.startTime.slice(0, 5), endTime: view.endTime.slice(0, 5) };
    await enqueue(tx, { template: "shift.claimed.agency", payload: { ...times, nurseName: await userName(tx, actor.userId) }, recipients: await agencyManagers(tx, shift.agencyId) });
    await enqueue(tx, { template: "shift.claimed.nurse", payload: { ...times, agencyName: view.agencyName }, recipients: [await userRecipient(tx, actor.userId)] });
    return { ok: true, value: view };
  });
  // The claim tx wrote nothing (it returned early), so the denial row is written on its own and persists.
  const b = out.blocked;
  if (b) {
    await recordAudit(db, {
      ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: b.shift.networkId, agencyId: b.shift.agencyId,
      action: "access.denied", entityType: "shift", entityId: b.shift.id, changes: { reason: b.reason },
    });
  }
  return result;
}

/**
 * POST /api/shifts/:id/withdraw: open -> cancelled, by the owning agency's owner/manager or a network admin. Nothing to notify (an
 * open shift has no nurse). Foreign / unknown shifts are 404 for every would-be writer; viewers and nurses are 403.
 */
export async function withdrawShift(db: Db, actor: Actor, shiftId: string, meta: RequestMeta, now = new Date()): Promise<Result<ShiftView>> {
  return db.transaction(async (tx): Promise<Result<ShiftView>> => {
    const shift = await repo.findLiveShift(tx, shiftId);
    const decision = can(actor, "shift:manage", { agencyId: shift?.agencyId ?? "", networkId: shift?.networkId ?? "" });
    if (!decision.allow) {
      // Not a member of the owning agency / not admin of its network = the shift does not exist for you (no existence leak).
      const hidden = decision.reason === "not_a_member" || decision.reason === "out_of_scope" || actor.role === "admin";
      return hidden ? failed(404, ErrorMessage.shiftNotFound) : denied(decision);
    }
    if (!shift) return failed(404, ErrorMessage.shiftNotFound);
    if (!(await repo.withdrawRow(tx, shift.id, now))) return failed(409, ErrorMessage.shiftNotOpen);
    await recordAudit(tx, {
      ...meta,
      actorUserId: actor.userId,
      actorRole: actor.role,
      networkId: shift.networkId,
      agencyId: shift.agencyId,
      action: "shift.withdrawn",
      entityType: "shift",
      entityId: shift.id,
      changes: { status: ["open", "cancelled"] },
    });
    return { ok: true, value: await repo.shiftView(tx, shift.id) };
  });
}

/** GET /api/nurses/me/shifts. */
export async function listMine(db: Db, actor: Actor): Promise<Result<Awaited<ReturnType<typeof repo.listClaimedBy>>>> {
  const decision = can(actor, "shift:list-mine", {});
  if (!decision.allow) return denied(decision);
  return { ok: true, value: await repo.listClaimedBy(db, actor.userId) };
}

/**
 * POST /api/shifts/:id/cancel (ARCHITECTURE §5.4): filled -> open. The shift row is locked first, so racing cancels serialize
 * (the loser sees `open` -> 409) and the previous nurse is read from the locked row. History, audit and outbox commit together.
 * Not the agency withdrawal (open -> cancelled).
 */
export async function cancelShift(
  db: Db,
  actor: Actor,
  shiftId: string,
  body: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<Result<{ shift: ShiftView; cancellation: { reason: "no-show" | "advance"; previousNurseId: string } }>> {
  type Out = Result<{ shift: ShiftView; cancellation: { reason: "no-show" | "advance"; previousNurseId: string } }>;
  return db.transaction(async (tx): Promise<Out> => {
    // Authorize on an unlocked read first: a caller with no rights must not be able to take the row lock (and stall real claims).
    const peek = await repo.findLiveShift(tx, shiftId);
    if (!peek) return failed(404, ErrorMessage.shiftNotFound);
    // Authorization before validation (403 before 400): decide with the caller's reason when it parses, else with the most
    // permissive one ("advance"), so a caller with no rights never learns what a valid body looks like.
    const parsed = CancelShiftRequest.safeParse(body ?? {});
    const resource = (s: NonNullable<typeof peek>, reason: "no-show" | "advance") => ({ agencyId: s.agencyId, networkId: s.networkId, claimedBy: s.claimedBy, reason });
    const first = can(actor, "shift:cancel", resource(peek, parsed.success ? parsed.data.reason : "advance"));
    if (!first.allow) return denied(first);
    if (!parsed.success) return { ok: false, invalid: parsed.error.issues[0]?.message ?? "Invalid request" };
    const { reason } = parsed.data;

    // Then lock and re-decide on the locked row: the holder may have changed in between.
    const shift = await repo.findLiveShift(tx, shiftId, { lock: true });
    if (!shift) return failed(404, ErrorMessage.shiftNotFound);
    const decision = can(actor, "shift:cancel", resource(shift, reason));
    if (!decision.allow) return denied(decision);
    const previousNurseId = shift.claimedBy;
    if (shift.status !== "filled" || !previousNurseId) return failed(409, ErrorMessage.shiftNotFilled);
    if (!(await repo.reopenRow(tx, shift.id, now))) return failed(409, ErrorMessage.shiftNotFilled); // unreachable under the lock; belt and braces

    await repo.insertCancellation(tx, {
      id: `cxl_${randomUUID()}`,
      shiftId: shift.id,
      reason,
      previousNurseId,
      cancelledBy: actor.userId,
      cancelledByRole: actor.role,
    });
    await recordAudit(tx, {
      ...meta,
      actorUserId: actor.userId,
      actorRole: actor.role,
      networkId: shift.networkId,
      agencyId: shift.agencyId,
      action: "shift.cancelled",
      entityType: "shift",
      entityId: shift.id,
      changes: { status: ["filled", "open"], claimedBy: [previousNurseId, null], reason },
    });

    // Outbox (§10): nurse cancels -> agency owners/managers; agency or admin cancels -> the previous nurse + the other owners/managers.
    const view = await repo.shiftView(tx, shift.id);
    const { managers, nurse } = await repo.cancelRecipients(tx, shift.agencyId, previousNurseId);
    const payload = { shiftId: shift.id, date: shift.shiftDate, startTime: view.startTime.slice(0, 5), endTime: view.endTime.slice(0, 5), role: shift.role, agencyName: view.agencyName, reason }; // no credential / health data
    await enqueue(tx, { template: "shift.cancelled", payload, recipients: [...managers, nurse], excludeUserId: actor.userId });
    return { ok: true, value: { shift: view, cancellation: { reason, previousNurseId } } };
  });
}
