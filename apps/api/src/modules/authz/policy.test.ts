// Pure policy matrix (no DB): ARCHITECTURE §7.1 / §4.5.
import { describe, expect, it } from "vitest";
import type { Actor, GlobalRole, MembershipRole } from "./actor.js";
import { can } from "./can.js";
import { denialResponse } from "./decision.js";

const NET = "net-1";
const OTHER_NET = "net-2";

function actor(over: Partial<Actor> & { role: GlobalRole }): Actor {
  return { userId: "u1", status: "active", agencies: [], networkIds: [], nurseNetworkId: null, activeAgencyId: null, ...over };
}
/** Single-agency member of agency-a with `role`. */
const member = (role: MembershipRole, agencyId = "agency-a"): Actor =>
  actor({ role: "agency", agencies: [{ agencyId, role }], activeAgencyId: agencyId });
const multi = (activeAgencyId: string | null): Actor =>
  actor({ role: "agency", agencies: [{ agencyId: "agency-a", role: "owner" }, { agencyId: "agency-b", role: "viewer" }], activeAgencyId });
const admin = (networkIds = [NET]) => actor({ role: "admin", networkIds });
const nurse = (id = "nurse-1", net: string | null = NET) => actor({ role: "nurse", userId: id, nurseNetworkId: net });

const shiftA = { agencyId: "agency-a", networkId: NET };
const ok = { allow: true };
const no = (reason: string) => ({ allow: false, reason });

describe("shift:read-agency", () => {
  it.each([
    ["owner", member("owner")], ["manager", member("manager")], ["viewer", member("viewer")], ["admin in network", admin()],
    ["multi-agency user without a selected agency (path param decides)", multi(null)],
  ])("allows %s", (_n, a) => expect(can(a, "shift:read-agency", shiftA)).toEqual(ok));
  it("denies a member of another agency", () => expect(can(member("owner", "agency-b"), "shift:read-agency", shiftA)).toEqual(no("not_a_member")));
  it("denies a nurse", () => expect(can(nurse(), "shift:read-agency", shiftA)).toEqual(no("role_not_permitted")));
  it("denies an admin outside the network", () => expect(can(admin([OTHER_NET]), "shift:read-agency", shiftA)).toEqual(no("not_a_member")));
  it("denies an admin whose network membership was revoked (empty networkIds)", () =>
    expect(can(admin([]), "shift:read-agency", shiftA)).toEqual(no("not_a_member")));
});

describe("shift:create / shift:manage (owner+manager, active agency)", () => {
  it.each(["owner", "manager"] as const)("%s can create and manage", (r) => {
    expect(can(member(r), "shift:create", { agencyId: "agency-a" })).toEqual(ok);
    expect(can(member(r), "shift:manage", shiftA)).toEqual(ok);
  });
  it("viewer cannot", () => {
    expect(can(member("viewer"), "shift:create", { agencyId: "agency-a" })).toEqual(no("insufficient_membership_role"));
    expect(can(member("viewer"), "shift:manage", shiftA)).toEqual(no("insufficient_membership_role"));
  });
  it("multi-agency without selection -> agency_selection_required (400)", () => {
    expect(can(multi(null), "shift:create", { agencyId: null })).toEqual(no("agency_selection_required"));
    expect(can(multi(null), "shift:manage", shiftA)).toEqual(no("agency_selection_required"));
    expect(denialResponse("agency_selection_required")).toEqual({ status: 400, body: { error: "Select an agency" } });
  });
  it("multi-agency: role comes from the SELECTED agency (owner in A, viewer in B)", () => {
    expect(can(multi("agency-a"), "shift:create", { agencyId: "agency-a" })).toEqual(ok);
    expect(can(multi("agency-b"), "shift:create", { agencyId: "agency-b" })).toEqual(no("insufficient_membership_role"));
  });
  it("write on another agency than the selected one is denied even if the user is a member of both", () =>
    expect(can(multi("agency-b"), "shift:manage", shiftA)).toEqual(no("not_a_member")));
  it("explicit target the user does not belong to -> 403, even when they have not selected an agency", () => {
    expect(can(multi(null), "shift:manage", { agencyId: "agency-zzz", networkId: NET })).toEqual(no("not_a_member"));
    expect(can(multi(null), "membership:manage", { agencyId: "agency-zzz", networkId: NET })).toEqual(no("not_a_member"));
  });
  it("the header cannot grant: forged activeAgencyId without a membership is denied", () => {
    const forged = actor({ role: "agency", agencies: [], activeAgencyId: "agency-a" });
    expect(can(forged, "shift:create", { agencyId: "agency-a" })).toEqual(no("not_a_member"));
    expect(can(forged, "shift:manage", shiftA)).toEqual(no("not_a_member"));
  });
  it("nurse cannot create/manage; admin cannot create (no agency) but can manage inside the network", () => {
    expect(can(nurse(), "shift:create", { agencyId: null })).toEqual(no("role_not_permitted"));
    expect(can(nurse(), "shift:manage", shiftA)).toEqual(no("role_not_permitted"));
    expect(can(admin(), "shift:create", { agencyId: null })).toEqual(no("role_not_permitted"));
    expect(can(admin(), "shift:manage", shiftA)).toEqual(ok);
    expect(can(admin([OTHER_NET]), "shift:manage", shiftA)).toEqual(no("role_not_permitted"));
  });
});

