import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { MockApi, type MockShift } from "./mock-api";

// Server-driven tables: the admin coverage table (search, status chips, global sort, paging) and the agency board's
// claimant / details dialogs, against the mocked API (which honours the same query parameters as the real one).

let api: MockApi;
test.beforeEach(async ({ page }) => {
  api = await MockApi.install(page);
});

const extra = (n: number): MockShift[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `shift-${100 + i}`, agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "CNA", date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
    startTime: "07:00", endTime: "19:00", status: "open", claimedBy: null,
  }));

test("admin: search filters on the server, chip counts follow it, clearing restores every row", async ({ page }) => {
  await signIn(page, "admin");
  const rows = page.getByTestId("admin-dashboard-shift-table").locator("tbody tr");
  await expect(page.getByTestId("admin-shift-status-badge").first()).toBeVisible(); // skeleton first, rows after
  await expect(rows).toHaveCount(3);

  await page.getByRole("searchbox", { name: "Search shifts" }).fill("maria");
  await expect.poll(() => api.requests.some((r) => r.path === "/api/admin/coverage" && r.search.includes("q=maria"))).toBe(true);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Maria Lopez");
  await expect(rows.first().getByTestId("admin-shift-status-badge")).toHaveText("Filled");
  await expect(page.getByText("1–1 of 1 shifts")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(rows).toHaveCount(3);
});

test("admin: the date sort is global (sent to the API) and survives paging", async ({ page }) => {
  api.shifts.push(...extra(30)); // 33 shifts: two pages of 25
  await signIn(page, "admin");
  const rows = page.getByTestId("admin-dashboard-shift-table").locator("tbody tr");
  await expect(page.getByTestId("admin-shift-status-badge").first()).toBeVisible();
  await expect(rows).toHaveCount(25);
  await expect(page.getByText("1–25 of 33 shifts")).toBeVisible();
  await expect(rows.first().locator(".adm-id")).toHaveText("shift-1"); // earliest first: the seed shifts (October) lead
  expect(api.requests.filter((r) => r.path === "/api/admin/coverage").every((r) => !r.search.includes("sort=desc"))).toBe(true);

  await page.getByRole("button", { name: /Date \/ time/ }).click();
  await expect.poll(() => api.requests.some((r) => r.path === "/api/admin/coverage" && r.search.includes("sort=desc"))).toBe(true);
  await expect(page.getByRole("columnheader", { name: /Date \/ time/ })).toHaveAttribute("aria-sort", "descending");
  // latest first across ALL pages: page 1 now starts with the newest Nov shift, never a seed row
  await expect(rows.first()).toContainText(/Nov 2[0-9]/);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("26–33 of 33 shifts")).toBeVisible();
  await expect(rows).toHaveCount(8);
  await expect(rows.last().locator(".adm-id")).toHaveText("shift-1"); // the oldest seed shift lands last overall
});

test("agency: shift details open from the Details button; the claimant name opens the nurse dialog; no raw ids on the board", async ({ page }) => {
  await signIn(page, "agency");
  await expect(page.getByTestId("agency-shift-count")).toHaveText(/2 shifts/);
  const claimant = page.getByRole("button", { name: "Maria Lopez, view nurse details" }).first();
  await expect(claimant).toBeVisible();
  await expect(page.locator("#main").getByText("nurse-1", { exact: true })).toHaveCount(0);
  await expect(page.locator("#main").getByText("agency-a", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /^Details, RN · / }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await claimant.click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("Maria Lopez");
  await expect(dlg).toContainText("maria.lopez@example.com");
  expect(api.calls("/api/shifts/shift-2/nurse", "GET")).toHaveLength(1);
});
