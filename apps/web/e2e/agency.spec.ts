import { expect, test } from "@playwright/test";
import { banner, signIn } from "./helpers";
import { MockApi } from "./mock-api";

let api: MockApi;
test.beforeEach(async ({ page }) => {
  api = await MockApi.install(page);
});

const shiftCalls = (id: string) => api.calls(`/api/agencies/${id}/shifts`);

test("single-agency users get X-Agency-Id and no switcher", async ({ page }) => {
  await signIn(page, "agency");
  await expect(page.getByTestId("active-agency-name")).toHaveText("Sunrise Health Staffing");
  await expect(page.getByRole("button", { name: /switch agency/i })).toHaveCount(0);
  await expect(page.getByTestId("agency-shift-count")).toHaveText(/2 shifts/);
  expect(shiftCalls("agency-a")[0]?.headers["x-agency-id"]).toBe("agency-a");
  // /api/me never carries the header
  expect(api.calls("/api/me")[0]?.headers["x-agency-id"]).toBeUndefined();
});

test("nurse and admin never send X-Agency-Id", async ({ page }) => {
  await signIn(page, "nurse");
  await page.evaluate(() => localStorage.setItem("sp.activeAgencyId", "agency-a")); // stale leftover
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Available shifts" })).toBeVisible();
  expect(api.requests.filter((r) => r.path !== "/api/auth/login").every((r) => r.headers["x-agency-id"] === undefined)).toBe(true);
});

test("multi-agency: prompt first, switching changes the header, the band and refetches", async ({ page }) => {
  await signIn(page, "multi");
  await expect(page.getByTestId("active-agency-name")).toHaveText("Select an agency");
  await expect(page.getByRole("heading", { name: "Select an agency" })).toBeVisible();
  expect(shiftCalls("agency-a")).toHaveLength(0); // nothing is requested without a selection

  const trigger = page.getByRole("button", { name: /switch agency/i });
  await trigger.click();
  await expect(page.getByRole("listbox", { name: /your agencies/i })).toBeVisible();
  await page.getByRole("option", { name: /Sunrise Health Staffing/ }).click();
  await expect(page.getByTestId("active-agency-name")).toHaveText("Sunrise Health Staffing");
  await expect(page.getByTestId("agency-shift-count")).toHaveText(/2 shifts/);
  expect(shiftCalls("agency-a")[0]?.headers["x-agency-id"]).toBe("agency-a");

  await trigger.click();
  await expect(page.getByRole("option", { name: /Sunrise Health Staffing/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: /Metro Care Partners/ }).click();
  await expect(page.getByTestId("active-agency-name")).toHaveText("Metro Care Partners");
  await expect(page.getByTestId("agency-shift-count")).toHaveText(/1 shift$/);
  expect(shiftCalls("agency-b")[0]?.headers["x-agency-id"]).toBe("agency-b");
  expect(shiftCalls("agency-b")).toHaveLength(1);

  // the selection survives a reload (the only persisted value) and the same header goes out again
  await page.reload();
  await expect(page.getByTestId("active-agency-name")).toHaveText("Metro Care Partners");
  await expect(page.getByTestId("agency-shift-count")).toHaveText(/1 shift$/);
  expect(await page.evaluate(() => localStorage.getItem("sp.activeAgencyId"))).toBe("agency-b");
});

test("Escape closes the switcher and returns focus to its button", async ({ page }) => {
  await signIn(page, "multi");
  const trigger = page.getByRole("button", { name: /switch agency/i });
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("a 403 for the selected agency drops the selection and shows the server error", async ({ page }) => {
  await signIn(page, "multi");
  await page.getByRole("button", { name: /switch agency/i }).click();
  await page.getByRole("option", { name: /Sunrise Health Staffing/ }).click();
  await expect(page.getByTestId("agency-shift-count")).toBeVisible();

  api.shiftsStatus["agency-b"] = { status: 403, body: { error: "Agency not available" } }; // membership revoked meanwhile
  await page.getByRole("button", { name: /switch agency/i }).click();
  await page.getByRole("option", { name: /Metro Care Partners/ }).click();

  await expect(banner(page)).toHaveText(/Agency not available/);
  await expect(banner(page).getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("active-agency-name")).toHaveText("Select an agency");
  expect(await page.evaluate(() => localStorage.getItem("sp.activeAgencyId"))).toBeNull();
  await expect(page).toHaveURL(/\/agency\/shifts$/); // a 403 is not a session problem: no logout
});

test("mobile layout: tab bar instead of header, switcher button spans the band", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "multi");
  await expect(page.locator(".ag-header")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Agency" })).toBeVisible();
  await expect(page.getByRole("button", { name: /switch agency/i })).toBeVisible();
});

test("cross-agency isolation: agency-b sees only its own seed shift; a foreign agency list is a 403 Forbidden", async ({ page }) => {
  await signIn(page, "agencyB");
  await expect(page.getByTestId("active-agency-name")).toHaveText("Metro Care Partners");
  await expect(page.getByTestId("agency-shift-count")).toHaveText(/1 shift$/);
  await expect(page.getByText("Sunrise Health Staffing")).toHaveCount(0);
  // Same answer as the real API: own header + foreign path = generic Forbidden (not "Agency not available").
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/agencies/agency-a/shifts", { headers: { "x-agency-id": "agency-b", authorization: "Bearer tok-1" } });
    return [r.status, await r.json()];
  });
  expect(res).toEqual([403, { error: "Forbidden" }]);
});
