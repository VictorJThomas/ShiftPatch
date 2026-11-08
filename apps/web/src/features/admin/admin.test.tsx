import "@/lib/zod-csp";
import type { AuditLogEntry, Shift } from "@shiftpatch/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { AdminDashboard } from "./AdminDashboard";
import { AuditLog } from "./AuditLog";
import { auditParams, fillRate, filterShifts, formatChanges, NO_AUDIT_FILTERS, NO_FILTERS, paginate, sortByDate } from "./model";
import { Timesheets } from "./Timesheets";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
const fetchMock = vi.mocked(apiFetch);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

// The exact spec seed (3 shifts, 2 agencies).
const SEED: Shift[] = [
  { id: "shift-1", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null },
  { id: "shift-2", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "LPN", date: "2026-10-03", startTime: "07:00", endTime: "19:00", status: "filled", claimedBy: "nurse-1" },
  { id: "shift-3", agencyId: "agency-b", agencyName: "Metro Care Partners", role: "RN", date: "2026-10-04", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null },
];
const many = (n: number): Shift[] =>
  Array.from({ length: n }, (_, i) => ({ ...SEED[0]!, id: `s-${String(i).padStart(2, "0")}`, date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}` }));

const entry = (id: number, over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: String(id), occurredAt: "2026-10-01T16:40:00.000Z", actorUserId: "nurse-1", actorRole: "nurse", networkId: "network-default",
  agencyId: "agency-a", action: "shift.claimed", entityType: "shift", entityId: `shift-${id}`, changes: { status: ["open", "filled"] }, requestId: "r", ...over,
});

let shifts: Shift[] = SEED;
let auditPages: Record<string, { items: AuditLogEntry[]; nextCursor: string | null }> = {};

beforeEach(() => {
  shifts = SEED;
  auditPages = {};
  fetchMock.mockImplementation(async (path: string) => {
    if (path === "/api/shifts") return { shifts };
    if (path.startsWith("/api/audit-logs")) {
      const cursor = new URL(path, "http://x").searchParams.get("cursor") ?? "first";
      return auditPages[cursor] ?? { items: [], nextCursor: null };
    }
    throw new Error(`unexpected ${path}`);
  });
});

function renderWith(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
const auditCalls = () => fetchMock.mock.calls.map(([p]) => p as string).filter((p) => p.startsWith("/api/audit-logs"));

describe("model", () => {
  it("fill rate is filled / (open + filled), null when nothing is staffable", () => {
    expect(fillRate({ open: 2, filled: 1 })).toBe(33);
    expect(fillRate({ open: 0, filled: 0 })).toBeNull();
  });

  it("filters by agency, status and search (id, agency, nurse id)", () => {
    expect(filterShifts(SEED, { ...NO_FILTERS, agencyId: "agency-b" }).map((s) => s.id)).toEqual(["shift-3"]);
    expect(filterShifts(SEED, { ...NO_FILTERS, status: "filled" }).map((s) => s.id)).toEqual(["shift-2"]);
    expect(filterShifts(SEED, { ...NO_FILTERS, search: "NURSE-1" }).map((s) => s.id)).toEqual(["shift-2"]);
    expect(filterShifts(SEED, { ...NO_FILTERS, search: "metro" }).map((s) => s.id)).toEqual(["shift-3"]);
  });

  it("sorts by date and paginates 25 per page with clamped pages", () => {
    expect(sortByDate(SEED, "desc").map((s) => s.id)).toEqual(["shift-3", "shift-2", "shift-1"]);
    const p = paginate(many(30), 2);
    expect([p.page, p.pages, p.from, p.to, p.total, p.items.length]).toEqual([2, 2, 26, 30, 30, 5]);
    expect(paginate([], 3)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0 });
  });

  it("audit params: filters map to query params, dates become ISO instants, inverted range is not sent", () => {
    const p = auditParams({ action: "shift.claimed", entityType: "shift", agencyId: "agency-a", from: "2026-10-01", to: "2026-10-02" });
    expect(p.get("limit")).toBe("50");
    expect(p.get("action")).toBe("shift.claimed");
    expect(p.get("agencyId")).toBe("agency-a");
    expect(new Date(p.get("from")!).getHours()).toBe(0);
    expect(new Date(p.get("to")!).getHours()).toBe(23);
    const bad = auditParams({ ...NO_AUDIT_FILTERS, from: "2026-10-05", to: "2026-10-01" });
    expect(bad.has("from") || bad.has("to")).toBe(false);
  });

  it("formats changes as field: before → after", () => {
    expect(formatChanges({ status: ["open", "filled"], claimedBy: [null, "nurse-1"], reason: "advance" })).toEqual([
      "status: open → filled", "claimedBy: — → nurse-1", "reason: advance",
    ]);
    expect(formatChanges(null)).toEqual([]);
  });
});

describe("admin dashboard", () => {
  it("renders the shift table with a status badge on every row", async () => {
    renderWith(<AdminDashboard />);
    const table = await screen.findByTestId("admin-dashboard-shift-table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(within(row).getByTestId("admin-shift-status-badge")).toBeTruthy();
    expect(screen.getAllByTestId("admin-shift-status-badge").map((b) => b.textContent)).toEqual(["Open", "Filled", "Open"]);
    expect(screen.getByRole("heading", { level: 1, name: "Coverage" })).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy(); // fill rate tile: 1 of 3
  });

  it("polls GET /api/shifts every 15 s under the [admin, shifts] key, foreground only", async () => {
    const client = renderWith(<AdminDashboard />);
    await screen.findByTestId("admin-dashboard-shift-table");
    const query = client.getQueryCache().find({ queryKey: ["admin", "shifts"] })!;
    const observer = query.observers[0]!;
    expect(observer.options.refetchInterval).toBe(15_000);
    expect(observer.options.refetchIntervalInBackground).toBe(false);
    expect(screen.getByText(/refreshes every 15 s/)).toBeTruthy();
  });

  it("status chips (with counts), agency select and search filter the table", async () => {
    renderWith(<AdminDashboard />);
    await screen.findByTestId("admin-dashboard-shift-table");
    fireEvent.click(screen.getByRole("button", { name: "Filled 1" }));
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "All 3" }));
    fireEvent.change(screen.getByLabelText("Agency"), { target: { value: "agency-b" } });
    expect(within(screen.getByTestId("admin-dashboard-shift-table")).getByText("shift-3")).toBeTruthy();
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "no-such-thing" } });
    expect(screen.getByText("No shifts match")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(3);
  });

  it("paginates 25 per page with Prev / Next", async () => {
    shifts = many(30);
    renderWith(<AdminDashboard />);
    await screen.findByTestId("admin-dashboard-shift-table");
    expect(screen.getByText("1–25 of 30 shifts")).toBeTruthy();
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(25);
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("26–30 of 30 shifts")).toBeTruthy();
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(5);
  });

  it("a failed refresh keeps the last data visible with an inline warning", async () => {
    renderWith(<AdminDashboard />);
    await screen.findByTestId("admin-dashboard-shift-table");
    fetchMock.mockRejectedValue(new Error("API down"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Live updates paused")).toBeTruthy();
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Retry now" })).toBeTruthy();
  });

  it("shows an error with Retry when the first load fails", async () => {
    fetchMock.mockRejectedValue(new Error("API down"));
    renderWith(<AdminDashboard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("API down")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("audit log", () => {
  it("renders rows from the API (QA-004: never the empty state when items exist)", async () => {
    auditPages.first = { items: [entry(3), entry(2, { action: "shift.created", actorUserId: "agency-a", actorRole: "agency" })], nextCursor: null };
    renderWith(<AuditLog />);
    const table = await screen.findByTestId("audit-log-table");
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(3));
    expect(within(table).getByText("Claimed shift")).toBeTruthy();
    expect(within(table).getByText("shift.created")).toBeTruthy();
    expect(within(table).getAllByText("status: open → filled")).toHaveLength(2);
    expect(screen.queryByText("No audit entries yet")).toBeNull();
    expect(screen.getByText(/Showing 2 entries/)).toBeTruthy();
  });

  it("Load more appends the next page using nextCursor", async () => {
    auditPages.first = { items: [entry(3), entry(2)], nextCursor: "c2" };
    auditPages.c2 = { items: [entry(1)], nextCursor: null };
    renderWith(<AuditLog />);
    await screen.findByText(/Showing 2 entries/);
    fireEvent.click(screen.getByRole("button", { name: "Load more entries" }));
    await screen.findByText(/Showing 3 entries/);
    expect(auditCalls().some((p) => p.includes("cursor=c2"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Load more entries" })).toBeNull();
  });

  it("the agency filter sends agencyId= and starts over", async () => {
    renderWith(<AuditLog />);
    await screen.findByTestId("audit-log-table");
    await waitFor(() => expect(screen.getByRole("option", { name: "Metro Care Partners" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Agency"), { target: { value: "agency-b" } });
    await waitFor(() => expect(auditCalls().some((p) => p.includes("agencyId=agency-b"))).toBe(true));
    expect(auditCalls().every((p) => p.includes("limit=50"))).toBe(true);
    expect(await screen.findByText("No entries match these filters")).toBeTruthy();
  });

  it("shows the empty state only when the API returns 0 items", async () => {
    renderWith(<AuditLog />);
    expect(await screen.findByText("No audit entries yet")).toBeTruthy();
    expect(screen.getByTestId("audit-log-table")).toBeTruthy();
  });
});

describe("timesheets", () => {
  it("renders the timesheet table with its header and an empty row (no timesheet backend yet)", async () => {
    renderWith(<Timesheets />);
    const table = screen.getByTestId("timesheet-table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Nurse", "Shift", "Date", "Scheduled hours", "Clocked hours", "Status",
    ]);
    expect(await within(table).findByText("No timesheets yet")).toBeTruthy();
  });

  it("lists completed shifts with scheduled hours and no invented clock times", async () => {
    shifts = [...SEED, { ...SEED[1]!, id: "shift-9", status: "completed" }];
    renderWith(<Timesheets />);
    const table = screen.getByTestId("timesheet-table");
    expect(await within(table).findByText("shift-9")).toBeTruthy();
    expect(within(table).getByText("12 h")).toBeTruthy();
  });
});
