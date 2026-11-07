import { CreateShiftRequest, ErrorMessage } from "@shiftpatch/contracts";
import type { Db } from "../../db/client.js";
import type { Actor } from "../authz/actor.js";
import { can } from "../authz/can.js";
import { type Decision, deny } from "../authz/decision.js";
import { agencyScope, agencyScopeForAdmin, marketplaceScope, matchableScope } from "../authz/scope.js";
import { isEligible, roleMatchesLicense, todayIn } from "./eligibility.js";
import * as repo from "./repository.js";

// Business operations for shifts. Routes call these and map the rows; every read goes through a scoped repository call.

export type Result<T> = { ok: true; value: T } | { ok: false; denied: Decision & { allow: false } } | { ok: false; invalid: string };
const denied = (d: Decision): Result<never> => ({ ok: false, denied: d as Decision & { allow: false } });

/** GET /api/shifts: every non-deleted shift across agencies, any role (spec). */
export const listMarketplace = (db: Db, actor: Actor) => repo.listMarketplace(db, marketplaceScope(actor), { openOnly: false });

/** GET /api/shifts?matchable=true: open shifts in the nurse's network she is eligible for. */
export async function listMatchable(db: Db, actor: Actor, now = new Date()): Promise<Result<Awaited<ReturnType<typeof repo.listMarketplace>>>> {
  const decision = can(actor, "shift:list-matchable", {});
  if (!decision.allow) return denied(decision);
  const [open, licenses, licenseType] = await Promise.all([
    repo.listMarketplace(db, matchableScope(actor), { openOnly: true }),
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

/** POST /api/shifts. Authorization first (403 / 400 "Select an agency" before any body error), then validation. */
export async function createShift(db: Db, actor: Actor, body: unknown): Promise<Result<Awaited<ReturnType<typeof repo.insertShift>>>> {
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
  const row = await repo.insertShift(db, agencyScope(actor, agencyId), {
    role: input.role,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    facilityId: input.facilityId ?? null,
    timezone,
    networkId,
    createdBy: actor.userId,
  });
  return { ok: true, value: row };
}
