import type { Actor } from "../authz/actor.js";
import { agencyWrite, allow, type Decision, deny, isAdminOf } from "../authz/decision.js";

export interface SubmitTimesheetResource { claimedBy: string | null } // the shift's holder, null when the shift is missing or open
export type ListTimesheetsResource = Record<string, never>; // no resource: scope comes from the actor
export interface ReviewTimesheetResource { agencyId: string; networkId: string } // the timesheet's shift

export type TimesheetAction = "timesheet:submit" | "timesheet:list-mine" | "timesheet:list" | "timesheet:review";
export interface TimesheetResources {
  "timesheet:submit": SubmitTimesheetResource;
  "timesheet:list-mine": ListTimesheetsResource;
  "timesheet:list": ListTimesheetsResource;
  "timesheet:review": ReviewTimesheetResource;
}

const WRITERS = ["owner", "manager"] as const;

export const timesheetPolicy: { [A in TimesheetAction]: (actor: Actor, r: TimesheetResources[A]) => Decision } = {
  // Only the nurse who holds the shift. Another nurse (or an open / missing shift) is out of scope: 404, no existence leak.
  "timesheet:submit": (actor, r) => {
    if (actor.role !== "nurse") return deny("role_not_permitted");
    return r.claimedBy !== null && r.claimedBy === actor.userId ? allow : deny("out_of_scope");
  },
  // GET /api/nurses/me/timesheets: the nurse's own rows, keyed on the actor's id.
  "timesheet:list-mine": (actor) => (actor.role === "nurse" ? allow : deny("role_not_permitted")),
  // GET /api/timesheets: any member of the active agency (viewer included), or an admin of at least one network. Nurses: 403.
  "timesheet:list": (actor) => {
    if (actor.role === "admin") return actor.networkIds.length > 0 ? allow : deny("not_a_member");
    if (actor.role !== "agency") return deny("role_not_permitted");
    if (actor.agencies.length === 0) return deny("not_a_member");
    return actor.activeAgencyId === null ? deny("agency_selection_required") : allow;
  },
  // Approve / dispute: owner or manager of the owning agency, or an admin of its network. Viewers: 403. An admin of another
  // network is out of scope (the service answers 404, like withdraw).
  "timesheet:review": (actor, r) => {
    if (actor.role === "admin") return isAdminOf(actor, r.networkId) ? allow : deny("out_of_scope");
    return agencyWrite(actor, r.agencyId, WRITERS);
  },
};
