import type { Page, Route } from "@playwright/test";

export type Role = "nurse" | "agency" | "admin";

interface Membership {
  agencyId: string;
  name: string;
  role: "owner" | "manager" | "viewer";
}

export interface TestUser {
  email: string;
  password: string;
  user: { id: string; name: string; role: Role };
  agencies: Membership[];
}

const SUNRISE: Membership = { agencyId: "agency-a", name: "Sunrise Health Staffing", role: "owner" };
const METRO: Membership = { agencyId: "agency-b", name: "Metro Care Partners", role: "manager" };
const AGENCY_NAMES: Record<string, string> = { "agency-a": SUNRISE.name, "agency-b": METRO.name };

export const USERS = {
  nurse: { email: "maria.lopez@example.com", password: "pw-nurse", user: { id: "nurse-1", name: "Maria Lopez", role: "nurse" }, agencies: [] },
  nurse2: { email: "james.cook@example.com", password: "pw-nurse2", user: { id: "nurse-2", name: "James Cook", role: "nurse" }, agencies: [] },
  agency: { email: "scheduler@sunrise-health.example", password: "pw-agency", user: { id: "agency-user-1", name: "Sam Carter", role: "agency" }, agencies: [SUNRISE] },
  agencyB: { email: "admin@metrocare.example", password: "pw-agency-b", user: { id: "agency-user-3", name: "Metro Admin", role: "agency" }, agencies: [METRO] },
  multi: { email: "ops@both.example", password: "pw-multi", user: { id: "agency-user-2", name: "Pat Ortiz", role: "agency" }, agencies: [SUNRISE, METRO] },
  admin: { email: "alex.kim@example.com", password: "pw-admin", user: { id: "admin-1", name: "Alex Kim", role: "admin" }, agencies: [] },
} satisfies Record<string, TestUser>;
export type UserKey = keyof typeof USERS;

export interface MockShift {
  id: string;
  agencyId: string;
  agencyName: string;
  role: "RN" | "LPN" | "CNA";
  date: string;
  startTime: string;
  endTime: string;
  status: "open" | "filled" | "cancelled" | "completed";
  claimedBy: string | null;
}

/** The spec seed (docs/original/ShiftPatch-Technical-Spec.md, "Shifts"), exactly. */
export const SEED_SHIFTS: readonly MockShift[] = [
  { id: "shift-1", agencyId: "agency-a", agencyName: SUNRISE.name, role: "RN", date: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null },
  { id: "shift-2", agencyId: "agency-a", agencyName: SUNRISE.name, role: "LPN", date: "2026-10-03", startTime: "07:00", endTime: "19:00", status: "filled", claimedBy: "nurse-1" },
  { id: "shift-3", agencyId: "agency-b", agencyName: METRO.name, role: "RN", date: "2026-10-04", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null },
];

/** Seed credentials: nurse-1 valid until 2027-01-01, nurse-2 expired 2026-06-01. Both RN licenses. */
const SEED_CREDENTIALS: Record<string, { expiresOn: string; expired: boolean }> = {
  "nurse-1": { expiresOn: "2027-01-01", expired: false },
  "nurse-2": { expiresOn: "2026-06-01", expired: true },
};

// Exact API texts (packages/contracts ErrorMessage).
const ERR = {
  forbidden: "Forbidden",
  agencyNotAllowed: "Agency not available",
  credentialExpired: "Credential expired, cannot claim shift",
  shiftNotFound: "Shift not found",
  shiftNotOpen: "Shift is no longer open",
  shiftNotFilled: "Shift is not filled",
  notFound: "Not found",
};

