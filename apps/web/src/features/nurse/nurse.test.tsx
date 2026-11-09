import "@/lib/zod-csp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CREDENTIAL_MAX_BYTES, type Shift } from "@shiftpatch/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useToastStore } from "@/stores/toasts";
import { Credentials } from "./Credentials";
import { Marketplace, pickShiftSource } from "./Marketplace";
import { MyShifts } from "./MyShifts";
import { ShiftCard } from "./ShiftCard";
import { fileProblem, UploadCredentialForm } from "./UploadCredentialDialog";

vi.mock("@/lib/api-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-client")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
// The AppBar avatar (AccountMenu) uses the app router for sign-out.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/nurse" }));

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
    expect(screen.getByRole("link", { name: /Upload renewed license/ }).getAttribute("href")).toBe("/nurse/credentials");
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

  it("filters the fallback list from the open source (no matchable param)", async () => {
    marketplace([], [shift1, shift3], false, { "GET /api/shifts?role=RN&status=open": { shifts: [shift1, shift3] } });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    fireEvent.click(screen.getByRole("button", { name: "RN 2" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/shifts?role=RN&status=open", expect.anything()));
    expect(await screen.findByText("2 open shifts")).toBeTruthy();
  });
});

describe("Marketplace filters", () => {
  it("filters server-side by role (params in the request) and clears filters", async () => {
    marketplace([shift1, shift3], [shift1, shift3], true, {
      "GET /api/shifts?matchable=true&role=LPN&status=open": { shifts: [] },
      "GET /api/shifts?matchable=true&role=RN&status=open": { shifts: [shift1, shift3] },
    });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    expect(screen.getByRole("group", { name: "Date" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Role" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "LPN 0" }));
    expect(await screen.findByText("No open shifts match")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/shifts?matchable=true&role=LPN&status=open", expect.anything());
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(screen.getAllByTestId("shift-list-item")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "RN 2" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/shifts?matchable=true&role=RN&status=open", expect.anything()));
    expect(await screen.findByText("2 shifts you can take")).toBeTruthy();
  });

  it("filters by date server-side and keeps chip counts from the unfiltered data", async () => {
    marketplace([shift1, shift3], [shift1, shift3], true, { "GET /api/shifts?matchable=true&date=2026-10-04&status=open": { shifts: [shift3] } });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    fireEvent.click(screen.getByRole("button", { name: /Sun, Oct 4/ }));
    await waitFor(() => expect(screen.getAllByTestId("shift-list-item")).toHaveLength(1));
    expect(screen.getByText("1 shift you can take")).toBeTruthy();
    expect(screen.getByRole("button", { name: "All dates 2" })).toBeTruthy();
  });

  it("shows an error with retry when the filtered request fails", async () => {
    marketplace([shift1], [shift1], true, {
      "GET /api/shifts?matchable=true&role=RN&status=open": () => {
        throw new ApiError(500, "Boom");
      },
    });
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    fireEvent.click(screen.getByRole("button", { name: "RN 1" }));
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

describe("Credential upload (strip + modal)", () => {
  const pdf = (name = "license.pdf", type = "application/pdf") => new File(["%PDF-1.7"], name, { type });
  const submitBtn = () => screen.getByRole("button", { name: "Add credential" }) as HTMLButtonElement;

  it("has both spec inputs on the strip, once each, and no modal until Continue", () => {
    serve({});
    wrap(<UploadCredentialForm />);
    const file = screen.getByTestId("credential-upload-input");
    expect(file.getAttribute("accept")).toContain("application/pdf");
    expect(file.hasAttribute("capture")).toBe(false);
    expect(screen.getAllByTestId("credential-expiry-date-input")).toHaveLength(1);
    expect(screen.getByTestId("credential-expiry-date-input").getAttribute("type")).toBe("date");
    expect(screen.queryByLabelText(/Credential type/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByLabelText(/Credential type/)).toBeTruthy();
    expect(screen.getAllByTestId("credential-upload-input")).toHaveLength(1);
  });

  it("keeps submit disabled until a file and (for a license) an expiry date are set, and shows a summary", async () => {
    serve({});
    wrap(<UploadCredentialForm />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(submitBtn().disabled).toBe(true);
    expect(screen.getByText(/Still needed: a valid file, an expiry date/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [pdf()] } });
    await screen.findByText(/license\.pdf · /);
    expect(submitBtn().disabled).toBe(true);
    expect(screen.getByText("Not set")).toBeTruthy();
    fireEvent.change(screen.getByTestId("credential-expiry-date-input"), { target: { value: "2028-01-01" } });
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
    expect(screen.getByText("Sat, Jan 1, 2028")).toBeTruthy(); // read-only summary of the strip value
    // way back: the modal closes, the strip keeps the values
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByLabelText(/Credential type/)).toBeNull();
    expect((screen.getByTestId("credential-expiry-date-input") as HTMLInputElement).value).toBe("2028-01-01");
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MB and an unsupported type before uploading", async () => {
    const big = pdf();
    Object.defineProperty(big, "size", { value: CREDENTIAL_MAX_BYTES + 1 });
    expect(fileProblem(big)).toBe("File is larger than 10 MB");
    expect(fileProblem(pdf("notes.txt", "text/plain"))).toMatch(/^Unsupported file type/);
    expect(fileProblem(pdf("scan.HEIC", ""))).toBeNull();

    serve({});
    wrap(<UploadCredentialForm />);
    fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [big] } });
    fireEvent.change(screen.getByTestId("credential-expiry-date-input"), { target: { value: "2028-01-01" } });
    expect(await screen.findByText("File is larger than 10 MB")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(submitBtn().disabled).toBe(true);
    expect(api).not.toHaveBeenCalled();
  });

  it("sends multipart FormData with the file and license fields, toasts type + expiry, then resets", async () => {
    let sent: FormData | undefined;
    serve({
      "POST /api/nurses/me/credentials": (opts: { body?: unknown } | undefined) => {
        sent = opts?.body as FormData;
        return { credential: {} };
      },
    });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    wrap(<UploadCredentialForm />);
    fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [pdf()] } });
    fireEvent.change(screen.getByTestId("credential-expiry-date-input"), { target: { value: "2028-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/License type/), { target: { value: "RN" } });
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
    fireEvent.click(submitBtn());
    await waitFor(() => expect(toasts()[0]?.title).toBe("Credential submitted"));
    expect(toasts()[0]?.message).toContain("Nursing license (RN)");
    expect(toasts()[0]?.message).toContain("expires Sat, Jan 1, 2028");
    expect(toasts()[0]?.kind).toBe("success");
    await waitFor(() => expect((screen.getByTestId("credential-expiry-date-input") as HTMLInputElement).value).toBe(""));
    expect(screen.queryByLabelText(/Credential type/)).toBeNull(); // modal closed
    expect(sent).toBeInstanceOf(FormData);
    expect(sent!.get("type")).toBe("license");
    expect(sent!.get("licenseType")).toBe("RN");
    expect(sent!.get("expiresOn")).toBe("2028-01-01");
    expect(sent!.has("screenedOn")).toBe(false);
    expect((sent!.get("file") as File).name).toBe("license.pdf");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["nurse", "credentials"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shifts"] });
  });

  it("mounts the TB screening date only for a TB credential (expiry optional) and requires it", async () => {
    serve({});
    wrap(<UploadCredentialForm preset={{ type: "tb_screening" }} />);
    expect(screen.getByTestId("credential-expiry-date-input").hasAttribute("required")).toBe(false);
    expect(document.activeElement).toBe(screen.getByTestId("credential-upload-input")); // preset moves focus to the strip
    fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [pdf()] } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByLabelText(/Screening date/)).toBeTruthy();
    expect(screen.queryByLabelText(/License type/)).toBeNull();
    await waitFor(() => expect(screen.getByText(/Still needed: the screening date/)).toBeTruthy());
    expect(submitBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Screening date/), { target: { value: "2026-09-01" } });
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
    // switching the type unmounts the TB field
    fireEvent.change(screen.getByLabelText(/Credential type/), { target: { value: "other" } });
    expect(screen.queryByLabelText(/Screening date/)).toBeNull();
  });
});

describe("Credentials list", () => {
  const expiredLicense = { id: "c1", type: "license", licenseType: "RN", status: "verified", expiresOn: "2026-06-01", screenedOn: null, uploadedAt: "2025-06-01T10:00:00.000Z", expired: true, hasFile: true };

  it("shows expired status, the license call to action and the strip from load", async () => {
    serve({ "GET /api/nurses/me/credentials": { licenseValid: false, credentials: [expiredLicense] } });
    wrap(<Credentials />);
    expect(screen.getAllByTestId("credential-upload-input")).toHaveLength(1); // on the page before data arrives
    expect(await screen.findByText("Nursing license (RN)")).toBeTruthy();
    expect(screen.getByText("Expired", { selector: ".badge" })).toBeTruthy();
    expect(screen.getByText("Your license has expired.")).toBeTruthy();
    expect(screen.getAllByTestId("credential-upload-input")).toHaveLength(1);
    expect(screen.getAllByTestId("credential-expiry-date-input")).toHaveLength(1);
    // "Upload renewal" presets the strip and moves focus into it.
    fireEvent.click(screen.getByRole("button", { name: /Upload renewal/ }));
    expect(document.activeElement).toBe(screen.getByTestId("credential-upload-input"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect((screen.getByLabelText(/Credential type/) as HTMLSelectElement).value).toBe("license");
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
