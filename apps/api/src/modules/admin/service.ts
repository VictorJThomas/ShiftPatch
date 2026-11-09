import type { AdminAgencyResponse, AdminCoverageQuery, AdminCoverageResponse, AdminUsersQuery, AdminUsersResponse, NurseDetail, StatusCounts } from "@shiftpatch/contracts";
import { ErrorMessage } from "@shiftpatch/contracts";
import type { Db } from "../../db/client.js";
import type { Actor } from "../authz/actor.js";
import { can } from "../authz/can.js";
import type { Decision } from "../authz/decision.js";
import { type NetworkScope, networkScope } from "../authz/scope.js";
import { loadNurseDetail } from "../credentials/service.js";
import { toCoverageRow } from "../shifts/mappers.js";
import * as shiftRepo from "../shifts/repository.js";
import * as repo from "./repository.js";

// Read-only network directory + coverage for admins. Authorization first (`admin:network` per network), scope from the actor.

export type Denied = { ok: false; denied: Decision & { allow: false } };
export type Failed = { ok: false; fail: { status: 404; error: string } };
const notFound = (): Failed => ({ ok: false, fail: { status: 404, error: ErrorMessage.notFound } });

/** Every network the admin actively administers, as scopes. Non-admin: role_not_permitted; admin with no network: not_a_member. */
export function authorizeAdmin(actor: Actor): { ok: true; scopes: NetworkScope[] } | Denied {
  const none = can(actor, "admin:network", { networkId: "" }) as Decision & { allow: false };
  if (none.reason === "role_not_permitted") return { ok: false, denied: none };
  const scopes: NetworkScope[] = [];
  for (const networkId of actor.networkIds) {
    const d = can(actor, "admin:network", { networkId });
    if (!d.allow) return { ok: false, denied: d as Decision & { allow: false } };
    scopes.push(networkScope(actor, networkId));
  }
  return scopes.length === 0 ? { ok: false, denied: none } : { ok: true, scopes };
}

const toCounts = (rows: { status: string; n: number }[]): StatusCounts => {
  const out: StatusCounts = { open: 0, filled: 0, cancelled: 0, completed: 0 };
  for (const r of rows) out[r.status as keyof StatusCounts] = r.n;
  return out;
};

/** GET /api/admin/coverage: one page of network shifts + totals for pagination + chip counts. */
export async function coverage(db: Db, scopes: NetworkScope[], q: AdminCoverageQuery): Promise<AdminCoverageResponse> {
  const { rows, counts } = await shiftRepo.coverageByNetworks(db, scopes, {
    status: q.status, agencyId: q.agencyId, q: q.q, sort: q.sort, limit: q.pageSize, offset: (q.page - 1) * q.pageSize,
  });
  const statusCounts = toCounts(counts);
  const total = q.status ? statusCounts[q.status] : Object.values(statusCounts).reduce((a, b) => a + b, 0);
  return { shifts: rows.map(toCoverageRow), page: q.page, pageSize: q.pageSize, total, statusCounts };
}

const encodeCursor = (id: string) => Buffer.from(id).toString("base64url");
const decodeCursor = (c: string): string | null => {
  const id = Buffer.from(c, "base64url").toString();
  return id !== "" && encodeCursor(id) === c ? id : null; // canonical only
};

/** GET /api/admin/users. `invalid` = a cursor that is not ours. */
export async function listUsers(db: Db, scopes: NetworkScope[], q: AdminUsersQuery): Promise<{ ok: true; value: AdminUsersResponse } | { ok: false; invalid: string }> {
  let after: string | undefined;
  if (q.cursor !== undefined) {
    const id = decodeCursor(q.cursor);
    if (id === null) return { ok: false, invalid: "Invalid query" };
    after = id;
  }
  const page = { q: q.q, after, limit: q.limit };
  const rows =
    q.type === "nurse"
      ? (await repo.listNurses(db, scopes, page)).map((r) => ({ id: r.id, type: "nurse" as const, name: r.name, email: r.email, licenseType: (r.licenseType as NurseDetail["licenseType"]) ?? null }))
      : (await repo.listAgencies(db, scopes, page)).map((r) => ({ id: r.id, type: "agency" as const, name: r.name, email: r.email, licenseType: null }));
  const items = rows.slice(0, q.limit);
  return { ok: true, value: { items, nextCursor: rows.length > q.limit ? encodeCursor(items.at(-1)!.id) : null } };
}

/** GET /api/admin/nurses/:id: a nurse of one of the admin's networks, else 404 (same answer as an unknown id). */
export async function nurse(db: Db, actor: Actor, nurseId: string): Promise<{ ok: true; value: NurseDetail } | Failed> {
  const networkId = await repo.nurseNetworkId(db, nurseId);
  if (!networkId || !can(actor, "admin:network", { networkId }).allow) return notFound();
  const detail = await loadNurseDetail(db, nurseId);
  return detail ? { ok: true, value: detail } : notFound();
}

/** GET /api/admin/agencies/:id. */
export async function agency(db: Db, scopes: NetworkScope[], agencyId: string): Promise<{ ok: true; value: AdminAgencyResponse } | Failed> {
  const d = await repo.agencyDetail(db, scopes, agencyId);
  if (!d) return notFound();
  return { ok: true, value: { ...d.agency, members: d.members, shiftCounts: toCounts(d.counts) } };
}