describe("shift:cancel", () => {
  const filled = { ...shiftA, claimedBy: "nurse-1", reason: "advance" as const };
  it("claiming nurse, advance only", () => {
    expect(can(nurse("nurse-1"), "shift:cancel", filled)).toEqual(ok);
    expect(can(nurse("nurse-1"), "shift:cancel", { ...filled, reason: "no-show" })).toEqual(no("resource_rule"));
  });
  it("another nurse (not the claimant) is denied; claiming a shift does not make a nurse an agency member", () => {
    expect(can(nurse("nurse-2"), "shift:cancel", filled)).toEqual(no("resource_rule"));
    expect(can(nurse("nurse-1"), "shift:manage", shiftA)).toEqual(no("role_not_permitted"));
  });
  it("owner/manager/admin allowed, viewer and foreign agency denied", () => {
    expect(can(member("owner"), "shift:cancel", { ...filled, reason: "no-show" })).toEqual(ok);
    expect(can(member("manager"), "shift:cancel", filled)).toEqual(ok);
    expect(can(admin(), "shift:cancel", filled)).toEqual(ok);
    expect(can(member("viewer"), "shift:cancel", filled)).toEqual(no("insufficient_membership_role"));
    expect(can(member("owner", "agency-b"), "shift:cancel", filled)).toEqual(no("not_a_member"));
    expect(can(admin([OTHER_NET]), "shift:cancel", filled)).toEqual(no("role_not_permitted"));
  });
});

describe("shift:create without any membership", () => {
  it("agency user with no active membership: 403, not Select an agency", () =>
    expect(can(actor({ role: "agency" }), "shift:create", { agencyId: null })).toEqual(no("not_a_member")));
});

describe("shift:list-matchable", () => {
  it("nurse with a roster network", () => expect(can(nurse(), "shift:list-matchable", {})).toEqual(ok));
  it("nurse without a roster network", () => expect(can(nurse("n", null), "shift:list-matchable", {})).toEqual(no("role_not_permitted")));
  it.each([["agency owner", member("owner")], ["agency viewer", member("viewer")], ["admin", admin()]])("%s is denied", (_n, a) =>
    expect(can(a, "shift:list-matchable", {})).toEqual(no("role_not_permitted")));
});

describe("shift:claim", () => {
  it("nurse of the shift's network", () => expect(can(nurse(), "shift:claim", { networkId: NET })).toEqual(ok));
  it("nurse of another network", () => expect(can(nurse("n", OTHER_NET), "shift:claim", { networkId: NET })).toEqual(no("out_of_scope")));
  it("nurse without a roster network", () => expect(can(nurse("n", null), "shift:claim", { networkId: NET })).toEqual(no("out_of_scope")));
  it.each([["agency owner", member("owner")], ["admin", admin()]])("%s cannot claim", (_n, a) =>
    expect(can(a, "shift:claim", { networkId: NET })).toEqual(no("role_not_permitted")));
});

describe("membership:read / membership:manage", () => {
  it("owner reads and manages", () => {
    expect(can(member("owner"), "membership:read", shiftA)).toEqual(ok);
    expect(can(member("owner"), "membership:manage", shiftA)).toEqual(ok);
  });
  it.each(["manager", "viewer"] as const)("%s cannot read or manage", (r) => {
    expect(can(member(r), "membership:read", shiftA)).toEqual(no("insufficient_membership_role"));
    expect(can(member(r), "membership:manage", shiftA)).toEqual(no("insufficient_membership_role"));
  });
  it("owner of another agency, nurse and out-of-network admin are denied; in-network admin allowed", () => {
    expect(can(member("owner", "agency-b"), "membership:read", shiftA)).toEqual(no("not_a_member"));
    expect(can(nurse(), "membership:read", shiftA)).toEqual(no("role_not_permitted"));
    expect(can(admin([OTHER_NET]), "membership:read", shiftA)).toEqual(no("not_a_member"));
    expect(can(admin(), "membership:read", shiftA)).toEqual(ok);
    expect(can(admin(), "membership:manage", shiftA)).toEqual(ok);
  });
  it("multi-agency owner must select the agency to manage members", () =>
    expect(can(multi(null), "membership:manage", shiftA)).toEqual(no("agency_selection_required")));
});

