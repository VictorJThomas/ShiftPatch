import { expect, test } from "@playwright/test";
import { banner, HOME, roleCookie, signIn } from "./helpers";
import { MockApi, USERS, type UserKey } from "./mock-api";

let api: MockApi;
test.beforeEach(async ({ page }) => {
  api = await MockApi.install(page);
});

test.describe("login", () => {
  const cases: [UserKey, string][] = [
    ["nurse", "Available shifts"],
    ["agency", "Shifts"],
    ["admin", "Coverage"],
  ];
  for (const [key, heading] of cases) {
    test(`${key} signs in and lands on ${HOME[USERS[key].user.role]}`, async ({ page }) => {
      await signIn(page, key);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      expect((await roleCookie(page))?.value).toBe(USERS[key].user.role);
      // /api/me runs after login so agencies are known before the shell renders.
      expect(api.calls("/api/me")).toHaveLength(1);
    });
  }

  test("never puts the access token in browser storage", async ({ page }) => {
    await signIn(page, "multi");
    const dump = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(dump).not.toContain("tok-");
    for (const key of Object.keys(JSON.parse(dump) as object)) expect(key).toBe("sp.activeAgencyId");
  });

  test("invalid credentials show the server message in the notification banner", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-email-input").fill(USERS.nurse.email);
    await page.getByTestId("login-password-input").fill("wrong-password");
    await page.getByTestId("login-submit-button").click();
    await expect(banner(page)).toHaveText(/Invalid email or password/);
    await expect(banner(page).getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId("login-submit-button")).toBeEnabled();
    expect(await roleCookie(page)).toBeUndefined();
  });

  test("rate-limit text is shown verbatim and the banner persists until dismissed", async ({ page }) => {
    api.loginOverride = { status: 429, body: { error: "Too many requests, try again later" } };
    await page.goto("/login");
    await page.getByTestId("login-email-input").fill(USERS.nurse.email);
    await page.getByTestId("login-password-input").fill("x");
    await page.getByTestId("login-submit-button").click();
    await expect(banner(page)).toHaveText(/Too many requests, try again later/);
    await page.waitForTimeout(5600); // errors do not auto-dismiss
    await expect(banner(page)).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner(page)).toHaveCount(0);
  });

  test("validates inline before calling the API", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-submit-button").click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
    await expect(page.getByTestId("login-email-input")).toHaveAttribute("aria-invalid", "true");
    expect(api.calls("/api/auth/login")).toHaveLength(0);
  });

  test("show/hide password", async ({ page }) => {
    await page.goto("/login");
    const input = page.getByTestId("login-password-input");
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).click();
    await expect(input).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(input).toHaveAttribute("type", "password");
  });
});

test.describe("session restore", () => {
  test("reload keeps the session: refresh cookie -> token -> /api/me, one refresh call", async ({ page }) => {
    await signIn(page, "nurse");
    const refreshBefore = api.calls("/api/auth/refresh").length;
    const meBefore = api.calls("/api/me").length;
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Available shifts" })).toBeVisible();
    await expect(page).toHaveURL(/\/nurse\/shifts$/);
    expect(api.calls("/api/auth/refresh").length - refreshBefore).toBe(1);
    expect(api.calls("/api/me").length - meBefore).toBe(1);
  });

  test("a stale role cookie without a live session ends on /login and is cleared", async ({ page, context }) => {
    await context.addCookies([{ name: "sp_role", value: "nurse", url: "http://localhost:3100" }]);
    await page.goto("/nurse/shifts"); // proxy lets it through (cookie only), the client restore then fails
    await expect(page).toHaveURL(/\/login$/);
    expect(await roleCookie(page)).toBeUndefined();
  });

  test("opening /login while signed in goes straight to the role home", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
});

test.describe("route guards", () => {
  test("nurse visiting /admin/dashboard is sent to the nurse home", async ({ page }) => {
    await signIn(page, "nurse");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/nurse\/shifts$/);
  });

  test("admin visiting /agency/shifts is sent to the admin home", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/agency/shifts");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test("anonymous visitors are sent to /login, and / follows the role", async ({ page }) => {
    await page.goto("/agency/shifts");
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "agency");
    await page.goto("/");
    await expect(page).toHaveURL(/\/agency\/shifts$/);
  });

  test("a forged role cookie only opens an empty shell: the client guard bounces it", async ({ page, context }) => {
    await signIn(page, "nurse");
    await context.addCookies([{ name: "sp_role", value: "admin", url: "http://localhost:3100" }]);
    await page.goto("/admin/dashboard"); // the proxy trusts the cookie, the session role says nurse
    await expect(page).toHaveURL(/\/nurse\/shifts$/);
    expect(api.calls("/api/me").length).toBeGreaterThan(0);
  });
});

