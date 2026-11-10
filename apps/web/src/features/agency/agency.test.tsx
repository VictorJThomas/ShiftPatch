import "@/lib/zod-csp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverageRow } from "@shiftpatch/contracts";
import AgencyShiftsPage from "@/app/(agency)/agency/shifts/page";
import AgencyProfilePage from "@/app/(agency)/agency/profile/page";
import { agencyKey } from "@/lib/query-client";
import { useSessionStore, type AgencyMembership } from "@/stores/session";
import { useToastStore } from "@/stores/toasts";
import { AgencySwitcher } from "./agency-switcher";
import { useSwitchAgency } from "./queries";
import { echoLine } from "./post-shift-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/agency/shifts" }));

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

const SHIFT_1: CoverageRow = { id: "shift-1", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null, claimedByName: null };
const SHIFT_2: CoverageRow = { id: "shift-2", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "LPN", date: "2026-10-03", startTime: "07:00", endTime: "19:00", status: "filled", claimedBy: "nurse-1", claimedByName: "Maria Lopez" };
const SHIFT_3: CoverageRow = { id: "shift-3", agencyId: "agency-b", agencyName: "Metro Care Partners", role: "RN", date: "2026-10-04", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null, claimedByName: null };

const A: AgencyMembership = { agencyId: "agency-a", name: "Sunrise Health Staffing", role: "owner" };
const B: AgencyMembership = { agencyId: "agency-b", name: "Metro Care Partners", role: "manager" };

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}
let calls: Call[] = [];
/** Override per test: `[status, body]` for a "METHOD /path". */
let overrides: Record<string, [number, unknown]> = {};

const NURSE = {
  id: "nurse-1",
  name: "Maria Lopez",
  email: "maria@example.com",
  licenseType: "LPN",
  credentials: [{ id: "cred-1", type: "license", licenseType: "LPN", status: "verified", expiresOn: "2027-08-01", screenedOn: null, uploadedAt: "2026-01-01T00:00:00Z", expired: false, hasFile: true }],
};

/** Mutation responses use the plain Shift shape (strict), without the coverage-only name. */
const bare = (row: CoverageRow) => {
  const shift: Partial<CoverageRow> = { ...row };
  delete shift.claimedByName;
  return shift;
};

function routes(method: string, url: string): [number, unknown] {
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  const key = `${method} ${path}`;
  if (overrides[key]) return overrides[key];
  if (key === "GET /api/agencies/agency-a/coverage") {
    const rows = [SHIFT_1, SHIFT_2].filter((r) => (!params.get("status") || r.status === params.get("status")) && (!params.get("role") || r.role === params.get("role")) && (!params.get("date") || r.date === params.get("date")));
    return [200, { agencyId: "agency-a", shifts: rows }];
  }
  if (key === "GET /api/agencies/agency-b/coverage") return [200, { agencyId: "agency-b", shifts: [SHIFT_3] }];
  if (key === "GET /api/shifts/shift-2/nurse") return [200, NURSE];
  if (key === "POST /api/shifts/shift-1/withdraw") return [200, { ...bare(SHIFT_1), status: "cancelled" }];
  if (key === "POST /api/shifts/shift-2/cancel") return [200, { ...bare(SHIFT_2), status: "open", claimedBy: null, cancellation: { reason: "no-show", previousNurseId: "nurse-1" } }];
  return [404, { error: "Not found" }];
}

beforeEach(() => {
  calls = [];
  overrides = {};
  useToastStore.getState().clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const headers = (init.headers ?? {}) as Record<string, string>;
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: input, headers, body });
      const [status, json] = routes(method, input);
      return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function signIn(agencies: AgencyMembership[], active: string | null) {
  useSessionStore.getState().setSession({
    user: { id: "u-1", name: "Scheduler", role: "agency", email: "admin@sunrisehealth.example" },
    accessToken: "token",
    agencies,
    activeAgencyId: active,
  });
}