describe("audit:read", () => {
  it("admin reads the whole network log or one agency's", () => {
    expect(can(admin(), "audit:read", { agencyId: null, networkId: NET })).toEqual(ok);
    expect(can(admin(), "audit:read", { agencyId: "agency-a", networkId: NET })).toEqual(ok);
  });
  it("admin outside the network denied", () => expect(can(admin([OTHER_NET]), "audit:read", { agencyId: null, networkId: NET })).toEqual(no("not_a_member")));
  it("owner/manager read their own agency rows only; never the network log; viewer never", () => {
    expect(can(member("owner"), "audit:read", { agencyId: "agency-a", networkId: NET })).toEqual(ok);
    expect(can(member("manager"), "audit:read", { agencyId: "agency-a", networkId: NET })).toEqual(ok);
    expect(can(member("owner"), "audit:read", { agencyId: "agency-b", networkId: NET })).toEqual(no("not_a_member"));
    expect(can(member("owner"), "audit:read", { agencyId: null, networkId: NET })).toEqual(no("role_not_permitted"));
    expect(can(member("viewer"), "audit:read", { agencyId: "agency-a", networkId: NET })).toEqual(no("insufficient_membership_role"));
  });
  it("nurse denied", () => expect(can(nurse(), "audit:read", { agencyId: null, networkId: NET })).toEqual(no("role_not_permitted")));
});

describe("credential:read-metadata / read-document", () => {
  const res = { nurseId: "nurse-1", nurseNetworkId: NET, agencyIdsHoldingNurse: ["agency-a"] };
  it.each(["credential:read-metadata", "credential:read-document"] as const)("%s", (action) => {
    expect(can(nurse("nurse-1"), action, res)).toEqual(ok);
    expect(can(nurse("nurse-2"), action, res)).toEqual(no("out_of_scope"));
    expect(can(admin(), action, res)).toEqual(ok);
    expect(can(admin([OTHER_NET]), action, res)).toEqual(no("out_of_scope"));
    expect(can(member("owner"), action, res)).toEqual(ok); // holds one of agency-a's shifts
    expect(can(member("manager"), action, res)).toEqual(ok);
    expect(can(member("viewer"), action, res)).toEqual(no("out_of_scope"));
    expect(can(member("owner", "agency-b"), action, res)).toEqual(no("out_of_scope")); // nurse holds none of its shifts
    expect(can(member("owner"), action, { ...res, agencyIdsHoldingNurse: [] })).toEqual(no("out_of_scope")); // shift released
    expect(can(multi(null), action, res)).toEqual(ok); // reads need no selection: owner of agency-a, which holds a shift
    expect(can(multi("agency-b"), action, res)).toEqual(no("out_of_scope")); // header narrows to agency-b (holds none)
    expect(denialResponse("out_of_scope").status).toBe(404);
  });
});

describe("admin:network", () => {
  it("admin in network only", () => {
    expect(can(admin(), "admin:network", { networkId: NET })).toEqual(ok);
    expect(can(admin([OTHER_NET]), "admin:network", { networkId: NET })).toEqual(no("not_a_member"));
    expect(can(admin([]), "admin:network", { networkId: NET })).toEqual(no("not_a_member"));
    expect(can(member("owner"), "admin:network", { networkId: NET })).toEqual(no("role_not_permitted"));
    expect(can(nurse(), "admin:network", { networkId: NET })).toEqual(no("role_not_permitted"));
  });
});

describe("layer 1: agency memberships only count for the global role agency", () => {
  it("a nurse object carrying agency memberships is still not an agency member", () => {
    const sneaky = actor({ role: "nurse", userId: "n", agencies: [{ agencyId: "agency-a", role: "owner" }], activeAgencyId: "agency-a" });
    expect(can(sneaky, "shift:read-agency", shiftA)).toEqual(no("role_not_permitted"));
    expect(can(sneaky, "membership:manage", shiftA)).toEqual(no("role_not_permitted"));
  });
});

describe("denial -> HTTP", () => {
  it("maps reasons to the exact bodies", () => {
    expect(denialResponse("not_a_member")).toEqual({ status: 403, body: { error: "Forbidden" } });
    expect(denialResponse("resource_rule")).toEqual({ status: 403, body: { error: "Forbidden" } });
  });
});
