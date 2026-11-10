import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { MockApi } from "./mock-api";

// The 15 required test IDs (docs/original/ShiftPatch-Technical-Spec.md, "Required test IDs"), checked per role against
// the mocked spec seed: present, on the right kind of element, and not duplicated where the spec means "one".

let api: MockApi;
test.beforeEach(async ({ page }) => {
  api = await MockApi.install(page);
});

const tagOf = (l: Locator) => l.evaluate((e) => e.tagName.toLowerCase());
const attr = (l: Locator, name: string) => l.getAttribute(name);
const nav = (page: Page, href: string) => page.locator(`a[href="${href}"]:visible`).first().click();

test("login: email, password and submit", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByTestId("login-email-input");
  const password = page.getByTestId("login-password-input");
  const submit = page.getByTestId("login-submit-button");
  await expect(email).toHaveCount(1);
  await expect(password).toHaveCount(1);
  await expect(submit).toHaveCount(1);
  expect(await tagOf(email)).toBe("input");
  expect(await attr(email, "type")).toBe("email");
  expect(await tagOf(password)).toBe("input");
  expect(await attr(password, "type")).toBe("password");
  expect(await tagOf(submit)).toBe("button");
  expect(await attr(submit, "type")).toBe("submit");
});

test("nurse: one shift-list-item per open shift, each with exactly one claim button; claim success banner", async ({ page }) => {
  await signIn(page, "nurse");
  const items = page.getByTestId("shift-list-item");
  await expect(items).toHaveCount(2); // seed: shift-1 (Sunrise RN) and shift-3 (Metro RN) are open
  for (const item of await items.all()) {
    await expect(item.getByTestId("shift-claim-button")).toHaveCount(1);
    expect(await tagOf(item.getByTestId("shift-claim-button"))).toBe("button");
  }

  await items.filter({ hasText: "Sunrise" }).getByTestId("shift-claim-button").click(); // one click performs the claim
  const banner = page.getByTestId("notification-banner");
  await expect(banner).toHaveCount(1);
  await expect(banner).toContainText("Shift claimed");
  await expect(page.getByRole("status").filter({ hasText: "Success: Shift claimed" })).toBeAttached(); // polite live region
  expect(api.calls("/api/shifts/shift-1/claim", "POST")).toHaveLength(1);
  await expect(items).toHaveCount(1);
});

test("nurse: shift-cancel-button cancels a claimed shift in one click", async ({ page }) => {
  await signIn(page, "nurse");
  await nav(page, "/nurse/my-shifts");
  const cancel = page.getByTestId("shift-cancel-button");
  await expect(cancel).toHaveCount(1); // seed: shift-2 is filled by nurse-1
  expect(await tagOf(cancel)).toBe("button");
  await cancel.click();
  await expect(page.getByTestId("notification-banner")).toContainText("Shift cancelled");
  expect(api.calls("/api/shifts/shift-2/cancel", "POST")).toHaveLength(1);
  await expect(cancel).toHaveCount(0);
});

test("nurse-2: the 403 reaches notification-banner with the exact spec text, as an alert", async ({ page }) => {
  await signIn(page, "nurse2");
  await expect(page.getByText("Your license has expired.")).toBeVisible();
  await page.getByTestId("shift-list-item").first().getByTestId("shift-claim-button").click();
  const banner = page.getByTestId("notification-banner");
  await expect(banner).toHaveCount(1);
  await expect(banner.getByRole("alert")).toHaveText("Credential expired, cannot claim shift");
  await expect(page.getByTestId("shift-list-item")).toHaveCount(2); // still open
});

