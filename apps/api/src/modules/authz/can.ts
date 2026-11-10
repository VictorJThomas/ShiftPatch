import { type AdminAction, type AdminResources, adminPolicy } from "../admin/policy.js";
import { type AuditAction, type AuditResources, auditPolicy } from "../audit/policy.js";
import { type CredentialAction, type CredentialResources, credentialPolicy } from "../credentials/policy.js";
import { type InspectionAction, type InspectionResources, inspectionPolicy } from "../inspection/policy.js";
import { type MembershipAction, type MembershipResources, membershipPolicy } from "../memberships/policy.js";
import { type ShiftAction, type ShiftResources, shiftPolicy } from "../shifts/policy.js";
import { type TimesheetAction, type TimesheetResources, timesheetPolicy } from "../timesheets/policy.js";
import type { Actor } from "./actor.js";
import type { Decision } from "./decision.js";

export type PolicyMap = ShiftResources & MembershipResources & AuditResources & CredentialResources & AdminResources & InspectionResources & TimesheetResources;
export type Action = ShiftAction | MembershipAction | AuditAction | CredentialAction | AdminAction | InspectionAction | TimesheetAction;

const policies: { [A in Action]: (actor: Actor, resource: PolicyMap[A]) => Decision } = {
  ...shiftPolicy,
  ...membershipPolicy,
  ...auditPolicy,
  ...credentialPolicy,
  ...adminPolicy,
  ...inspectionPolicy,
  ...timesheetPolicy,
};

/** `can(actor, action, resource) -> allow | deny(reason)`. Pure: no I/O, the actor already carries fresh DB state. */
export function can<A extends Action>(actor: Actor, action: A, resource: PolicyMap[A]): Decision {
  return policies[action](actor, resource);
}