const NURSES: Record<string, { name: string; email: string; licenseType: "RN" | "LPN" | "CNA" }> = {
  "nurse-1": { name: "Maria Lopez", email: "maria.lopez@example.com", licenseType: "RN" },
  "nurse-2": { name: "James Cook", email: "james.cook@example.com", licenseType: "RN" },
};
const AGENCY_DETAILS: Record<string, { email: string; phone: string; city: string; state: string; members: { userId: string; name: string; email: string; role: "owner" | "manager" | "viewer" }[] }> = {
  "agency-a": { email: "scheduler@sunrise-health.example", phone: "555-0100", city: "Austin", state: "TX", members: [{ userId: "agency-user-1", name: "Sam Carter", email: "scheduler@sunrise-health.example", role: "owner" }] },
  "agency-b": { email: "admin@metrocare.example", phone: "555-0200", city: "Dallas", state: "TX", members: [{ userId: "agency-user-3", name: "Metro Admin", email: "admin@metrocare.example", role: "manager" }] },
};

export interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
}

/**
 * In-memory fake of the API surface the web app touches, seeded from the spec. Install it with `MockApi.install(page)`.
 * Tokens are opaque and single-generation: `expireTokens()` makes every issued token answer 401, like a 15-minute expiry.
 * Error texts and status codes mirror apps/api (see ERR); `shifts` is mutable state that claims/cancels/posts change.
 */
export class MockApi {
  readonly requests: RecordedRequest[] = [];
  /** Who owns the (fake) refresh cookie. null = no session. */
  sessionUser: TestUser | null = null;
  refreshFails = false;
  /** The next N refresh calls answer 409 (lost a concurrent rotation). */
  raceNext = 0;
  /** Every non-auth endpoint answers 401 regardless of the token (retry-loop scenario). */
  rejectAllTokens = false;
  /** Expire every token right after the next /api/me answer (so the first page's queries all 401 together). */
  expireAfterMe = false;
  /** Delay for the refresh answer and for 401 answers, to force overlapping requests. */
  refreshDelayMs = 0;
  unauthorizedDelayMs = 0;
  /** Per-agency overrides for GET /api/agencies/:id/shifts. */
  shiftsStatus: Record<string, { status: number; body: unknown }> = {};
  loginOverride: { status: number; body: unknown } | null = null;
  logoutStatus = 204;
  /** Successful refreshes served (reset it to scope an assertion). */
  refreshesIssued = 0;
  /** Refreshes that may still succeed before the fake session dies. */
  refreshBudget = Infinity;
  /** Mutable shift state (starts as the spec seed). */
  shifts: MockShift[] = SEED_SHIFTS.map((s) => ({ ...s }));
  /** Audit entries served by GET /api/audit-logs (newest first). Raise it to exercise "Load more" (page size 50). */
  auditCount = 12;
  /** Uploaded credentials per nurse (pending). */
  uploads: Record<string, { id: string; expiresOn: string | null; uploadedAt: string }[]> = {};

  /** Review outcomes set by PATCH /api/credentials/:id/review (credential id -> status). */
  reviewed: Record<string, "verified" | "rejected"> = {};

  private validTokens = new Set<string>();
  private counter = 0;

  static async install(page: Page): Promise<MockApi> {
    const api = new MockApi();
    await page.route("**/api/**", (route) => api.handle(route));
    return api;
  }

  expireTokens() {
    this.validTokens.clear();
  }

  calls(path: string, method?: string) {
    return this.requests.filter((r) => r.path === path && (!method || r.method === method));
  }

  private mint(): string {
    const token = `tok-${++this.counter}`;
    this.validTokens.add(token);
    return token;
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  }

  private async unauthorized(route: Route) {
    if (this.unauthorizedDelayMs) await new Promise((r) => setTimeout(r, this.unauthorizedDelayMs));
    return this.json(route, 401, { error: "Unauthorized" });
  }

  private authedUser(headers: Record<string, string>): TestUser | null {
    const token = headers.authorization?.replace(/^Bearer /, "");
    if (this.rejectAllTokens || !token || !this.validTokens.has(token)) return null;
    return this.sessionUser;
  }

  /** Like the API's loadActor: a stale/foreign X-Agency-Id is a 403 "Agency not available" on every route. */
  private activeAgency(user: TestUser, headers: Record<string, string>): string | null | false {
    const header = headers["x-agency-id"];
    if (user.user.role !== "agency") return null;
    if (header) return user.agencies.some((a) => a.agencyId === header) ? header : false;
    return user.agencies.length === 1 ? user.agencies[0]!.agencyId : null;
  }

