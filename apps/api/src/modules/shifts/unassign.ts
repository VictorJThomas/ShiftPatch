import { and, eq, isNull } from "drizzle-orm";
import { credentials, shifts } from "../../db/schema/index.js";
import { recordAudit, type RequestMeta, type Tx } from "../audit/audit.js";
import type { Actor } from "../authz/actor.js";
import { enqueue } from "../notifications/enqueue.js";
import { ineligibility, todayIn } from "./eligibility.js";
import * as repo from "./repository.js";

/**
 * A license was rejected after the nurse claimed shifts (Decisions 2026-11-10). Re-runs the claim rule (§5.3) for every shift
 * she still holds that has not passed yet (shift date >= today in the shift's timezone) and reopens the ones she could no longer
 * claim, so no shift stays assigned to a nurse without a valid license. Past shifts keep their history. Runs in the review's
 * transaction: reopen + `shift.unassigned` audit + outbox commit or roll back with the rejection. Returns how many were reopened.
 */
export async function unassignAfterLicenseLoss(tx: Tx, nurseId: string, actor: Actor, meta: RequestMeta, now: Date): Promise<number> {
  const licenses = await tx
    .select({ status: credentials.status, expiresOn: credentials.expiresOn, deletedAt: credentials.deletedAt })
    .from(credentials)
    .where(and(eq(credentials.nurseId, nurseId), eq(credentials.type, "license"), isNull(credentials.deletedAt)));
  const held = await tx
    .select({ id: shifts.id, networkId: shifts.networkId, agencyId: shifts.agencyId, role: shifts.role, shiftDate: shifts.shiftDate, timezone: shifts.timezone })
    .from(shifts)
    .where(and(eq(shifts.claimedBy, nurseId), eq(shifts.status, "filled"), isNull(shifts.deletedAt)))
    .for("update");
  let count = 0;
  for (const s of held) {
    const today = todayIn(s.timezone, now);
    if (s.shiftDate < today || !ineligibility(licenses, s, today)) continue;
    if (!(await repo.reopenRow(tx, s.id, now))) continue;
    count++;
    await recordAudit(tx, {
      ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: s.networkId, agencyId: s.agencyId,
      action: "shift.unassigned", entityType: "shift", entityId: s.id,
      changes: { status: ["filled", "open"], claimedBy: [nurseId, null], reason: "license_rejected" },
    });
    const view = await repo.shiftView(tx, s.id);
    const { managers, nurse } = await repo.cancelRecipients(tx, s.agencyId, nurseId);
    await enqueue(tx, {
      template: "shift.unassigned",
      payload: { shiftId: s.id, date: s.shiftDate, startTime: view.startTime.slice(0, 5), endTime: view.endTime.slice(0, 5), role: s.role, agencyName: view.agencyName }, // no credential detail
      recipients: [...managers, nurse],
    });
  }
  return count;
}
