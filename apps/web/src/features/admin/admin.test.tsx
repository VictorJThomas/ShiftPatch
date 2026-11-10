import "@/lib/zod-csp";
import type { AuditLogEntry, CoverageRow, Shift, TimesheetRow } from "@shiftpatch/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session";
import { useToastStore } from "@/stores/toasts";
import { AdminDashboard } from "./AdminDashboard";
import { AdminUsers } from "./AdminUsers";
import { AuditLog } from "./AuditLog";
import { auditParams, coverageParams, fillRate, formatChanges, NO_AUDIT_FILTERS, paginate, sortByDate } from "./model";
import { Timesheets } from "./Timesheets";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
const fetchMock = vi.mocked(apiFetch);

beforeAll(() => {
  // Radix Popper (FilterDropdown) needs ResizeObserver; jsdom has none.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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

const TS: TimesheetRow = {
  id: "ts_1", shiftId: "shift-2", shiftDate: "2026-10-03", role: "LPN", startTime: "07:00", endTime: "19:00", agencyId: "agency-a", agencyName: "Sunrise Health Staffing",
  nurseId: "nurse-1", nurseName: "Nora Nurse", clockIn: "07:00", clockOut: "19:30", breakMinutes: 30, workedMinutes: 720, note: null, status: "submitted",
  submittedAt: "2026-10-03T20:00:00.000Z", reviewedAt: null, reviewNote: null,
};

const NURSE = {
  id: "nurse-1", name: "Nora Nurse", email: "nora@example.com", licenseType: "LPN",
  credentials: [{ id: "c1", type: "license", licenseType: "LPN", status: "verified", expiresOn: "2027-01-01", screenedOn: null, uploadedAt: "2026-10-01T10:00:00.000Z", expired: false, hasFile: true }],
};
const NAMES: Record<string, string> = { "nurse-1": "Nora Nurse" };
const withName = (s: Shift): CoverageRow => ({ ...s, claimedByName: s.claimedBy ? (NAMES[s.claimedBy] ?? s.claimedBy) : null });

/** Server stand-in: filters like GET /api/admin/coverage (agency, q on agency/nurse name/id, status, page). */
function coverage(path: string) {
  const p = new URL(path, "http://x").searchParams;
  const q = (p.get("q") ?? "").toLowerCase();
  const base = shifts.map(withName).filter((s) => (!p.get("agencyId") || s.agencyId === p.get("agencyId")) && (!q || [s.id, s.agencyName, s.claimedByName ?? ""].some((v) => v.toLowerCase().includes(q))));
  const statusCounts = { open: 0, filled: 0, cancelled: 0, completed: 0 };
  for (const s of base) statusCounts[s.status]++;
  const rows = base.filter((s) => !p.get("status") || s.status === p.get("status"));
  const size = Number(p.get("pageSize") ?? 25);
  const page = Number(p.get("page") ?? 1);
  return { shifts: rows.slice((page - 1) * size, page * size), page, pageSize: size, total: rows.length, statusCounts };
}
const coverageCalls = () => fetchMock.mock.calls.map(([p]) => p as string).filter((p) => p.startsWith("/api/admin/coverage"));

let shifts: Shift[] = SEED;
let timesheets: TimesheetRow[] = [];
let auditPages: Record<string, { items: AuditLogEntry[]; nextCursor: string | null }> = {};

beforeEach(() => {
  shifts = SEED;
  timesheets = [];
  auditPages = {};
  fetchMock.mockImplementation(async (path: string) => {
    if (path === "/api/shifts") return { shifts };
    if (path.startsWith("/api/timesheets")) return { timesheets };
    if (path.startsWith("/api/admin/coverage")) return coverage(path);
    if (path === "/api/shifts/shift-2/nurse") return NURSE;
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
/** Opens the FilterDropdown panel (trigger name is "Filters" or "Filters, n active"). */
const openFilters = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  return screen.findByRole("dialog", { name: "Filters" });
};
const auditCalls = () => fetchMock.mock.calls.map(([p]) => p as string).filter((p) => p.startsWith("/api/audit-logs"));

describe("model", () => {
  it("fill rate is filled / (open + filled), null when nothing is staffable", () => {
    expect(fillRate({ open: 2, filled: 1 })).toBe(33);
    expect(fillRate({ open: 0, filled: 0 })).toBeNull();
  });

  it("coverage params: all/empty filters are left out, the rest is sent trimmed", () => {
    expect(coverageParams({ status: "all", agencyId: "all", q: "  ", page: 1 }).toString()).toBe("page=1&pageSize=25");
    const p = coverageParams({ status: "filled", agencyId: "agency-b", q: " nora ", page: 2 });
    expect([p.get("status"), p.get("agencyId"), p.get("q"), p.get("page")]).toEqual(["filled", "agency-b", "nora", "2"]);
    expect(coverageParams({ status: "all", agencyId: "all", q: "", page: 1, sort: "desc" }).get("sort")).toBe("desc");
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
    await screen.findAllByTestId("admin-shift-status-badge");
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

  it("status chips use server counts and every filter re-requests with params", async () => {
    renderWith(<AdminDashboard />);
    await screen.findAllByTestId("admin-shift-status-badge");
    const panel = await openFilters();
    fireEvent.click(within(panel).getByRole("button", { name: "Filled 1" }));
    await waitFor(() => expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(1));
    expect(coverageCalls().some((p) => p.includes("status=filled"))).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "All 3" }));
    fireEvent.change(within(panel).getByLabelText("Agency"), { target: { value: "agency-b" } });
    await waitFor(() => expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(1));
    expect(within(screen.getByTestId("admin-dashboard-shift-table")).getByText("shift-3")).toBeTruthy();
    expect(coverageCalls().some((p) => p.includes("agencyId=agency-b"))).toBe(true);
  });

  it("search by nurse name is debounced, sent as q=, and Claimed by shows the name", async () => {
    renderWith(<AdminDashboard />);
    await screen.findAllByTestId("admin-shift-status-badge");
    expect(screen.getByText("Nora Nurse")).toBeTruthy();
    expect(screen.queryByText("nurse-1")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Agency or nurse name"), { target: { value: "nora" } });
    await waitFor(() => expect(coverageCalls().some((p) => p.includes("q=nora"))).toBe(true));
    await waitFor(() => expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(1));
    fireEvent.change(screen.getByPlaceholderText("Agency or nurse name"), { target: { value: "no-such-thing" } });
    expect(await screen.findByText("No shifts match")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    await waitFor(() => expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(3));
  });

  it("filter dropdown shows the active count and Reset restores the defaults (page back to 1)", async () => {
    shifts = many(30);
    renderWith(<AdminDashboard />);
    await screen.findByText("1–25 of 30 shifts");
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("26–30 of 30 shifts");
    const panel = await openFilters();
    fireEvent.click(within(panel).getByRole("button", { name: /^Open/ }));
    await screen.findByText(/^1–25 of 30 shifts/); // changing a filter starts over at page 1
    expect(coverageCalls().at(-1)).toContain("page=1");
    expect(coverageCalls().at(-1)).toContain("status=open");
    fireEvent.change(within(panel).getByLabelText("Agency"), { target: { value: "agency-a" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeTruthy());
    expect(coverageCalls().at(-1)).toContain("agencyId=agency-a");
    fireEvent.click(within(panel).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy());
    await waitFor(() => expect(coverageCalls().at(-1)).not.toMatch(/status=|agencyId=/));
    expect((within(panel).getByLabelText("Agency") as HTMLSelectElement).value).toBe("all");
  });

  it("View details opens the shift with the nurse name and loads nurse details on demand", async () => {
    renderWith(<AdminDashboard />);
    await screen.findAllByTestId("admin-shift-status-badge");
    fireEvent.click(screen.getByRole("button", { name: "View details for shift shift-2" }));
    const dlg = await screen.findByRole("dialog", { name: "Shift details" });
    expect(within(dlg).getByText("Nora Nurse", { exact: false })).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: /View nurse details/ }));
    expect(await screen.findByText("nora@example.com")).toBeTruthy();
  });

  it("paginates 25 per page with Prev / Next (server pages)", async () => {
    shifts = many(30);
    renderWith(<AdminDashboard />);
    await screen.findByText("1–25 of 30 shifts");
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(25);
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("26–30 of 30 shifts");
    expect(coverageCalls().some((p) => p.includes("page=2"))).toBe(true);
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(5);
  });

  it("steps back a page when a refresh shrinks the results under the current page", async () => {
    shifts = many(30);
    const client = renderWith(<AdminDashboard />);
    await screen.findByText("1–25 of 30 shifts");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("26–30 of 30 shifts");
    shifts = many(5);
    await act(() => client.invalidateQueries({ queryKey: ["admin", "coverage"] })); // what the 15 s poll does
    expect(await screen.findByText("1–5 of 5 shifts")).toBeTruthy();
    expect(screen.getAllByTestId("admin-shift-status-badge")).toHaveLength(5);
  });

  it("a failed refresh keeps the last data visible with an inline warning", async () => {
    renderWith(<AdminDashboard />);
    await screen.findAllByTestId("admin-shift-status-badge");
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

describe("users", () => {
  const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
  const nurseRow = (id: string, name: string) => ({ id, type: "nurse", name, email: `${id}@x.com`, licenseType: "RN" });
  let credStatus = "pending";
  beforeEach(() => {
    credStatus = "pending";
    fetchMock.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path.startsWith("/api/admin/users")) {
        const p = new URL(path, "http://x").searchParams;
        if (p.get("type") === "agency") return page([{ id: "agency-a", type: "agency", name: "Sunrise Health Staffing", email: null, licenseType: null }]);
        if (p.get("q") === "zzz") return page([]);
        if (p.get("cursor") === "c2") return page([nurseRow("n3", "Third Nurse")]);
        return page([nurseRow("n1", "First Nurse"), nurseRow("n2", "Second Nurse")], "c2");
      }
      if (path === "/api/admin/nurses/n1") return { ...NURSE, id: "n1", name: "First Nurse", credentials: [{ ...NURSE.credentials[0]!, status: credStatus }] };
      if (path === "/api/admin/agencies/agency-a") {
        return { id: "agency-a", name: "Sunrise Health Staffing", email: "a@x.com", phone: null, city: "Austin", state: "TX", status: "active", members: [{ userId: "u1", name: "Amy Admin", email: "amy@x.com", role: "admin" }], shiftCounts: { open: 1, filled: 1, cancelled: 0, completed: 0 } };
      }
      if (path === "/api/credentials/c1/review") {
        credStatus = (opts!.body as { status: string }).status;
        return { credential: { ...NURSE.credentials[0]!, status: credStatus } };
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it("lists nurses, Load more follows the cursor, and the search shows an empty state", async () => {
    renderWith(<AdminUsers />);
    const table = await screen.findByTestId("admin-users-table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Load more nurses" }));
    await screen.findByText("Third Nurse");
    expect(screen.queryByRole("button", { name: "Load more nurses" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Name or email"), { target: { value: "zzz" } });
    expect(await screen.findByText("No nurses match")).toBeTruthy();
  });

  it("Agencies tab lists agencies and opens details with members", async () => {
    renderWith(<AdminUsers />);
    await screen.findByTestId("admin-users-table");
    fireEvent.click(screen.getByRole("button", { name: "Agencies" }));
    fireEvent.click(await screen.findByRole("button", { name: "View details for Sunrise Health Staffing" }));
    const dlg = await screen.findByRole("dialog", { name: "Agency details" });
    expect(await within(dlg).findByText("Amy Admin")).toBeTruthy();
    expect(within(dlg).getByText("Austin, TX")).toBeTruthy();
  });

  it("verifying a credential toasts its name and new status", async () => {
    renderWith(<AdminUsers />);
    fireEvent.click(await screen.findByRole("button", { name: "View details for First Nurse" }));
    fireEvent.click(await screen.findByRole("button", { name: "Verify Nursing license (LPN)" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.kind === "success" && t.title === "Nursing license (LPN) verified")).toBe(true));
    await waitFor(() => expect((screen.getByRole("button", { name: "Verify Nursing license (LPN)" }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("Reject asks for confirmation first; Go back sends nothing, Reject sends it and toasts", async () => {
    renderWith(<AdminUsers />);
    fireEvent.click(await screen.findByRole("button", { name: "View details for First Nurse" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reject Nursing license (LPN)" }));
    const confirm = await screen.findByRole("dialog", { name: "Reject Nursing license (LPN)?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Go back" }));
    expect(fetchMock.mock.calls.some(([p]) => p === "/api/credentials/c1/review")).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reject Nursing license (LPN)?" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Reject Nursing license (LPN)" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Reject Nursing license (LPN)?" })).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.kind === "success" && t.title === "Nursing license (LPN) rejected")).toBe(true));
  });

  it("shows an error with Retry when the list fails", async () => {
    fetchMock.mockRejectedValue(new Error("API down"));
    renderWith(<AdminUsers />);
    expect(await screen.findByText("API down")).toBeTruthy();
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
    const panel = await openFilters();
    await waitFor(() => expect(within(panel).getByRole("option", { name: "Metro Care Partners" })).toBeTruthy());
    fireEvent.change(within(panel).getByLabelText("Agency"), { target: { value: "agency-b" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters, 1 active" })).toBeTruthy());
    await waitFor(() => expect(auditCalls().some((p) => p.includes("agencyId=agency-b"))).toBe(true));
    expect(auditCalls().every((p) => p.includes("limit=50"))).toBe(true);
    expect(await screen.findByText("No entries match these filters")).toBeTruthy();
  });

  it("every filter maps to params, counts as active, and Reset clears them all", async () => {
    renderWith(<AuditLog />);
    await screen.findByTestId("audit-log-table");
    const panel = await openFilters();
    fireEvent.change(within(panel).getByLabelText("Action"), { target: { value: "shift.claimed" } });
    fireEvent.change(within(panel).getByLabelText("Item type"), { target: { value: "shift" } });
    fireEvent.change(within(panel).getByLabelText("From"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeTruthy());
    await waitFor(() => {
      const last = auditCalls().at(-1)!;
      for (const k of ["action=shift.claimed", "entityType=shift", "from="]) expect(last).toContain(k);
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy());
    await waitFor(() => expect(auditCalls().at(-1)).not.toMatch(/action=|entityType=|from=/));
  });

  it("Show all opens the full change list in a dialog", async () => {
    auditPages.first = { items: [entry(1, { changes: { a: [1, 2], b: [1, 2], c: [1, 2] } })], nextCursor: null };
    renderWith(<AuditLog />);
    fireEvent.click(await screen.findByRole("button", { name: /Show all changes/ }));
    const dlg = await screen.findByRole("dialog", { name: "All changes" });
    expect(dlg.textContent).toContain("c: 1 → 2");
  });

  it("shows the empty state only when the API returns 0 items", async () => {
    renderWith(<AuditLog />);
    expect(await screen.findByText("No audit entries yet")).toBeTruthy();
    expect(screen.getByTestId("audit-log-table")).toBeTruthy();
  });
});

describe("timesheets", () => {
  beforeEach(() => useSessionStore.setState({ user: { id: "admin-1", name: "Alex Kim", role: "admin" } }));

  it("renders the timesheet table with its header and an empty state when there are none", async () => {
    renderWith(<Timesheets />);
    const table = screen.getByTestId("timesheet-table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Nurse", "Shift", "Clocked", "Break", "Worked", "Status", "Note", "Actions",
    ]);
    expect(await within(table).findByText("No timesheets yet")).toBeTruthy();
  });

  it("lists the network's real timesheets from GET /api/timesheets with clock times and worked time", async () => {
    timesheets = [TS];
    renderWith(<Timesheets />);
    const table = screen.getByTestId("timesheet-table");
    expect(await within(table).findByText("Nora Nurse")).toBeTruthy();
    expect(within(table).getByText("07:00 → 19:30")).toBeTruthy();
    expect(within(table).getByText("12 h")).toBeTruthy();
    expect(within(table).getByText("Submitted")).toBeTruthy();
    expect(within(table).getByRole("button", { name: /^Approve hours/ })).toBeTruthy();
  });
});
