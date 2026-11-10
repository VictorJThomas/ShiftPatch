import "@/lib/zod-csp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CREDENTIAL_MAX_BYTES, ErrorMessage, type Shift } from "@shiftpatch/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useToastStore } from "@/stores/toasts";
import { Credentials } from "./Credentials";
import { Marketplace, pickShiftSource } from "./Marketplace";
import { MyShifts } from "./MyShifts";
import { ShiftCard } from "./ShiftCard";
import { CredentialUploadForm } from "./CredentialUploadForm";
import { fileProblem, parseCredentialType } from "./credential-upload";

vi.mock("@/lib/api-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-client")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
// The AppBar avatar (AccountMenu) uses the app router for sign-out.
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/nurse" }));

// Seed (spec): shift-1 agency-a RN overnight open, shift-2 LPN day filled by nurse-1, shift-3 agency-b RN overnight open.
const shift1: Shift = { id: "shift-1", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null };
const shift2: Shift = { id: "shift-2", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "LPN", date: "2026-10-03", startTime: "07:00", endTime: "19:00", status: "filled", claimedBy: "nurse-1" };
const shift3: Shift = { id: "shift-3", agencyId: "agency-b", agencyName: "Metro Care Partners", role: "RN", date: "2026-10-04", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null };

type Handler = unknown | ((opts: { method?: string; body?: unknown } | undefined) => unknown);
let routes: Record<string, Handler>;

