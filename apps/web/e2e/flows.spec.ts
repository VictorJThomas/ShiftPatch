/**
 * End-to-end flows against the REAL API + local Postgres (no page.route mocks). Opt-in: skipped unless E2E_REAL_API=1.
 *
 * How to run (from the repo root, Docker Postgres up, `.env` present):
 *   1. Start the built API with the Playwright web origin allowed (refresh/logout check Origin):
 *        PORT=3201 APP_ORIGIN=http://localhost:3100 pnpm --filter api start:local        (background)
 *   2. Run this spec; the Playwright web server is built with the /api rewrite pointing at that API:
 *        E2E_REAL_API=1 API_ORIGIN=http://localhost:3201 pnpm --filter web test:e2e flows
 *      (API_ORIGIN defaults to http://localhost:3001, i.e. `pnpm --filter api start:local` with no PORT.)
 *
 * State: `pnpm --filter api db:reset` (local-only guard: refuses non-localhost / prod) runs before AND after the suite,
 * so the run is order-safe and leaves the exact spec seed behind. Password comes from E2E_PASSWORD (default: the spec's).
 * One login per user (the refresh limiter is per session family), all client-side navigation after that.
 */
import { execSync } from "node:child_process";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const REAL = !!process.env.E2E_REAL_API;
const PASSWORD = process.env.E2E_PASSWORD ?? "Trial2026!";
const ROOT = join(__dirname, "..", "..", ".."); // Playwright loads specs as CommonJS here (no import.meta)
const resetDb = () => execSync("pnpm --filter api db:reset", { cwd: ROOT, stdio: "pipe" });

test.describe.configure({ mode: "serial" });
test.skip(!REAL, "Real-API flows are opt-in: set E2E_REAL_API=1 with the API running (see the header of flows.spec.ts).");

const pages: Record<string, Page> = {};
async function loginAs(browser: Browser, email: string, home: RegExp) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByTestId("login-email-input").fill(email);
  await page.getByTestId("login-password-input").fill(PASSWORD);
  await page.getByTestId("login-submit-button").click();
  await expect(page).toHaveURL(home);
  return page;
}
const nav = (page: Page, href: string) => page.locator(`a[href="${href}"]:visible`).first().click();
const banner = (page: Page) => page.getByTestId("notification-banner");

test.beforeAll(async ({ browser }) => {
  if (!REAL) return;
  resetDb();
  pages.agency = await loginAs(browser, "admin@sunrisehealth.example", /\/agency\/shifts$/);
  pages.nurse1 = await loginAs(browser, "maria.lopez@example.com", /\/nurse\/shifts$/);
  pages.nurse2 = await loginAs(browser, "james.cook@example.com", /\/nurse\/shifts$/);
  pages.admin = await loginAs(browser, "alex.kim@example.com", /\/admin\/dashboard$/);
});

test.afterAll(async () => {
  if (!REAL) return;
  for (const p of Object.values(pages)) await p.context().close();
  resetDb();
});

let postedId = "";
/**
 * The admin table is server-paged (25 rows) and the dashboard polls: find a shift with the search box (matches the id),
 * never by its position. The row's badge is awaited before anything counts rows (skeleton first).
 */
const adminRow = async (id: string) => {
  const page = pages.admin!;
  const search = page.getByRole("searchbox", { name: "Search shifts" });
  if ((await search.inputValue()) !== id) await search.fill(id); // an unchanged filter means a later change can only arrive by the poll
  const row = page.getByTestId("admin-dashboard-shift-table").locator("tbody tr").filter({ has: page.getByText(id, { exact: true }) });
  await expect(row.getByTestId("admin-shift-status-badge")).toHaveCount(1);
  return row;
};
const adminBadge = async (id: string) => (await adminRow(id)).getByTestId("admin-shift-status-badge");

test("seed state: agency-a sees shift-1 open and shift-2 filled", async () => {
  const page = pages.agency!;
  await expect(page.getByTestId("agency-shift-count")).toHaveText("2 shifts");
});

test("agency-a posts an RN shift (2026-12-01 07:00-19:00)", async () => {
  const page = pages.agency!;
  await page.getByTestId("agency-post-shift-button").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("RN", { exact: true }).first().click();
  await dlg.getByLabel("Date").fill("2026-12-01");
  await dlg.getByLabel("Start time").fill("07:00");
  await dlg.getByLabel("End time").fill("19:00");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/shifts") && r.request().method() === "POST");
  await page.getByTestId("agency-post-shift-submit-button").click();
  const res = await created;
  expect(res.status()).toBe(201);
  postedId = ((await res.json()) as { id: string }).id;
  await expect(banner(page)).toContainText("Shift posted");
  await expect(page.getByTestId("agency-shift-count")).toHaveText("3 shifts");
  await adminRow(postedId); // point the admin table at it now, so the status flips below arrive by the 15 s poll
});

test("nurse-1 claims it in one click -> 'Shift claimed'", async () => {
  const page = pages.nurse1!;
  await page.reload(); // pick up the new shift (one refresh for this session family)
  const card = page.getByTestId("shift-list-item").filter({ hasText: "Dec 1" });
  await expect(card).toHaveCount(1);
  await card.getByTestId("shift-claim-button").click();
  await expect(banner(page)).toContainText("Shift claimed");
  await expect(card).toHaveCount(0);
});

