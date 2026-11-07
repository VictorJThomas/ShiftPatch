// TODO(merge): import MeResponse from @shiftpatch/contracts
// Mirror of the contract Agent 1 adds to packages/contracts for GET /api/me. Delete this file once the merge lands.
import { z } from "zod";
import { Id, UserRole } from "@shiftpatch/contracts";

export const AgencyMembershipRole = z.enum(["owner", "manager", "viewer"]);

export const MeResponse = z.strictObject({
  user: z.strictObject({ id: Id, name: z.string().min(1), email: z.email(), role: UserRole }),
  agencies: z.array(z.strictObject({ agencyId: Id, name: z.string().min(1), role: AgencyMembershipRole })),
});

export type MeResponse = z.infer<typeof MeResponse>;