function renderWith(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

const toasts = () => useToastStore.getState().toasts.map((t) => `${t.kind}:${t.title}`);
const openFilters = () => {
  const btn = screen.getByRole("button", { name: /^Filters/ });
  if (btn.getAttribute("aria-expanded") !== "true") fireEvent.click(btn);
};
const posts = (path: string) => calls.filter((c) => c.method === "POST" && c.path === path);

describe("agency shifts dashboard", () => {
  it("loads the active agency's shifts with X-Agency-Id and shows table, stats and test IDs", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    const table = await screen.findByRole("table", { name: /Shifts posted by Sunrise Health Staffing/ });
    expect(calls[0]?.headers["X-Agency-Id"]).toBe("agency-a");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
    expect(screen.getByTestId("agency-shift-count").textContent).toBe("2 shifts");
    expect((screen.getByTestId("agency-post-shift-button") as HTMLButtonElement).disabled).toBe(false);
    // Cancel only on the filled row; withdraw only on the open one.
    expect(screen.getAllByTestId("agency-cancel-shift-button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Withdraw, RN/ })).toBeTruthy();
    expect(within(table).getByRole("button", { name: /Maria Lopez/ })).toBeTruthy();
    expect(table.textContent).not.toContain("shift-");
    expect(table.textContent).not.toContain("nurse-1");
    openFilters();
    expect(screen.getByRole("button", { name: "Filled 1" })).toBeTruthy();
  });

  it("filters by status and offers Clear filter when nothing matches", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Cancelled 0" }));
    expect(await screen.findByRole("heading", { name: "No cancelled shifts" })).toBeTruthy();
    expect(calls.some((c) => c.path === "/api/agencies/agency-a/coverage?status=cancelled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });

  it("filters by role server-side and keeps counts from the unfiltered query", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "LPN 1" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/agencies/agency-a/coverage?role=LPN")).toBe(true));
    await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "RN 1" })).toBeTruthy();
    expect(screen.getByTestId("agency-shift-count").textContent).toBe("2 shifts");
  });

  it("filter dropdown: count of non-default filters, params, and Reset restores defaults", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy(); // no count at defaults
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Filled 1" }));
    fireEvent.click(screen.getByRole("button", { name: "LPN 1" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-03" } });
    expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/agencies/agency-a/coverage?status=filled&role=LPN&date=2026-10-03")).toBe(true));
    // Search is outside the dropdown and does not count.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "lop" } });
    expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByRole("button", { name: "All 2", pressed: true })).toHaveLength(2); // status and role back to All
  });

  it("shows an error state with Retry", async () => {
    signIn([A], "agency-a");
    overrides["GET /api/agencies/agency-a/coverage"] = [403, { error: "Forbidden" }];
    renderWith(<AgencyShiftsPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Forbidden");
    delete overrides["GET /api/agencies/agency-a/coverage"];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });

  it("viewer: Post shift is disabled with an explanation and no row actions", async () => {
    signIn([{ ...A, role: "viewer" }], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    const post = screen.getByTestId("agency-post-shift-button") as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    expect(document.getElementById(post.getAttribute("aria-describedby") ?? "")?.textContent).toMatch(/View-only access/);
    expect(screen.queryByTestId("agency-cancel-shift-button")).toBeNull();
    expect(screen.queryByRole("button", { name: /Withdraw/ })).toBeNull();
    // Viewers see the claimant name as text only: the nurse route would 404 for them.
    expect(screen.queryByRole("button", { name: /Maria Lopez/ })).toBeNull();
    expect(screen.getByText("Maria Lopez")).toBeTruthy();
  });

  it("opens the nurse detail dialog from the Claimed by name (fetched on open)", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    expect(calls.some((c) => c.path.endsWith("/nurse"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Maria Lopez/ }));
    const dialog = await screen.findByRole("dialog", { name: "Nurse details" });
    await waitFor(() => expect(dialog.textContent).toContain("maria@example.com"));
    expect(dialog.textContent).toContain("Nursing license");
    expect(calls.filter((c) => c.path === "/api/shifts/shift-2/nurse")).toHaveLength(1);
  });

  it("nurse dialog shows an error with Retry", async () => {
    signIn([A], "agency-a");
    overrides["GET /api/shifts/shift-2/nurse"] = [404, { error: "Not found" }];
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /Maria Lopez/ }));
    const dialog = await screen.findByRole("dialog", { name: "Nurse details" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Not found");
    delete overrides["GET /api/shifts/shift-2/nurse"];
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(dialog.textContent).toContain("maria@example.com"));
  });
});

describe("post shift form", () => {
  async function openForm() {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByTestId("agency-post-shift-button"));
    return screen.getByRole("dialog", { name: "Post a shift" });
  }
  const fill = (dialog: HTMLElement, v: { date: string; start: string; end: string }) => {
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: v.date } });
    fireEvent.change(within(dialog).getByLabelText("Start time"), { target: { value: v.start } });
    fireEvent.change(within(dialog).getByLabelText("End time"), { target: { value: v.end } });
  };

  it("shows friendly validation messages and posts nothing", async () => {
    const dialog = await openForm();
    fireEvent.click(screen.getByTestId("agency-post-shift-submit-button"));
    expect(await within(dialog).findByText("Pick a role")).toBeTruthy();
    expect(within(dialog).getByText("Enter a date")).toBeTruthy();
    expect(within(dialog).getAllByText("Use HH:MM")).toHaveLength(2);

    fireEvent.click(within(dialog).getByLabelText(/^RN/));
    fill(dialog, { date: "2026-12-01", start: "07:00", end: "07:00" });
    fireEvent.click(screen.getByTestId("agency-post-shift-submit-button"));
    expect(await within(dialog).findByText("Start and end must differ")).toBeTruthy();
    expect(posts("/api/shifts")).toHaveLength(0);
  });

  it("posts the exact body, notifies, closes and refetches", async () => {
    overrides["POST /api/shifts"] = [201, { id: "shift-4", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-12-01", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null }];
    const dialog = await openForm();
    fireEvent.click(within(dialog).getByLabelText(/^RN/));
    fill(dialog, { date: "2026-12-01", start: "19:00", end: "07:00" });
    expect(within(dialog).getByText("Tue, Dec 1, 2026 · 19:00 → 07:00 · 12 h · Overnight")).toBeTruthy();
    fireEvent.click(screen.getByTestId("agency-post-shift-submit-button"));
    await waitFor(() => expect(toasts()).toContain("success:Shift posted"));
    expect(useToastStore.getState().toasts[0]?.message).toContain("Tue, Dec 1, 2026 · 19:00 → 07:00");
    expect(posts("/api/shifts")[0]?.body).toEqual({ role: "RN", date: "2026-12-01", startTime: "19:00", endTime: "07:00" });
    expect(posts("/api/shifts")[0]?.headers["X-Agency-Id"]).toBe("agency-a");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/agencies/agency-a/coverage")).toHaveLength(2));
  });

  it("submits from the footer button and with Enter from an input (button is outside the form)", async () => {
    overrides["POST /api/shifts"] = [201, { id: "shift-4", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-12-01", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null }];
    const dialog = await openForm();
    expect(screen.getAllByTestId("agency-post-shift-submit-button")).toHaveLength(1);
    const submit = screen.getByTestId("agency-post-shift-submit-button") as HTMLButtonElement;
    expect(submit.form).toBe(dialog.querySelector("form"));
    fireEvent.click(within(dialog).getByLabelText(/^RN/));
    fill(dialog, { date: "2026-12-01", start: "19:00", end: "07:00" });
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement); // what Enter in an input triggers
    await waitFor(() => expect(posts("/api/shifts")).toHaveLength(1));
  });

  it("surfaces the server error verbatim and keeps the form open", async () => {
    overrides["POST /api/shifts"] = [403, { error: "Forbidden" }];
    const dialog = await openForm();
    fireEvent.click(within(dialog).getByLabelText(/^LPN/));
    fill(dialog, { date: "2026-12-01", start: "07:00", end: "19:00" });
    fireEvent.click(screen.getByTestId("agency-post-shift-submit-button"));
    await waitFor(() => expect(toasts()).toContain("error:Forbidden"));
    expect(screen.getByRole("dialog", { name: "Post a shift" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Date") as HTMLInputElement).value).toBe("2026-12-01");
  });
});

describe("row actions", () => {
  it("withdraws an open shift after confirming", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /Withdraw, RN/ }));
    const dialog = screen.getByRole("dialog", { name: "Withdraw this shift?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw shift" }));
    await waitFor(() => expect(toasts()).toContain("success:Shift withdrawn"));
    expect(posts("/api/shifts/shift-1/withdraw")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancels a filled shift with the chosen reason (a reason is required)", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByTestId("agency-cancel-shift-button"));
    const dialog = screen.getByRole("dialog", { name: "Cancel this filled shift?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel shift" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Pick a reason");
    expect(posts("/api/shifts/shift-2/cancel")).toHaveLength(0);

    expect(dialog.textContent).toContain("Filled by Maria Lopez");
    expect(dialog.textContent).not.toContain("nurse-1");
    fireEvent.click(within(dialog).getByRole("radio", { name: /No-show/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel shift" }));
    await waitFor(() => expect(toasts()).toContain("success:Shift cancelled"));
    expect(posts("/api/shifts/shift-2/cancel")[0]?.body).toEqual({ reason: "no-show" });
  });

  it("opens details with the nurse name, no IDs, and a nurse-details option", async () => {
    signIn([A], "agency-a");
    renderWith(<AgencyShiftsPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^Details, LPN/ }));
    const dialog = screen.getByRole("dialog", { name: "LPN shift" });
    expect(dialog.textContent).toContain("Maria Lopez");
    expect(dialog.textContent).not.toContain("nurse-1");
    expect(dialog.textContent).not.toContain("Shift ID");
    expect(within(dialog).getByRole("button", { name: "View nurse details" })).toBeTruthy();
    expect(dialog.textContent).toContain("Sat, Oct 3, 2026");
    expect(within(dialog).getByRole("button", { name: "Cancel shift" })).toBeTruthy();
  });
});

function SwitchTo({ id }: { id: string }) {
  const switchAgency = useSwitchAgency();
  return <button onClick={() => switchAgency(id)}>{`go-${id.slice(-1)}`}</button>;
}

describe("agency switching", () => {
  it("switcher: new X-Agency-Id, previous agency's cache removed, dialogs closed", async () => {
    signIn([A, B], "agency-a");
    const { client } = renderWith(
      <>
        <SwitchTo id="agency-b" />
        <AgencyShiftsPage />
      </>,
    );
    await screen.findByRole("table");
    fireEvent.click(screen.getByTestId("agency-post-shift-button"));
    expect(screen.getByRole("dialog", { name: "Post a shift" })).toBeTruthy();
    expect(client.getQueryData(agencyKey("agency-a", "shifts", "coverage", {}))).toBeTruthy();

    // A real modal makes the page inert (Radix aria-hides it and traps focus), so the switcher UI is unreachable here;
    // drive the same hook it uses. The switcher's own keyboard behavior is covered by the Escape test below.
    fireEvent.click(screen.getByRole("button", { name: "go-b", hidden: true }));

    expect(useSessionStore.getState().activeAgencyId).toBe("agency-b");
    expect(client.getQueryData(agencyKey("agency-a", "shifts", "coverage", {}))).toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    await screen.findByRole("table", { name: /Metro Care Partners/ });
    const last = calls.filter((c) => c.path === "/api/agencies/agency-b/coverage").at(-1);
    expect(last?.headers["X-Agency-Id"]).toBe("agency-b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape closes the switcher and returns focus to its button; single membership has none", async () => {
    signIn([A, B], "agency-a");
    const { unmount } = renderWith(<AgencySwitcher />);
    const trigger = screen.getByRole("button", { name: /Switch agency/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: /Sunrise/ }).getAttribute("aria-selected")).toBe("true");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    unmount();

    signIn([A], "agency-a");
    renderWith(<AgencySwitcher />);
    expect(screen.queryByRole("button", { name: /Switch agency/ })).toBeNull();
  });

  it("profile lists memberships with roles and switches", async () => {
    signIn([A, B], "agency-a");
    renderWith(<AgencyProfilePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Agency profile" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Active agency details" })).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.queryByText("agency-a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Metro Care Partners" }));
    expect(useSessionStore.getState().activeAgencyId).toBe("agency-b");
    expect(screen.queryByText("agency-b")).toBeNull();
  });
});

describe("echoLine", () => {
  it("formats overnight and same-day shifts, null until complete", () => {
    expect(echoLine({ date: "2026-10-02", startTime: "19:00", endTime: "07:00" })).toBe("Fri, Oct 2, 2026 · 19:00 → 07:00 · 12 h · Overnight");
    expect(echoLine({ date: "2026-10-03", startTime: "07:00", endTime: "15:30" })).toBe("Sat, Oct 3, 2026 · 07:00 → 15:30 · 8.5 h");
    expect(echoLine({ date: "2026-10-03", startTime: "07:00", endTime: "" })).toBeNull();
  });
});