test.describe("logout", () => {
  test("nurse profile -> Sign out clears the session and blocks the area", async ({ page }) => {
    await signIn(page, "nurse");
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(api.calls("/api/auth/logout", "POST")).toHaveLength(1);
    expect(await roleCookie(page)).toBeUndefined();
    await page.goto("/nurse/shifts");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("still signs out locally when the logout request fails", async ({ page }) => {
    await signIn(page, "admin");
    api.logoutStatus = 500;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await roleCookie(page)).toBeUndefined();
  });

  test("agency header sign-out", async ({ page }) => {
    await signIn(page, "agency");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("access-token expiry", () => {
  test("401 -> one refresh -> the original request is retried and succeeds", async ({ page }) => {
    await signIn(page, "agency");
    await expect(page.getByTestId("agency-shift-count")).toHaveText(/1 shift/);
    const refreshBase = api.calls("/api/auth/refresh").length;
    const shiftsBase = api.calls("/api/agencies/agency-a/shifts").length;

    api.expireTokens();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByTestId("agency-shift-count")).toBeVisible();
    await expect.poll(() => api.calls("/api/auth/refresh").length - refreshBase).toBe(1);
    // original (401) + retry (200)
    await expect.poll(() => api.calls("/api/agencies/agency-a/shifts").length - shiftsBase).toBe(2);
    await expect(page).toHaveURL(/\/agency\/shifts$/);
  });

  test("a lost refresh race (409) is retried once and the session survives", async ({ page }) => {
    await signIn(page, "agency");
    const refreshBase = api.calls("/api/auth/refresh").length;
    api.expireTokens();
    api.raceNext = 1;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect.poll(() => api.calls("/api/agencies/agency-a/shifts").filter((r) => r.headers.authorization === "Bearer tok-2").length).toBe(1);
    expect(api.calls("/api/auth/refresh").length - refreshBase).toBe(2); // 409, then the retry succeeded
    await expect(page).toHaveURL(/\/agency\/shifts$/);
  });

  test("concurrent 401s share ONE refresh call", async ({ page }) => {
    await signIn(page, "agency");
    await expect(page.getByTestId("agency-shift-count")).toBeVisible();
    const refreshBase = api.calls("/api/auth/refresh").length;
    api.expireTokens();
    api.unauthorizedDelayMs = 250;
    api.refreshDelayMs = 500;
    const button = page.getByRole("button", { name: "Refresh" });
    // A second click restarts the query: two requests with the stale token are in flight at once.
    await button.click();
    await button.click();
    // both stale requests are replayed with the single new token
    await expect.poll(() => api.calls("/api/agencies/agency-a/shifts").filter((r) => r.headers.authorization === "Bearer tok-2").length).toBeGreaterThanOrEqual(2);
    expect(api.calls("/api/agencies/agency-a/shifts").filter((r) => r.headers.authorization === "Bearer tok-1").length).toBeGreaterThanOrEqual(3);
    expect(api.calls("/api/auth/refresh").length - refreshBase).toBe(1);
  });

  test("refresh failure clears the session and goes to /login", async ({ page }) => {
    await signIn(page, "agency");
    await expect(page.getByTestId("agency-shift-count")).toBeVisible();
    api.expireTokens();
    api.refreshFails = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await roleCookie(page)).toBeUndefined();
    await page.goto("/agency/shifts");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("no retry loop: a request that 401s even with a fresh token ends the session", async ({ page }) => {
    await signIn(page, "agency");
    await expect(page.getByTestId("agency-shift-count")).toBeVisible();
    const shiftsBase = api.calls("/api/agencies/agency-a/shifts").length;
    api.rejectAllTokens = true; // refresh succeeds, but every API call keeps answering 401
    api.refreshesIssued = 0;
    api.refreshBudget = 1; // after the one legitimate refresh the fake session is gone (the /login visit must not re-auth)
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.waitForTimeout(500); // a loop would keep calling
    expect(api.refreshesIssued).toBe(1); // one refresh for the failed request, nothing after
    expect(api.calls("/api/agencies/agency-a/shifts").length - shiftsBase).toBe(2); // original + exactly one retry
    expect(await roleCookie(page)).toBeUndefined();
  });
});
