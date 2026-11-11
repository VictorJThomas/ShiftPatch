import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { MockApi, type MockTimesheet } from "./mock-api";

let api: MockApi;
test.beforeEach(async ({ page }) => {
  api = await MockApi.install(page);
});

// Mocked API (page.route). Seed shifts are in the past, so shift-2 (filled by nurse-1) has started.
const submitted: MockTimesheet = { id: "ts_seed", shiftId: "shift-2", nurseId: "nurse-1", clockIn: "07:00", clockOut: "19:30", breakMinutes: 30, note: null, status: "submitted", reviewNote: null };

test("nurse submits hours for a started shift and sees the Submitted chip", async ({ page }) => {
  await signIn(page, "nurse");
  await page.goto("/nurse/my-shifts");
  await page.getByRole("button", { name: /^Submit hours:/ }).click();
  const hours = page.getByRole("dialog", { name: "Submit your hours" });
  await expect(hours.getByLabel(/Clock in/)).toHaveValue("07:00"); // prefilled with the scheduled times
  await expect(hours.getByLabel(/Clock out/)).toHaveValue("19:00");
  await hours.getByLabel(/Unpaid break/).fill("30");
  await hours.getByRole("button", { name: "Submit hours" }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Submit hours:/ })).toHaveCount(0);
  expect(api.calls("/api/shifts/shift-2/timesheet", "POST")).toHaveLength(1);
  expect(api.timesheets[0]).toMatchObject({ clockIn: "07:00", clockOut: "19:00", breakMinutes: 30, status: "submitted" });
});

test("nurse with a disputed timesheet sees the reason and can resubmit", async ({ page }) => {
  api.timesheets.push({ ...submitted, status: "disputed", reviewNote: "Break was longer" });
  await signIn(page, "nurse");
  await page.goto("/nurse/my-shifts");
  await expect(page.getByText("Reason: Break was longer")).toBeVisible();
  await page.getByRole("button", { name: /^Resubmit hours:/ }).click();
  const hours = page.getByRole("dialog", { name: "Resubmit your hours" });
  await expect(hours.getByLabel(/Clock in/)).toHaveValue("07:00");
  await expect(hours.getByLabel(/Clock out/)).toHaveValue("19:00"); // the scheduled time, not the disputed 19:30
  await expect(hours.getByText("You submitted 07:00 → 19:30, 30 min break.")).toBeVisible();
  await expect(hours.getByText(/Scheduled: 07:00 → 19:00 · 12 h/)).toBeVisible();
  await hours.getByLabel(/Unpaid break/).fill("60");
  await hours.getByRole("button", { name: "Resubmit hours" }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  expect(api.timesheets[0]).toMatchObject({ status: "submitted", breakMinutes: 60, reviewNote: null });
});

test("agency disputes hours with a required reason; the shift stays filled", async ({ page }) => {
  api.timesheets.push({ ...submitted });
  await signIn(page, "agency");
  await page.getByRole("link", { name: "Timesheets" }).first().click();
  await expect(page).toHaveURL(/\/agency\/timesheets$/);
  await expect(page.getByText("Maria Lopez")).toBeVisible();
  await page.getByRole("button", { name: /^Dispute hours/ }).click();
  const dispute = page.getByRole("dialog", { name: "Dispute these hours?" });
  await dispute.getByRole("button", { name: "Dispute hours" }).click();
  await expect(dispute.getByText("A reason is required")).toBeVisible();
  await dispute.getByLabel(/Reason/).fill("Break was longer");
  await dispute.getByRole("button", { name: "Dispute hours" }).click();
  await expect(page.getByText("Reason: Break was longer")).toBeVisible();
  expect(api.shifts.find((s) => s.id === "shift-2")?.status).toBe("filled");
});

test("agency approve completes the shift", async ({ page }) => {
  api.timesheets.push({ ...submitted });
  await signIn(page, "agency");
  await page.goto("/agency/timesheets");
  await page.getByRole("button", { name: /^Approve hours/ }).click();
  await expect(page.getByRole("button", { name: /^Approve hours/ })).toHaveCount(0);
  expect(api.shifts.find((s) => s.id === "shift-2")?.status).toBe("completed");
});

test("admin timesheet table lists the network's timesheets with a status filter", async ({ page }) => {
  api.timesheets.push({ ...submitted, status: "approved" });
  await signIn(page, "admin");
  await page.goto("/admin/timesheets");
  const table = page.getByTestId("timesheet-table");
  await expect(table.getByText("Maria Lopez")).toBeVisible();
  await expect(table.getByText("Approved")).toBeVisible();
  await page.getByRole("button", { name: "Disputed" }).click();
  await expect(table.getByText("No timesheets with this status")).toBeVisible();
  expect(api.requests.some((r) => r.path === "/api/timesheets" && r.search === "?status=disputed")).toBe(true);
});
