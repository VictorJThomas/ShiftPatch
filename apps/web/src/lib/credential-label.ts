import "@/lib/zod-csp"; // first: the contracts import below builds zod schemas
import type { NurseCredential } from "@shiftpatch/contracts";

/** The one source of credential names in the UI: "Nursing license", "TB screening", "Other document". */
export const credentialTypeLabel = (type: NurseCredential["type"]): string =>
  type === "license" ? "Nursing license" : type === "tb_screening" ? "TB screening" : "Other document";

/** Type name plus the license type when there is one: "Nursing license (RN)". */
export function credentialLabel(c: Pick<NurseCredential, "type" | "licenseType">): string {
  return c.type === "license" && c.licenseType ? `${credentialTypeLabel(c.type)} (${c.licenseType})` : credentialTypeLabel(c.type);
}