  private credentialsOf(nurseId: string) {
    const seed = SEED_CREDENTIALS[nurseId];
    const list0 = [
      ...(seed
        ? [{ id: `cred-${nurseId}`, type: "license", licenseType: "RN", status: "verified", expiresOn: seed.expiresOn, screenedOn: null, uploadedAt: "2026-01-05T10:00:00.000Z", expired: seed.expired, hasFile: true }]
        : []),
      ...(this.uploads[nurseId] ?? []).map((u) => ({ id: u.id, type: "license", licenseType: null, status: "pending", expiresOn: u.expiresOn, screenedOn: null, uploadedAt: u.uploadedAt, expired: false, hasFile: true })),
    ];
    const list = list0.map((c) => (this.reviewed[c.id] ? { ...c, status: this.reviewed[c.id]! } : c));
    return { credentials: list, licenseValid: list.some((c) => c.type === "license" && !c.expired && c.status !== "rejected") };
  }

  private auditItems() {
    const actions = ["shift.created", "shift.claimed", "shift.cancelled", "auth.login"];
    return Array.from({ length: this.auditCount }, (_, i) => {
      const agencyId = i % 2 === 0 ? "agency-a" : "agency-b";
      const action = actions[i % actions.length]!;
      return {
        id: String(this.auditCount - i),
        occurredAt: new Date(Date.UTC(2026, 10, 7, 12, 0, 0) - i * 60_000).toISOString(),
        actorUserId: action === "shift.claimed" ? "nurse-1" : "admin-1",
        actorRole: action === "shift.claimed" ? "nurse" : "admin",
        networkId: "network-1",
        agencyId: action === "auth.login" ? null : agencyId,
        action,
        entityType: action === "auth.login" ? "user" : "shift",
        entityId: action === "auth.login" ? "admin-1" : `shift-${(i % 3) + 1}`,
        changes: action === "shift.claimed" ? { status: ["open", "filled"] } : null,
        requestId: `req-${i}`,
      };
    });
  }

  async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const headers = req.headers();
    this.requests.push({ method, path, search: url.search, headers });

    if (path === "/api/auth/login") {
      if (this.loginOverride) return this.json(route, this.loginOverride.status, this.loginOverride.body);
      const body = req.postDataJSON() as { email?: string; password?: string };
      const match = Object.values(USERS).find((u) => u.email === body.email && u.password === body.password);
      if (!match) return this.json(route, 401, { error: "Invalid email or password" });
      this.sessionUser = match;
      return this.json(route, 200, { token: this.mint(), user: match.user });
    }

    if (path === "/api/auth/refresh") {
      if (this.refreshDelayMs) await new Promise((r) => setTimeout(r, this.refreshDelayMs));
      if (this.raceNext > 0) {
        this.raceNext--;
        return this.json(route, 409, { error: "Session refresh already in progress, retry" });
      }
      if (this.refreshFails || !this.sessionUser || this.refreshesIssued >= this.refreshBudget) return this.json(route, 401, { error: "Unauthorized" });
      this.refreshesIssued++;
      return this.json(route, 200, { token: this.mint(), user: this.sessionUser.user });
    }

    if (path === "/api/auth/logout") {
      this.sessionUser = null;
      this.validTokens.clear();
      return route.fulfill({ status: this.logoutStatus, contentType: "application/json", body: this.logoutStatus === 204 ? undefined : JSON.stringify({ error: "boom" }) });
    }

    const user = this.authedUser(headers);
    if (!user) return this.unauthorized(route);

    if (path === "/api/me") {
      if (this.expireAfterMe) {
        this.expireAfterMe = false;
        this.validTokens.clear();
      }
      return this.json(route, 200, { user: { ...user.user, email: user.email }, agencies: user.agencies });
    }

    const active = this.activeAgency(user, headers);
    if (active === false) return this.json(route, 403, { error: ERR.agencyNotAllowed });
    const role = user.user.role;