function serve(next: Record<string, Handler>) {
  routes = next;
  api.mockImplementation(async (path, opts) => {
    const key = `${opts?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`unexpected ${key}`);
    const h = routes[key];
    return typeof h === "function" ? h(opts) : h;
  });
}

let qc: QueryClient;
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
const toasts = () => useToastStore.getState().toasts;

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
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  act(() => useToastStore.getState().clear());
});

const marketplace = (matchable: Shift[], open: Shift[], licenseValid: boolean, extra: Record<string, Handler> = {}) =>
  serve({
    "GET /api/shifts?matchable=true": { shifts: matchable },
    "GET /api/shifts": { shifts: [...open, shift2] }, // the filled one must be filtered out
    "GET /api/nurses/me/credentials": { credentials: [], licenseValid },
    ...extra,
  });

describe("ShiftCard", () => {
  it("renders the list test id, formatted overnight time and duration tag", () => {
    render(<ShiftCard shift={shift1} testId="shift-list-item" />);
    const card = screen.getByTestId("shift-list-item");
    expect(card.textContent).toContain("Fri, Oct 2 · 19:00 → Sat 07:00");
    expect(card.textContent).toContain("Overnight · 12 h");
    expect(within(card).getByRole("heading", { name: "Sunrise Health Staffing" })).toBeTruthy();
    expect(card.textContent).toContain("Open");
  });
});

describe("Marketplace claim", () => {
  it("claims in one click, shows success and invalidates shift + my-shift queries", async () => {
    marketplace([shift1], [shift1], true, { "POST /api/shifts/shift-1/claim": { ...shift1, status: "filled", claimedBy: "nurse-1" } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    wrap(<Marketplace />);
    fireEvent.click(await screen.findByTestId("shift-claim-button"));
    await waitFor(() => expect(toasts()[0]?.title).toBe("Shift claimed"));
    expect(toasts()[0]?.kind).toBe("success");
    expect(api).toHaveBeenCalledWith("/api/shifts/shift-1/claim", expect.objectContaining({ method: "POST" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shifts"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["nurse", "my-shifts"] });
  });

  it("keeps the button label 'Claim shift' (no request/assign workflow)", async () => {
    marketplace([shift1], [shift1], true);
    wrap(<Marketplace />);
    expect((await screen.findByTestId("shift-claim-button")).textContent).toBe("Claim shift");
    expect(screen.queryByText(/Request shift|Requested|Confirmed by/)).toBeNull();
  });

  it("surfaces the 403 server text verbatim", async () => {
    marketplace([shift1], [shift1], true, {
      "POST /api/shifts/shift-1/claim": () => {
        throw new ApiError(403, "Credential expired, cannot claim shift");
      },
    });
    wrap(<Marketplace />);
    fireEvent.click(await screen.findByTestId("shift-claim-button"));
    await waitFor(() => expect(toasts()[0]).toMatchObject({ kind: "error", title: "Credential expired, cannot claim shift" }));
  });
});

describe("Lapsed-license fallback", () => {
  it("warns and lists open shifts with Claim enabled when nothing matches and the license is not valid", async () => {
    marketplace([], [shift1, shift3], false);
    wrap(<Marketplace />);
    expect(await screen.findByText("Your license has expired.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Upload renewed license/ }).getAttribute("href")).toBe("/nurse/credentials/new?type=license");
    expect(screen.getAllByTestId("shift-list-item")).toHaveLength(2);
    for (const b of screen.getAllByTestId("shift-claim-button")) expect((b as HTMLButtonElement).disabled).toBe(false);
  });

  it("uses neutral copy when the license is valid", async () => {
    marketplace([], [shift1], true);
    wrap(<Marketplace />);
    expect(await screen.findByText("No shifts match your credentials right now")).toBeTruthy();
    expect(screen.queryByText("Your license has expired.")).toBeNull();
    expect(screen.getAllByTestId("shift-list-item")).toHaveLength(1);
  });

  it("picks matchable first, open only as a fallback", () => {
    expect(pickShiftSource([shift1], [shift1, shift3], false)).toEqual({ shifts: [shift1], notice: null });
    expect(pickShiftSource([], [], true)).toEqual({ shifts: [], notice: null });
    expect(pickShiftSource([], [], false)).toEqual({ shifts: [], notice: "expired" }); // lapsed, nothing open: still warn
    expect(pickShiftSource([], [shift3], undefined).notice).toBe("nomatch"); // credentials request failed
  });
});

describe("Marketplace filters (FilterDropdown, immediate)", () => {
  const trigger = (name: string | RegExp = /^Filters/) => screen.getByRole("button", { name });
  const openFilters = async () => {
    fireEvent.click(trigger());
    return screen.findByRole("dialog", { name: "Filters" });
  };

  it("keeps date and role inside one dropdown; filters server-side by role and shows the active count", async () => {
    marketplace([shift1, shift3], [shift1, shift3], true, {
      "GET /api/shifts?matchable=true&role=LPN&status=open": { shifts: [] },
      "GET /api/shifts?matchable=true&role=RN&status=open": { shifts: [shift1, shift3] },
    });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    expect(screen.queryByRole("group", { name: "Role" })).toBeNull(); // chips live in the panel, not on the page
    expect(trigger("Filters").getAttribute("aria-label")).toBeNull(); // 0 active: plain label
    const panel = await openFilters();
    expect(within(panel).getByRole("group", { name: "Date" })).toBeTruthy();
    expect(within(panel).getByRole("group", { name: "Role" })).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Apply" })).toBeNull(); // immediate mode
    fireEvent.click(within(panel).getByRole("button", { name: "LPN 0" }));
    expect(await screen.findByText("No open shifts match")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/shifts?matchable=true&role=LPN&status=open", expect.anything());
    expect(trigger("Filters, 1 active")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "RN 2" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/shifts?matchable=true&role=RN&status=open", expect.anything()));
    expect(await screen.findByText("2 shifts you can take")).toBeTruthy();
  });

  it("filters by date, counts both active filters and Reset restores the unfiltered list", async () => {
    marketplace([shift1, shift3], [shift1, shift3], true, {
      "GET /api/shifts?matchable=true&date=2026-10-04&status=open": { shifts: [shift3] },
      "GET /api/shifts?matchable=true&role=RN&date=2026-10-04&status=open": { shifts: [shift3] },
    });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    const panel = await openFilters();
    fireEvent.click(within(panel).getByRole("button", { name: /Sun, Oct 4/ }));
    await waitFor(() => expect(screen.getAllByTestId("shift-list-item")).toHaveLength(1));
    expect(screen.getByText("1 shift you can take")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "All dates 2" })).toBeTruthy(); // counts come from the unfiltered data
    fireEvent.click(within(panel).getByRole("button", { name: /^RN/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/shifts?matchable=true&role=RN&date=2026-10-04&status=open", expect.anything()));
    expect(trigger("Filters, 2 active")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getAllByTestId("shift-list-item")).toHaveLength(2));
    expect(trigger("Filters").getAttribute("aria-label")).toBeNull();
  });

  it("filters the lapsed-license fallback list from the open source (no matchable param)", async () => {
    marketplace([], [shift1, shift3], false, { "GET /api/shifts?role=RN&status=open": { shifts: [shift1, shift3] } });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    const panel = await openFilters();
    fireEvent.click(within(panel).getByRole("button", { name: "RN 2" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/shifts?role=RN&status=open", expect.anything()));
    expect(await screen.findByText("2 open shifts")).toBeTruthy();
  });

  it("does not re-activate a date filter whose shift vanished and then reappeared", async () => {
    const filtered = { "GET /api/shifts?matchable=true&date=2026-10-04&status=open": { shifts: [shift3] } };
    marketplace([shift1, shift3], [shift1, shift3], true, filtered);
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    const panel = await openFilters();
    fireEvent.click(within(panel).getByRole("button", { name: /Sun, Oct 4/ }));
    expect(await screen.findByRole("button", { name: "Filters, 1 active" })).toBeTruthy();
    marketplace([shift1], [shift1], true); // shift3 claimed elsewhere
    await act(() => qc.invalidateQueries());
    await waitFor(() => expect(screen.getAllByTestId("shift-list-item")).toHaveLength(1));
    expect(trigger("Filters").getAttribute("aria-label")).toBeNull();
    marketplace([shift1, shift3], [shift1, shift3], true, filtered); // reappears
    await act(() => qc.invalidateQueries());
    await waitFor(() => expect(screen.getAllByTestId("shift-list-item")).toHaveLength(2));
    expect(trigger("Filters").getAttribute("aria-label")).toBeNull();
  });

  it("shows an error with retry when the filtered request fails", async () => {
    marketplace([shift1], [shift1], true, {
      "GET /api/shifts?matchable=true&role=RN&status=open": () => {
        throw new ApiError(500, "Boom");
      },
    });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    const panel = await openFilters();
    fireEvent.click(within(panel).getByRole("button", { name: "RN 1" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("My shifts cancel", () => {
  it("posts an advance cancellation in one click; the policy notice is outside the cards grid", async () => {
    serve({
      "GET /api/nurses/me/shifts": { shifts: [shift2] },
      "POST /api/shifts/shift-2/cancel": { ...shift2, status: "open", claimedBy: null },
    });
    wrap(<MyShifts />);
    const cancel = await screen.findByTestId("shift-cancel-button");
    const notice = screen.getByText(/reopens for other nurses/);
    expect(notice.closest("ul")).toBeNull();
    expect(screen.getByRole("heading", { name: /Upcoming\s*1/ })).toBeTruthy();
    expect(screen.queryByText(/Requested|Confirmed by/)).toBeNull();
    fireEvent.click(cancel);
    await waitFor(() => expect(toasts()[0]?.title).toBe("Shift cancelled"));
    expect(api).toHaveBeenCalledWith("/api/shifts/shift-2/cancel", expect.objectContaining({ method: "POST", body: { reason: "advance" } }));
  });

  it("opens a details dialog without raw IDs", async () => {
    serve({ "GET /api/nurses/me/shifts": { shifts: [shift2] } });
    wrap(<MyShifts />);
    fireEvent.click(await screen.findByRole("button", { name: /Details: Sunrise Health Staffing, LPN/ }));
    expect(await screen.findByText("Role required")).toBeTruthy();
    expect(screen.queryByText("shift-2")).toBeNull();
    expect(screen.queryByText("agency-a")).toBeNull();
  });

  it("shows the empty state and an error with retry", async () => {
    serve({ "GET /api/nurses/me/shifts": { shifts: [] } });
    wrap(<MyShifts />);
    expect(await screen.findByText("No upcoming shifts")).toBeTruthy();
    cleanup();
    qc.clear();
    serve({
      "GET /api/nurses/me/shifts": () => {
        throw new ApiError(500, "Boom");
      },
    });
    wrap(<MyShifts />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("parseCredentialType (?type= preset)", () => {
  it("accepts the three types and falls back to license for anything else", () => {
    expect(parseCredentialType("tb_screening")).toBe("tb_screening");
    expect(parseCredentialType("other")).toBe("other");
    expect(parseCredentialType("license")).toBe("license");
    expect(parseCredentialType(["other", "license"])).toBe("other");
    expect(parseCredentialType("passport")).toBe("license");
    expect(parseCredentialType(undefined)).toBe("license");
  });
});

describe("Credential upload form (/nurse/credentials/new)", () => {
  const pdf = (name = "license.pdf", type = "application/pdf") => new File(["%PDF-1.7"], name, { type });
  const submitBtn = () => screen.getByRole("button", { name: "Add credential" }) as HTMLButtonElement;
  const pickFile = (f: File) => fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [f] } });
  const setDate = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
  const created = (opts: { body?: unknown } | undefined) => {
    sent = opts?.body as FormData;
    return { credential: {} };
  };
  let sent: FormData | undefined;
  beforeEach(() => {
    sent = undefined;
    push.mockClear();
  });

  it("has both spec inputs once each, always rendered, with a title, guidance and required/optional marks", () => {
    serve({});
    wrap(<CredentialUploadForm />);
    expect(screen.getByRole("heading", { level: 1, name: "Add credential" })).toBeTruthy();
    const file = screen.getByTestId("credential-upload-input");
    expect(file.getAttribute("accept")).toContain("application/pdf");
    expect(file.hasAttribute("capture")).toBe(false);
    expect(screen.getAllByTestId("credential-upload-input")).toHaveLength(1);
    expect(screen.getAllByTestId("credential-expiry-date-input")).toHaveLength(1);
    expect(screen.getByTestId("credential-expiry-date-input").getAttribute("type")).toBe("date");
    expect(screen.getByText(/Up to 10 MB/)).toBeTruthy();
    expect(screen.getByLabelText(/Expiry date \(required\)/).hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText(/License type \(optional\)/)).toBeTruthy();
    expect(screen.queryByLabelText(/Screening date/)).toBeNull();
  });

  it("submits a license: multipart fields, success toast, invalidates credential queries, navigates to the list", async () => {
    serve({ "POST /api/nurses/me/credentials": created });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    wrap(<CredentialUploadForm />);
    pickFile(pdf());
    await screen.findByTestId("credential-file-name");
    expect(screen.getByTestId("credential-file-name").textContent).toMatch(/license\.pdf.*MB/);
    setDate("credential-expiry-date-input", "2028-01-01");
    fireEvent.change(screen.getByLabelText(/License type/), { target: { value: "RN" } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/nurse/credentials"));
    expect(toasts()[0]).toMatchObject({ kind: "success", title: "Credential submitted" });
    expect(toasts()[0]?.message).toContain("Nursing license (RN)");
    expect(toasts()[0]?.message).toContain("expires Sat, Jan 1, 2028");
    expect(sent).toBeInstanceOf(FormData);
    expect(sent!.get("type")).toBe("license");
    expect(sent!.get("licenseType")).toBe("RN");
    expect(sent!.get("expiresOn")).toBe("2028-01-01");
    expect(sent!.has("screenedOn")).toBe(false);
    expect((sent!.get("file") as File).name).toBe("license.pdf");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["nurse", "credentials"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shifts"] });
  });

  it("submits a TB screening: screening date required, expiry optional, no licenseType", async () => {
    serve({ "POST /api/nurses/me/credentials": created });
    wrap(<CredentialUploadForm initialType="tb_screening" />);
    expect((screen.getByLabelText(/Credential type/) as HTMLSelectElement).value).toBe("tb_screening");
    expect(screen.getByLabelText(/Expiry date \(optional\)/).hasAttribute("required")).toBe(false);
    expect(screen.getByLabelText(/Screening date \(required\)/)).toBeTruthy();
    expect(screen.queryByLabelText(/License type/)).toBeNull();
    pickFile(pdf("tb.pdf"));
    fireEvent.click(submitBtn());
    expect(await screen.findByText("Screening date is required for a TB screening")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Screening date/), { target: { value: "2026-09-01" } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/nurse/credentials"));
    expect(sent!.get("type")).toBe("tb_screening");
    expect(sent!.get("screenedOn")).toBe("2026-09-01");
    expect(sent!.has("expiresOn")).toBe(false);
    expect(sent!.has("licenseType")).toBe(false);
  });

  it("submits an other document with just a file (no dates)", async () => {
    serve({ "POST /api/nurses/me/credentials": created });
    wrap(<CredentialUploadForm initialType="other" />);
    expect(screen.queryByLabelText(/License type/)).toBeNull();
    expect(screen.queryByLabelText(/Screening date/)).toBeNull();
    pickFile(pdf("cert.pdf"));
    fireEvent.click(submitBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/nurse/credentials"));
    expect(sent!.get("type")).toBe("other");
    expect([...sent!.keys()]).toEqual(["type", "file"]);
    expect(toasts()[0]?.message).toContain("no expiry date");
  });

  it("switching the type swaps the conditional fields and the required mark on expiry", () => {
    serve({});
    wrap(<CredentialUploadForm />);
    fireEvent.change(screen.getByLabelText(/Credential type/), { target: { value: "tb_screening" } });
    expect(screen.getByLabelText(/Screening date/)).toBeTruthy();
    expect(screen.queryByLabelText(/License type/)).toBeNull();
    expect(screen.getByLabelText(/Expiry date \(optional\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Credential type/), { target: { value: "license" } });
    expect(screen.queryByLabelText(/Screening date/)).toBeNull();
    expect(screen.getByLabelText(/Expiry date \(required\)/)).toBeTruthy();
    expect(screen.getAllByTestId("credential-expiry-date-input")).toHaveLength(1);
  });

  it("QA-008: after a failed submit, switching license -> TB clears the stale expiry error", async () => {
    serve({});
    wrap(<CredentialUploadForm />);
    fireEvent.click(submitBtn());
    expect(await screen.findByText("Expiry date is required for a license")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Credential type/), { target: { value: "tb_screening" } });
    await waitFor(() => expect(screen.queryByText("Expiry date is required for a license")).toBeNull());
    expect(screen.getByTestId("credential-expiry-date-input").getAttribute("aria-invalid")).not.toBe("true");
    // the TB-only field is now validated against the new type
    expect(await screen.findByText("Screening date is required for a TB screening")).toBeTruthy();
  });

  it("QA-008: after a failed submit, switching TB -> license drops the screening-date error and validates expiry", async () => {
    serve({});
    wrap(<CredentialUploadForm initialType="tb_screening" />);
    fireEvent.click(submitBtn());
    expect(await screen.findByText("Screening date is required for a TB screening")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Credential type/), { target: { value: "license" } });
    await waitFor(() => expect(screen.queryByText("Screening date is required for a TB screening")).toBeNull());
    expect(await screen.findByText("Expiry date is required for a license")).toBeTruthy();
    // and back: the license-only error goes away again
    fireEvent.change(screen.getByLabelText(/Credential type/), { target: { value: "tb_screening" } });
    await waitFor(() => expect(screen.queryByText("Expiry date is required for a license")).toBeNull());
  });

  it("QA-008: a fresh form does not show errors when the type is switched", async () => {
    serve({});
    wrap(<CredentialUploadForm />);
    fireEvent.change(screen.getByLabelText(/Credential type/), { target: { value: "tb_screening" } });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/is required for a/)).toBeNull();
  });

  it("requires the expiry date for a license and the file, with inline errors and no request", async () => {
    serve({});
    wrap(<CredentialUploadForm />);
    fireEvent.click(submitBtn());
    expect(await screen.findByText("Expiry date is required for a license")).toBeTruthy();
    expect(screen.getByText(ErrorMessage.fileRequired)).toBeTruthy();
    expect(screen.getByTestId("credential-expiry-date-input").getAttribute("aria-invalid")).toBe("true");
    expect(api).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MB and an unsupported type inline, before uploading", async () => {
    const big = pdf();
    Object.defineProperty(big, "size", { value: CREDENTIAL_MAX_BYTES + 1 });
    expect(fileProblem(big)).toBe("File is larger than 10 MB");
    expect(fileProblem(pdf("notes.txt", "text/plain"))).toMatch(/^Unsupported file type/);
    expect(fileProblem(pdf("scan.HEIC", ""))).toBeNull();

    serve({});
    wrap(<CredentialUploadForm initialType="other" />);
    pickFile(big);
    expect(await screen.findByText("File is larger than 10 MB")).toBeTruthy();
    fireEvent.click(submitBtn());
    pickFile(pdf("notes.txt", "text/plain"));
    expect(await screen.findByText(/^Unsupported file type/)).toBeTruthy();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(screen.getByTestId("credential-upload-input").getAttribute("aria-invalid")).toBe("true"));
    expect(api).not.toHaveBeenCalled();
  });

  it("keeps every value after an upload failure so the nurse can retry, and does not navigate", async () => {
    serve({
      "POST /api/nurses/me/credentials": () => {
        throw new ApiError(503, "Uploads are not available right now");
      },
    });
    wrap(<CredentialUploadForm />);
    pickFile(pdf());
    setDate("credential-expiry-date-input", "2028-01-01");
    fireEvent.change(screen.getByLabelText(/License type/), { target: { value: "LPN" } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(toasts()[0]).toMatchObject({ kind: "error", title: "Uploads are not available right now" }));
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByTestId("credential-expiry-date-input") as HTMLInputElement).value).toBe("2028-01-01");
    expect((screen.getByLabelText(/License type/) as HTMLSelectElement).value).toBe("LPN");
    expect(screen.getByTestId("credential-file-name").textContent).toContain("license.pdf");
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
  });

  it("shows an indeterminate progress bar and blocks Cancel/Back while the upload is in flight", async () => {
    let finish!: () => void;
    serve({ "POST /api/nurses/me/credentials": () => new Promise((resolve) => (finish = () => resolve({ credential: {} }))) });
    wrap(<CredentialUploadForm initialType="other" />);
    pickFile(pdf());
    fireEvent.click(submitBtn());
    const bar = await screen.findByRole("progressbar", { name: "Uploading credential" });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: /Back to credentials/ }));
    expect(push).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/nurse/credentials"));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("Cancel leaves at once when pristine; when dirty it asks first and warns on unload", async () => {
    serve({});
    wrap(<CredentialUploadForm />);
    const unload = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/nurse/credentials");
    push.mockClear();

    pickFile(pdf());
    await screen.findByTestId("credential-file-name");
    await waitFor(() => expect(unload()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).not.toHaveBeenCalled();
    const dlg = await screen.findByRole("dialog", { name: "Discard this credential?" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByText("Discard this credential?")).toBeNull());
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Discard this credential?" })).getByRole("button", { name: "Discard" }));
    expect(push).toHaveBeenCalledWith("/nurse/credentials");
  });

  it("does not count a picked-then-cleared file as dirty", async () => {
    serve({});
    wrap(<CredentialUploadForm />);
    const input = screen.getByTestId("credential-upload-input");
    fireEvent.change(input, { target: { files: [pdf()] } });
    await screen.findByTestId("credential-file-name");
    fireEvent.change(input, { target: { files: [] } });
    await waitFor(() => expect(screen.queryByTestId("credential-file-name")).toBeNull());
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/nurse/credentials");
  });

  describe("guards shell navigation while dirty", () => {
    const click = (init: MouseEventInit = {}, el: Element = screen.getByRole("link", { name: "Shell link" })) => {
      const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
      act(() => void el.dispatchEvent(e));
      return e;
    };
    const mount = (ui = <CredentialUploadForm />) =>
      wrap(
        <>
          <a href="/nurse/marketplace">Shell link</a>
          <a href="https://example.com/x">External</a>
          <a href="/nurse/marketplace" target="_blank">Blank</a>
          <a href="/nurse/marketplace" download>Download</a>
          <a href="#top">Same page</a>
          {ui}
        </>,
      );
    const dirty = async () => {
      pickFile(pdf());
      await screen.findByTestId("credential-file-name");
    };

    it("lets a pristine form navigate freely", () => {
      serve({});
      mount();
      expect(click().defaultPrevented).toBe(false);
    });

    it("intercepts a plain click, asks, and pushes the href on confirm", async () => {
      serve({});
      mount();
      await dirty();
      expect(click().defaultPrevented).toBe(true);
      expect(push).not.toHaveBeenCalled();
      const dlg = await screen.findByRole("dialog", { name: "Discard this credential?" });
      fireEvent.click(within(dlg).getByRole("button", { name: "Keep editing" }));
      expect(push).not.toHaveBeenCalled();
      click();
      fireEvent.click(within(await screen.findByRole("dialog", { name: "Discard this credential?" })).getByRole("button", { name: "Discard" }));
      expect(push).toHaveBeenCalledWith("/nurse/marketplace");
    });

    it("never intercepts modified, middle, _blank, download, external or same-page clicks", async () => {
      serve({});
      mount();
      await dirty();
      for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) expect(click(init).defaultPrevented).toBe(false);
      for (const name of ["External", "Blank", "Download", "Same page"]) expect(click({}, screen.getByRole("link", { name })).defaultPrevented).toBe(false);
      expect(screen.queryByRole("dialog", { name: "Discard this credential?" })).toBeNull();
    });

    it("leaves a modified click on Back to credentials to the browser", async () => {
      serve({});
      mount();
      await dirty();
      expect(click({ ctrlKey: true }, screen.getByRole("link", { name: /Back to credentials/ })).defaultPrevented).toBe(false);
      expect(push).not.toHaveBeenCalled();
    });

    it("blocks navigation during an in-flight upload without a dialog", async () => {
      let finish!: () => void;
      serve({ "POST /api/nurses/me/credentials": () => new Promise((resolve) => (finish = () => resolve({ credential: {} }))) });
      mount(<CredentialUploadForm initialType="other" />);
      pickFile(pdf());
      fireEvent.click(submitBtn());
      await screen.findByRole("progressbar", { name: "Uploading credential" });
      expect(click().defaultPrevented).toBe(true);
      expect(screen.queryByRole("dialog", { name: "Discard this credential?" })).toBeNull();
      expect(push).not.toHaveBeenCalledWith("/nurse/marketplace");
      finish();
      await waitFor(() => expect(push).toHaveBeenCalledWith("/nurse/credentials"));
    });
  });
});

describe("Credentials list", () => {
  const expiredLicense = { id: "c1", type: "license", licenseType: "RN", status: "verified", expiresOn: "2026-06-01", screenedOn: null, uploadedAt: "2025-06-01T10:00:00.000Z", expired: true, hasFile: true };

  it("lists credentials with status and links to the dedicated form (no form on this page)", async () => {
    serve({ "GET /api/nurses/me/credentials": { licenseValid: false, credentials: [expiredLicense] } });
    wrap(<Credentials />);
    expect(await screen.findByText("Nursing license (RN)")).toBeTruthy();
    expect(screen.getByText("Expired", { selector: "[data-slot=badge]" })).toBeTruthy();
    expect(screen.getByText("Your license has expired.")).toBeTruthy();
    expect(screen.queryByTestId("credential-upload-input")).toBeNull();
    expect(screen.queryByTestId("credential-expiry-date-input")).toBeNull();
    expect(screen.getByRole("link", { name: /Add credential/ }).getAttribute("href")).toBe("/nurse/credentials/new?type=license");
    expect(screen.getByRole("link", { name: /Upload renewal/ }).getAttribute("href")).toBe("/nurse/credentials/new?type=license");
    expect(screen.getByRole("link", { name: /Upload license/ }).getAttribute("href")).toBe("/nurse/credentials/new?type=license");
  });

  it("renewal of a rejected TB screening presets the TB type", async () => {
    const tb = { ...expiredLicense, id: "c2", type: "tb_screening", licenseType: null, status: "rejected", expired: false, expiresOn: null, screenedOn: "2026-01-01" };
    serve({ "GET /api/nurses/me/credentials": { licenseValid: true, credentials: [tb] } });
    wrap(<Credentials />);
    expect((await screen.findByRole("link", { name: /Upload a new copy/ })).getAttribute("href")).toBe("/nurse/credentials/new?type=tb_screening");
  });

  it("opens a details dialog from the card button", async () => {
    serve({ "GET /api/nurses/me/credentials": { licenseValid: false, credentials: [expiredLicense] } });
    wrap(<Credentials />);
    fireEvent.click(await screen.findByRole("button", { name: "Nursing license (RN)" }));
    expect(await screen.findByText("Expired on")).toBeTruthy();
    expect(screen.getByText("On file")).toBeTruthy();
    expect(screen.queryByText("c1")).toBeNull(); // no raw IDs
  });

  it("shows the empty state, and an error with retry", async () => {
    serve({ "GET /api/nurses/me/credentials": { licenseValid: false, credentials: [] } });
    wrap(<Credentials />);
    expect(await screen.findByText("No credentials found")).toBeTruthy();
    expect(screen.getByText("Add your first license or screening.")).toBeTruthy();
    for (const l of screen.getAllByRole("link", { name: /Upload license/ })) expect(l.getAttribute("href")).toBe("/nurse/credentials/new?type=license");
    cleanup();
    qc.clear();
    serve({
      "GET /api/nurses/me/credentials": () => {
        throw new ApiError(500, "Boom");
      },
    });
    wrap(<Credentials />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