test("nurse: credential upload input (file) and expiry input (date) on the upload form", async ({ page }) => {
  await signIn(page, "nurse");
  await nav(page, "/nurse/credentials");
  // The overview has no form: the inputs live only on the dedicated screen.
  await expect(page.getByRole("link", { name: "Add credential" }).first()).toBeVisible();
  await expect(page.getByTestId("credential-upload-input")).toHaveCount(0);
  await expect(page.getByTestId("credential-expiry-date-input")).toHaveCount(0);
  await page.getByRole("link", { name: "Add credential" }).first().click();
  await expect(page).toHaveURL(/\/nurse\/credentials\/new/);
  const file = page.getByTestId("credential-upload-input");
  const expiry = page.getByTestId("credential-expiry-date-input");
  await expect(file).toHaveCount(1); // once each
  await expect(expiry).toHaveCount(1);
  expect(await attr(file, "type")).toBe("file");
  expect(await attr(expiry, "type")).toBe("date");

  await file.setInputFiles({ name: "license.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await expiry.fill("2028-01-01");
  await expect(page.getByLabel("Credential type")).toBeVisible();
  await page.getByRole("button", { name: "Add credential" }).click();
  await expect(page.getByTestId("notification-banner")).toContainText("Credential submitted");
  await expect(page).toHaveURL(/\/nurse\/credentials$/);
  await expect(page.locator("article").filter({ hasText: /pending/i })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /On file · 2/ })).toBeVisible();
});

test("agency: post button opens the form, submit button posts", async ({ page }) => {
  await signIn(page, "agency");
  const open = page.getByTestId("agency-post-shift-button");
  await expect(open).toHaveCount(1);
  expect(await tagOf(open)).toBe("button");
  await expect(page.getByTestId("agency-post-shift-submit-button")).toHaveCount(0); // the form is not open yet
  await open.click();
  const submit = page.getByTestId("agency-post-shift-submit-button");
  await expect(submit).toHaveCount(1);
  expect(await attr(submit, "type")).toBe("submit");
  const dlg = page.getByRole("dialog");
  await dlg.getByText("RN", { exact: true }).first().click();
  await dlg.getByLabel("Date").fill("2026-12-01");
  await dlg.getByLabel("Start time").fill("07:00");
  await dlg.getByLabel("End time").fill("19:00");
  await submit.click();
  await expect(page.getByTestId("notification-banner")).toContainText("Shift posted");
  expect(api.calls("/api/shifts", "POST")).toHaveLength(1);
  await expect(page.getByTestId("agency-shift-count")).toHaveText(/3 shifts/);
});

test("admin: shift table with one status badge per row, audit log table, timesheet table", async ({ page }) => {
  await signIn(page, "admin");
  const table = page.getByTestId("admin-dashboard-shift-table");
  await expect(table).toHaveCount(1);
  expect(await tagOf(table)).toBe("table");
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) await expect(row.getByTestId("admin-shift-status-badge")).toHaveCount(1);
  await expect(page.getByTestId("admin-shift-status-badge")).toHaveText(["Open", "Filled", "Open"]);

  await nav(page, "/admin/audit");
  const audit = page.getByTestId("audit-log-table");
  await expect(audit).toHaveCount(1);
  expect(await tagOf(audit)).toBe("table");
  await expect(audit.locator("tbody tr")).toHaveCount(12);

  await nav(page, "/admin/timesheets");
  const ts = page.getByTestId("timesheet-table");
  await expect(ts).toHaveCount(1);
  expect(await tagOf(ts)).toBe("table");
});

test("admin: audit log pages with Load more and filters by agency", async ({ page }) => {
  api.auditCount = 60;
  await signIn(page, "admin");
  await nav(page, "/admin/audit");
  const rows = page.getByTestId("audit-log-table").locator("tbody tr");
  await expect(rows).toHaveCount(50);
  await page.getByRole("button", { name: /Load more/ }).click();
  await expect(rows).toHaveCount(60);
  await expect(page.getByRole("button", { name: /Load more/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Agency").selectOption({ label: "Metro Care Partners" });
  await expect.poll(() => api.requests.some((r) => r.path === "/api/audit-logs" && r.search.includes("agencyId=agency-b"))).toBe(true);
  await expect(rows).toHaveCount(15); // every 4th entry is a login (no agency); half of the rest are agency-b
});

test("nurse grid: 1 / 2 / 3 columns at 390 / 768 / 1440", async ({ page }) => {
  for (const id of ["shift-4", "shift-5"]) api.shifts.push({ id, agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-12-01", startTime: "07:00", endTime: "19:00", status: "open", claimedBy: null });
  await signIn(page, "nurse");
  await expect(page.getByTestId("shift-list-item")).toHaveCount(4);
  const columns = () => page.locator(".card-grid > li").evaluateAll((lis) => new Set(lis.map((li) => Math.round(li.getBoundingClientRect().left))).size);
  for (const [width, cols] of [[390, 1], [768, 2], [1440, 3]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(columns).toBe(cols);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  }
});