    const agencyShifts = path.match(/^\/api\/agencies\/([^/]+)\/shifts$/);
    if (agencyShifts) {
      const agencyId = agencyShifts[1]!;
      const override = this.shiftsStatus[agencyId];
      if (override) return this.json(route, override.status, override.body);
      // Members of that agency (acting for it) or a network admin; everyone else gets the generic 403.
      const allowed = role === "admin" || (role === "agency" && active === agencyId);
      if (!allowed) return this.json(route, 403, { error: ERR.forbidden });
      return this.json(route, 200, { agencyId, shifts: this.shifts.filter((s) => s.agencyId === agencyId) });
    }

    if (path === "/api/shifts" && method === "GET") {
      const sp = url.searchParams;
      const filtered = (list: readonly MockShift[]) =>
        list.filter((x) => (!sp.get("status") || x.status === sp.get("status")) && (!sp.get("role") || x.role === sp.get("role")) && (!sp.get("date") || x.date === sp.get("date")) && (!sp.get("agencyId") || x.agencyId === sp.get("agencyId")));
      if (sp.get("matchable") !== "true") return this.json(route, 200, { shifts: filtered(this.shifts) });
      if (role !== "nurse") return this.json(route, 403, { error: ERR.forbidden });
      const eligible = !SEED_CREDENTIALS[user.user.id]?.expired || (this.uploads[user.user.id]?.length ?? 0) > 0;
      return this.json(route, 200, { shifts: eligible ? filtered(this.shifts.filter((x) => x.status === "open" && x.role === "RN")) : [] });
    }

    if (path === "/api/shifts" && method === "POST") {
      if (role !== "agency" || !active) return this.json(route, 403, { error: ERR.forbidden });
      const body = req.postDataJSON() as Pick<MockShift, "role" | "date" | "startTime" | "endTime">;
      const shift: MockShift = { id: `shift-${this.shifts.length + 1}`, agencyId: active, agencyName: AGENCY_NAMES[active]!, role: body.role, date: body.date, startTime: body.startTime, endTime: body.endTime, status: "open", claimedBy: null };
      this.shifts.push(shift);
      return this.json(route, 201, shift);
    }

    const action = path.match(/^\/api\/shifts\/([^/]+)\/(claim|cancel|withdraw)$/);
    if (action && method === "POST") {
      const shift = this.shifts.find((s) => s.id === action[1]);
      if (!shift) return this.json(route, 404, { error: ERR.shiftNotFound });
      const verb = action[2];
      if (verb === "claim") {
        if (role !== "nurse") return this.json(route, 403, { error: ERR.forbidden });
        if (SEED_CREDENTIALS[user.user.id]?.expired && !this.uploads[user.user.id]?.length) return this.json(route, 403, { error: ERR.credentialExpired });
        if (shift.status !== "open") return this.json(route, 409, { error: ERR.shiftNotOpen });
        Object.assign(shift, { status: "filled", claimedBy: user.user.id });
        return this.json(route, 200, shift);
      }
      if (verb === "cancel") {
        const { reason } = req.postDataJSON() as { reason: "advance" | "no-show" };
        const mayCancel = role === "admin" || (role === "nurse" && shift.claimedBy === user.user.id && reason === "advance") || (role === "agency" && active === shift.agencyId);
        if (!mayCancel) return this.json(route, 403, { error: ERR.forbidden });
        if (shift.status !== "filled" || !shift.claimedBy) return this.json(route, 409, { error: ERR.shiftNotFilled });
        const previousNurseId = shift.claimedBy;
        Object.assign(shift, { status: "open", claimedBy: null });
        return this.json(route, 200, { ...shift, cancellation: { reason, previousNurseId } });
      }
      if (role !== "agency" || active !== shift.agencyId) return this.json(route, 403, { error: ERR.forbidden });
      if (shift.status !== "open") return this.json(route, 409, { error: ERR.shiftNotOpen });
      shift.status = "cancelled";
      return this.json(route, 200, shift);
    }

