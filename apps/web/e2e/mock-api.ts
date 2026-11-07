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

export const USERS = {
  nurse: { email: "maria.lopez@example.com", password: "pw-nurse", user: { id: "nurse-1", name: "Maria Lopez", role: "nurse" }, agencies: [] },
  agency: { email: "scheduler@sunrise-health.example", password: "pw-agency", user: { id: "agency-user-1", name: "Sam Carter", role: "agency" }, agencies: [SUNRISE] },
  multi: { email: "ops@both.example", password: "pw-multi", user: { id: "agency-user-2", name: "Pat Ortiz", role: "agency" }, agencies: [SUNRISE, METRO] },
  admin: { email: "alex.kim@example.com", password: "pw-admin", user: { id: "admin-1", name: "Alex Kim", role: "admin" }, agencies: [] },
} satisfies Record<string, TestUser>;
export type UserKey = keyof typeof USERS;

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
}

/**
 * In-memory fake of the API surface the web app touches. Install it with `MockApi.install(page)`.
 * Tokens are opaque and single-generation: `expireTokens()` makes every issued token answer 401, like a 15-minute expiry.
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

  async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const headers = req.headers();
    this.requests.push({ method: req.method(), path, headers });

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
      return this.json(route, 200, { user: { ...user.user, email: user.email }, agencies: user.agencies });
    }

    const shifts = path.match(/^\/api\/agencies\/([^/]+)\/shifts$/);
    if (shifts) {
      const agencyId = shifts[1]!;
      const header = headers["x-agency-id"];
      const override = this.shiftsStatus[agencyId];
      if (override) return this.json(route, override.status, override.body);
      if (user.user.role !== "agency" || header !== agencyId || !user.agencies.some((a) => a.agencyId === agencyId)) {
        return this.json(route, 403, { error: "Forbidden" });
      }
      const count = agencyId === "agency-a" ? 1 : 2;
      return this.json(route, 200, {
        agencyId,
        shifts: Array.from({ length: count }, (_, i) => ({
          id: `shift-${agencyId}-${i}`,
          agencyId,
          agencyName: user.agencies.find((a) => a.agencyId === agencyId)!.name,
          role: "RN",
          date: "2026-10-02",
          startTime: "19:00",
          endTime: "07:00",
          status: "open",
          claimedBy: null,
        })),
      });
    }

    return this.json(route, 404, { error: "Not found" });
  }
}
