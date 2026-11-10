import "@/lib/zod-csp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session";
import { useToastStore } from "@/stores/toasts";
import type { Shift, TimesheetRow } from "@shiftpatch/contracts";
import { MyShifts } from "@/features/nurse/MyShifts";
import { formatWorked, hasStarted } from "./format";
import { TimesheetList } from "./TimesheetList";

vi.mock("@/lib/api-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-client")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/x" }));

beforeAll(() => {
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

const TS: TimesheetRow = {
  id: "ts_1", shiftId: "shift-2", shiftDate: "2026-10-03", role: "LPN", startTime: "07:00", endTime: "19:00", agencyId: "agency-a", agencyName: "Sunrise Health Staffing",
  nurseId: "nurse-1", nurseName: "Maria Lopez", clockIn: "07:00", clockOut: "19:30", breakMinutes: 30, workedMinutes: 720, note: "Covered the ER", status: "submitted",
  submittedAt: "2026-10-03T20:00:00.000Z", reviewedAt: null, reviewNote: null,
};
const PAST_SHIFT: Shift = { id: "shift-2", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "LPN", date: "2020-01-03", startTime: "07:00", endTime: "19:00", status: "filled", claimedBy: "nurse-1" };
const FUTURE_SHIFT: Shift = { ...PAST_SHIFT, id: "shift-9", date: "2099-01-03" };

let routes: Record<string, unknown>;
function serve(next: Record<string, unknown>) {
  routes = next;
  api.mockImplementation(async (path, opts) => {
    const key = `${opts?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`unexpected ${key}`);
    const h = routes[key];
    return typeof h === "function" ? (h as (o: unknown) => unknown)(opts) : h;
  });
}
const posts = () => api.mock.calls.filter(([, o]) => o?.method === "POST");

let qc: QueryClient;
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState({ user: { id: "agency-1", name: "Sam", role: "agency" }, activeAgencyId: "agency-a" });
});
afterEach(() => {
  cleanup();
  act(() => useToastStore.getState().clear());
});

describe("format helpers", () => {
  it("formatWorked", () => {
    expect([formatWorked(450), formatWorked(45), formatWorked(480), formatWorked(1)]).toEqual(["7 h 30 min", "45 min", "8 h", "1 min"]);
  });
  it("hasStarted compares date + start with the viewer's clock", () => {
    const now = new Date(2026, 9, 10, 7, 30);
    expect(hasStarted({ date: "2026-10-10", startTime: "07:00" }, now)).toBe(true);
    expect(hasStarted({ date: "2026-10-10", startTime: "07:30" }, now)).toBe(true);
    expect(hasStarted({ date: "2026-10-10", startTime: "07:31" }, now)).toBe(false);
    expect(hasStarted({ date: "2026-10-11", startTime: "00:00" }, now)).toBe(false);
  });
});

describe("TimesheetList (agency / admin)", () => {
  it("shows rows with worked time and the nurse's note; filter chips ask the API with ?status=", async () => {
    serve({ "GET /api/timesheets": { timesheets: [TS] }, "GET /api/timesheets?status=approved": { timesheets: [] } });
    wrap(<TimesheetList canReview tableTestId="timesheet-table" />);
    const table = await screen.findByTestId("timesheet-table");
    expect(await within(table).findByText("Maria Lopez")).toBeTruthy();
    expect(within(table).getByText("07:00 → 19:30")).toBeTruthy();
    expect(within(table).getByText("12 h")).toBeTruthy();
    expect(within(table).getByText("Covered the ER")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(await within(table).findByText("No timesheets with this status")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/timesheets?status=approved", expect.anything());
  });

  it("approve posts to /approve and invalidates shift + timesheet queries", async () => {
    serve({ "GET /api/timesheets": { timesheets: [TS] }, "POST /api/timesheets/ts_1/approve": { ...TS, status: "approved", reviewedAt: "2026-10-04T10:00:00.000Z" } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    wrap(<TimesheetList canReview />);
    fireEvent.click(await screen.findByRole("button", { name: /^Approve hours/ }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Hours approved"));
    expect(posts()).toHaveLength(1);
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(["shifts"]), JSON.stringify(["nurse", "timesheets"]), JSON.stringify(["admin"]), JSON.stringify(["agency"])]));
  });

  it("dispute needs a reason (validated client side), then posts it and closes", async () => {
    serve({ "GET /api/timesheets": { timesheets: [TS] }, "POST /api/timesheets/ts_1/dispute": { ...TS, status: "disputed", reviewNote: "Break was longer" } });
    wrap(<TimesheetList canReview />);
    fireEvent.click(await screen.findByRole("button", { name: /^Dispute hours/ }));
    const dlg = await screen.findByRole("dialog", { name: "Dispute these hours?" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Dispute hours" }));
    expect(await within(dlg).findByText("A reason is required")).toBeTruthy();
    expect(posts()).toHaveLength(0);
    fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: "  Break was longer  " } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Dispute hours" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(api).toHaveBeenCalledWith("/api/timesheets/ts_1/dispute", expect.objectContaining({ method: "POST", body: { reason: "Break was longer" } }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Dispute these hours?" })).toBeNull());
  });

  it("a server error on dispute keeps the dialog open and toasts the API message", async () => {
    serve({
      "GET /api/timesheets": { timesheets: [TS] },
      "POST /api/timesheets/ts_1/dispute": () => {
        throw new ApiError(409, "Timesheet is not awaiting review");
      },
    });
    wrap(<TimesheetList canReview />);
    fireEvent.click(await screen.findByRole("button", { name: /^Dispute hours/ }));
    const dlg = await screen.findByRole("dialog", { name: "Dispute these hours?" });
    fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: "Off" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Dispute hours" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Timesheet is not awaiting review")).toBe(true));
    expect(screen.getByRole("dialog", { name: "Dispute these hours?" })).toBeTruthy();
  });

  it("read-only for a viewer: no Actions column, no buttons", async () => {
    serve({ "GET /api/timesheets": { timesheets: [TS] } });
    wrap(<TimesheetList canReview={false} />);
    expect(await screen.findByText("Maria Lopez")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve hours|Dispute hours/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Actions" })).toBeNull();
  });

  it("only submitted rows get actions; a disputed row shows the reason", async () => {
    serve({ "GET /api/timesheets": { timesheets: [{ ...TS, status: "disputed", reviewNote: "Break was longer", reviewedAt: "2026-10-04T10:00:00.000Z" }] } });
    wrap(<TimesheetList canReview />);
    expect(await screen.findByText("Break was longer")).toBeTruthy();
    expect(screen.getAllByText("Disputed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Approve hours|Dispute hours/ })).toBeNull();
  });
});

describe("Nurse: My shifts submit hours", () => {
  const myShifts = (shift: Shift, timesheets: TimesheetRow[], extra: Record<string, unknown> = {}) =>
    serve({ "GET /api/nurses/me/shifts": { shifts: [shift] }, "GET /api/nurses/me/timesheets": { timesheets }, ...extra });

  it("offers Submit hours only once the shift has started", async () => {
    myShifts(FUTURE_SHIFT, []);
    wrap(<MyShifts />);
    await screen.findByTestId("shift-cancel-button");
    expect(screen.queryByRole("button", { name: /Submit hours/ })).toBeNull();
    cleanup();
    qc.clear();
    myShifts(PAST_SHIFT, []);
    wrap(<MyShifts />);
    expect(await screen.findByRole("button", { name: /^Submit hours:/ })).toBeTruthy();
  });

  it("the dialog prefills the scheduled times, shows the worked time live and posts the body", async () => {
    myShifts(PAST_SHIFT, [], { "POST /api/shifts/shift-2/timesheet": { ...TS, shiftDate: "2020-01-03" } });
    wrap(<MyShifts />);
    fireEvent.click(await screen.findByRole("button", { name: /^Submit hours:/ }));
    const dlg = await screen.findByRole("dialog", { name: "Submit your hours" });
    expect((within(dlg).getByLabelText(/Clock in/) as HTMLInputElement).value).toBe("07:00");
    expect((within(dlg).getByLabelText(/Clock out/) as HTMLInputElement).value).toBe("19:00");
    expect(within(dlg).getByText(/Worked: 12 h/)).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText(/Unpaid break/), { target: { value: "30" } });
    fireEvent.change(within(dlg).getByLabelText(/Note/), { target: { value: "Covered the ER" } });
    expect(within(dlg).getByText(/Worked: 11 h 30 min/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Submit hours" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(api).toHaveBeenCalledWith(
      "/api/shifts/shift-2/timesheet",
      expect.objectContaining({ method: "POST", body: { clockIn: "07:00", clockOut: "19:00", breakMinutes: 30, note: "Covered the ER" } }),
    );
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Hours submitted"));
  });

  it("validates before posting: zero worked time and a break over 240 show the API's messages", async () => {
    myShifts(PAST_SHIFT, []);
    wrap(<MyShifts />);
    fireEvent.click(await screen.findByRole("button", { name: /^Submit hours:/ }));
    const dlg = await screen.findByRole("dialog", { name: "Submit your hours" });
    fireEvent.change(within(dlg).getByLabelText(/Clock out/), { target: { value: "07:00" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Submit hours" }));
    expect(await within(dlg).findByText("Worked time must be more than 0 minutes and at most 16 hours")).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText(/Clock out/), { target: { value: "19:00" } });
    fireEvent.change(within(dlg).getByLabelText(/Unpaid break/), { target: { value: "241" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Submit hours" }));
    expect(await within(dlg).findByText("Break must be between 0 and 240 minutes")).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it("shows the status chip: Submitted hides the button, Disputed shows the reason and Resubmit prefilled", async () => {
    myShifts(PAST_SHIFT, [TS]);
    wrap(<MyShifts />);
    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Submit hours|Resubmit hours/ })).toBeNull();
    cleanup();
    qc.clear();
    myShifts(PAST_SHIFT, [{ ...TS, status: "disputed", reviewNote: "Break was longer", reviewedAt: "2026-10-04T10:00:00.000Z" }]);
    wrap(<MyShifts />);
    expect(await screen.findByText("Disputed")).toBeTruthy();
    expect(screen.getByText("Break was longer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Resubmit hours:/ }));
    const dlg = await screen.findByRole("dialog", { name: "Resubmit your hours" });
    expect((within(dlg).getByLabelText(/Clock out/) as HTMLInputElement).value).toBe("19:30"); // the previous values, not the schedule
    expect((within(dlg).getByLabelText(/Unpaid break/) as HTMLInputElement).value).toBe("30");
  });
});