    if (path === "/api/nurses/me/shifts") {
      if (role !== "nurse") return this.json(route, 403, { error: ERR.forbidden });
      return this.json(route, 200, { shifts: this.shifts.filter((s) => s.claimedBy === user.user.id && (s.status === "filled" || s.status === "completed")) });
    }

    if (path === "/api/nurses/me/credentials") {
      if (role !== "nurse") return this.json(route, 403, { error: ERR.forbidden });
      if (method === "POST") {
        const body = req.postData() ?? "";
        const expiresOn = /name="expiresOn"\r\n\r\n(\d{4}-\d{2}-\d{2})/.exec(body)?.[1] ?? null;
        const entry = { id: `cred-up-${++this.counter}`, expiresOn, uploadedAt: new Date().toISOString() };
        (this.uploads[user.user.id] ??= []).push(entry);
        const credential = this.credentialsOf(user.user.id).credentials.find((c) => c.id === entry.id);
        return this.json(route, 201, { credential });
      }
      return this.json(route, 200, this.credentialsOf(user.user.id));
    }

    const withNurse = (x: MockShift) => ({ ...x, claimedByName: x.claimedBy ? (NURSES[x.claimedBy]?.name ?? null) : null });
    const matchesQ = (x: MockShift, q: string, withAgency: boolean) => {
      const n = q.toLowerCase();
      return x.id.toLowerCase().includes(n) || (withNurse(x).claimedByName ?? "").toLowerCase().includes(n) || (withAgency && x.agencyName.toLowerCase().includes(n));
    };

    const agencyCoverage = path.match(/^\/api\/agencies\/([^/]+)\/coverage$/);
    if (agencyCoverage) {
      const agencyId = agencyCoverage[1]!;
      const override = this.shiftsStatus[agencyId];
      if (override) return this.json(route, override.status, override.body);
      const allowed = role === "admin" || (role === "agency" && active === agencyId);
      if (!allowed) return this.json(route, 403, { error: ERR.forbidden });
      const sp = url.searchParams;
      const rows = this.shifts
        .filter((x) => x.agencyId === agencyId)
        .filter((x) => (!sp.get("status") || x.status === sp.get("status")) && (!sp.get("role") || x.role === sp.get("role")) && (!sp.get("date") || x.date === sp.get("date")))
        .filter((x) => !sp.get("q") || matchesQ(x, sp.get("q")!, false));
      return this.json(route, 200, { agencyId, shifts: rows.map(withNurse) });
    }