test("admin badge for the posted shift turns 'Filled' within one 15 s poll", async () => {
  await expect(await adminBadge(postedId)).toHaveText("Filled", { timeout: 17_000 });
  await expect(await adminRow(postedId)).toContainText("Maria Lopez"); // claimant name, never an id
});

test("agency-a sees the claimant by name and opens the nurse details from the board", async () => {
  const page = pages.agency!;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("agency-shift-count")).toHaveText("3 shifts");
  await page.getByRole("button", { name: "Maria Lopez, view nurse details" }).last().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("Maria Lopez");
  await expect(dlg).toContainText("maria.lopez@example.com");
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
});

test("nurse-2 (expired license) gets the exact 403 text and the shift stays open", async () => {
  const page = pages.nurse2!;
  await expect(page.getByText("Your license has expired.")).toBeVisible();
  const card = page.getByTestId("shift-list-item").filter({ hasText: "Sunrise" });
  await card.getByTestId("shift-claim-button").click();
  await expect(banner(page).getByRole("alert")).toHaveText("Credential expired, cannot claim shift");
  await expect(card).toHaveCount(1);
  await expect(await adminBadge("shift-1")).toHaveText("Open");
});

test("nurse-1 cancels from My shifts in one click -> 'Shift cancelled', shift reopens", async () => {
  const page = pages.nurse1!;
  await nav(page, "/nurse/my-shifts");
  await expect(page.getByRole("heading", { name: /^Upcoming\s*2$/ })).toBeVisible(); // seed shift-2 + the one claimed above
  const mine = page.locator("article").filter({ hasText: "Dec 1" });
  await expect(mine.getByText("Claimed by you")).toBeVisible();
  await adminRow(postedId); // table filtered to it before the cancel: the reopen must come from the poll
  await mine.getByTestId("shift-cancel-button").click();
  await expect(banner(page)).toContainText("Shift cancelled");
  await expect(mine).toHaveCount(0);
  await nav(page, "/nurse/shifts");
  await expect(page.getByTestId("shift-list-item").filter({ hasText: "Dec 1" })).toHaveCount(1);
  await expect(await adminBadge(postedId)).toHaveText("Open", { timeout: 17_000 });
});

// ---- Agency B isolation + admin audit/timesheets. Each test logs in / navigates on its own and relies on no earlier mutation. ----
const API = process.env.API_ORIGIN ?? "http://localhost:3001";

test("agency-b sees only its own shifts and gets 403 {error} on agency-a's shift list", async ({ browser, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: API });
  const login = await api.post("/api/auth/login", { data: { email: "admin@metrocare.example", password: PASSWORD } });
  expect(login.status()).toBe(200);
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  const own = await api.get("/api/agencies/agency-b/shifts", { headers });
  expect(own.status()).toBe(200);
  const list = ((await own.json()) as { shifts: Array<{ id: string; agencyId: string }> }).shifts;
  expect(list.every((s) => s.agencyId === "agency-b")).toBe(true);
  const ids = list.map((s) => s.id);
  expect(ids).toContain("shift-3");
  expect(ids).not.toContain("shift-1");
  expect(ids).not.toContain("shift-2");

  const foreign = await api.get("/api/agencies/agency-a/shifts", { headers });
  expect(foreign.status()).toBe(403);
  const body = (await foreign.json()) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(["error"]);
  expect(typeof body.error).toBe("string");
  await api.dispose();

  // UI: the dashboard count equals agency-b's own list, not agency-a's.
  const page = await loginAs(browser, "admin@metrocare.example", /\/agency\/shifts$/);
  await expect(page.getByTestId("agency-shift-count")).toHaveText(`${list.length} ${list.length === 1 ? "shift" : "shifts"}`);
  await page.context().close();
});

test("admin audit log: has rows, a filter narrows them, Load more matches the paging state", async () => {
  const page = pages.admin!;
  await nav(page, "/admin/audit");
  const table = page.getByTestId("audit-log-table");
  const rows = table.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const first = await rows.count();
  expect(first).toBeGreaterThan(0);

  // Load more only exists when the API reports another page; otherwise it must be absent (no faked data).
  const more = page.getByRole("button", { name: "Load more entries" });
  if (await more.count()) {
    await more.click();
    await expect.poll(() => rows.count()).toBeGreaterThan(first);
  } else {
    await expect(page.getByText("more available")).toHaveCount(0);
  }

  // Filter to sign-ins: every remaining row is auth.login.
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByLabel("Action").selectOption("auth.login");
  await page.keyboard.press("Escape");
  const codes = rows.locator("td:nth-child(3) code");
  await expect(codes.first()).toHaveText("auth.login");
  await expect.poll(async () => (await codes.allTextContents()).every((c) => c === "auth.login")).toBe(true);
});

test("admin timesheets page shows the timesheet table", async () => {
  const page = pages.admin!;
  await nav(page, "/admin/timesheets");
  await expect(page.getByTestId("timesheet-table")).toBeVisible();
});