    if (path === "/api/admin/coverage") {
      if (role !== "admin") return this.json(route, 403, { error: ERR.forbidden });
      const sp = url.searchParams;
      const base = this.shifts.filter((x) => (!sp.get("agencyId") || x.agencyId === sp.get("agencyId")) && (!sp.get("q") || matchesQ(x, sp.get("q")!, true)));
      const statusCounts = { open: 0, filled: 0, cancelled: 0, completed: 0 };
      for (const x of base) statusCounts[x.status]++;
      const matching = base.filter((x) => !sp.get("status") || x.status === sp.get("status"));
      const sign = sp.get("sort") === "desc" ? -1 : 1;
      const num = (id: string) => Number(id.replace(/\D/g, ""));
      matching.sort((a, b) => sign * (`${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`) || num(a.id) - num(b.id)));
      const page = Number(sp.get("page") ?? 1);
      const pageSize = Number(sp.get("pageSize") ?? 25);
      return this.json(route, 200, { shifts: matching.slice((page - 1) * pageSize, page * pageSize).map(withNurse), page, pageSize, total: matching.length, statusCounts });
    }

    if (path === "/api/admin/users") {
      if (role !== "admin") return this.json(route, 403, { error: ERR.forbidden });
      const type = url.searchParams.get("type");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const items =
        type === "nurse"
          ? Object.entries(NURSES).map(([id, n]) => ({ id, type: "nurse" as const, name: n.name, email: n.email, licenseType: n.licenseType }))
          : Object.entries(AGENCY_NAMES).map(([id, name]) => ({ id, type: "agency" as const, name, email: AGENCY_DETAILS[id]!.email, licenseType: null }));
      return this.json(route, 200, { items: items.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.email ?? "").toLowerCase().includes(q)), nextCursor: null });
    }

    const nurseDetail = (id: string) => {
      const n = NURSES[id];
      return n ? { id, name: n.name, email: n.email, licenseType: n.licenseType, credentials: this.credentialsOf(id).credentials } : null;
    };

    const adminNurse = path.match(/^\/api\/admin\/nurses\/([^/]+)$/);
    if (adminNurse) {
      if (role !== "admin") return this.json(route, 403, { error: ERR.forbidden });
      const d = nurseDetail(adminNurse[1]!);
      return d ? this.json(route, 200, d) : this.json(route, 404, { error: ERR.notFound });
    }

    const adminAgency = path.match(/^\/api\/admin\/agencies\/([^/]+)$/);
    if (adminAgency) {
      if (role !== "admin") return this.json(route, 403, { error: ERR.forbidden });
      const id = adminAgency[1]!;
      const det = AGENCY_DETAILS[id];
      if (!det) return this.json(route, 404, { error: ERR.notFound });
      const shiftCounts = { open: 0, filled: 0, cancelled: 0, completed: 0 };
      for (const x of this.shifts.filter((y) => y.agencyId === id)) shiftCounts[x.status]++;
      return this.json(route, 200, { id, name: AGENCY_NAMES[id], email: det.email, phone: det.phone, city: det.city, state: det.state, status: "active", members: det.members, shiftCounts });
    }

    const shiftNurse = path.match(/^\/api\/shifts\/([^/]+)\/nurse$/);
    if (shiftNurse) {
      const x = this.shifts.find((y) => y.id === shiftNurse[1]);
      if (!x) return this.json(route, 404, { error: ERR.notFound });
      const allowed = role === "admin" || (role === "agency" && active === x.agencyId);
      if (!allowed) return this.json(route, 403, { error: ERR.forbidden });
      const d = x.claimedBy ? nurseDetail(x.claimedBy) : null;
      return d ? this.json(route, 200, d) : this.json(route, 404, { error: ERR.notFound });
    }

    // Signed link: points back at the mock origin (a data: URL would be blocked by navigation rules). Scope check is the API's job.
    const download = path.match(/^\/api\/credentials\/([^/]+)\/download-url$/);
    if (download && method === "GET") {
      const known = Object.keys(NURSES).some((n) => this.credentialsOf(n).credentials.some((c) => c.id === download[1] && c.hasFile));
      if (!known) return this.json(route, 404, { error: ERR.notFound });
      return this.json(route, 200, { url: `${url.origin}/mock-r2/${download[1]}?X-Amz-Expires=300`, expiresAt: new Date(Date.now() + 300_000).toISOString() });
    }

    const review = path.match(/^\/api\/credentials\/([^/]+)\/review$/);
    if (review && method === "PATCH") {
      if (role !== "admin") return this.json(route, 403, { error: ERR.forbidden });
      const owner = Object.keys(NURSES).find((n) => this.credentialsOf(n).credentials.some((c) => c.id === review[1]));
      if (!owner) return this.json(route, 404, { error: ERR.notFound });
      const { status } = req.postDataJSON() as { status: "verified" | "rejected" };
      this.reviewed[review[1]!] = status;
      return this.json(route, 200, { credential: this.credentialsOf(owner).credentials.find((c) => c.id === review[1]) });
    }

    if (path === "/api/audit-logs") {
      if (role !== "admin") return this.json(route, 403, { error: ERR.forbidden });
      const agencyId = url.searchParams.get("agencyId");
      const all = this.auditItems().filter((e) => !agencyId || e.agencyId === agencyId);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const cursor = url.searchParams.get("cursor");
      const start = cursor ? all.findIndex((e) => e.id === cursor) + 1 : 0;
      const items = all.slice(start, start + limit);
      const nextCursor = start + limit < all.length ? items.at(-1)!.id : null;
      return this.json(route, 200, { items, nextCursor });
    }

    return this.json(route, 404, { error: "Not found" });
  }
}
