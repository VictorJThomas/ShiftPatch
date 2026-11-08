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
import { fileProblem, UploadCredentialDialog } from "./UploadCredentialDialog";

vi.mock("@/lib/api-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-client")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

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

  it("filters by role chip and clears filters", async () => {
    marketplace([shift1, shift3], [shift1, shift3], true);
    wrap(<Marketplace />);
    await screen.findAllByTestId("shift-list-item");
    fireEvent.click(screen.getByRole("button", { name: "LPN 0" }));
    expect(screen.getByText("No open shifts match")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(screen.getAllByTestId("shift-list-item")).toHaveLength(2);
  });
});

describe("My shifts cancel", () => {
  it("posts an advance cancellation in one click and explains the effect", async () => {
    serve({
      "GET /api/nurses/me/shifts": { shifts: [shift2] },
      "POST /api/shifts/shift-2/cancel": { ...shift2, status: "open", claimedBy: null },
    });
    wrap(<MyShifts />);
    fireEvent.click(await screen.findByTestId("shift-cancel-button"));
    expect(screen.getByText(/reopens for other nurses/)).toBeTruthy();
    await waitFor(() => expect(toasts()[0]?.title).toBe("Shift cancelled"));
    expect(api).toHaveBeenCalledWith("/api/shifts/shift-2/cancel", expect.objectContaining({ method: "POST", body: { reason: "advance" } }));
  });
});

describe("Credential upload", () => {
  const pdf = (name = "license.pdf", type = "application/pdf") => new File(["%PDF-1.7"], name, { type });

  it("has both spec inputs and requires an expiry date for a license", async () => {
    serve({});
    wrap(<UploadCredentialDialog open onClose={() => {}} />);
    const file = screen.getByTestId("credential-upload-input");
    expect(file.getAttribute("accept")).toContain("application/pdf");
    expect(file.hasAttribute("capture")).toBe(false);
    expect(screen.getByTestId("credential-expiry-date-input").getAttribute("type")).toBe("date");
    fireEvent.change(file, { target: { files: [pdf()] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Expiry date is required for a license")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MB and an unsupported type before uploading", async () => {
    const big = pdf();
    Object.defineProperty(big, "size", { value: CREDENTIAL_MAX_BYTES + 1 });
    expect(fileProblem(big)).toBe("File is larger than 10 MB");
    expect(fileProblem(pdf("notes.txt", "text/plain"))).toMatch(/^Unsupported file type/);
    expect(fileProblem(pdf("scan.HEIC", ""))).toBeNull();

    serve({});
    wrap(<UploadCredentialDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [big] } });
    fireEvent.change(screen.getByTestId("credential-expiry-date-input"), { target: { value: "2028-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("File is larger than 10 MB")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it("sends multipart FormData with the file and the license fields, then closes", async () => {
    let sent: FormData | undefined;
    serve({
      "POST /api/nurses/me/credentials": (opts: { body?: unknown } | undefined) => {
        sent = opts?.body as FormData;
        return { credential: {} };
      },
    });
    const onClose = vi.fn();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    wrap(<UploadCredentialDialog open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/License type/), { target: { value: "RN" } });
    fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [pdf()] } });
    fireEvent.change(screen.getByTestId("credential-expiry-date-input"), { target: { value: "2028-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent).toBeInstanceOf(FormData);
    expect(sent!.get("type")).toBe("license");
    expect(sent!.get("licenseType")).toBe("RN");
    expect(sent!.get("expiresOn")).toBe("2028-01-01");
    expect(sent!.has("screenedOn")).toBe(false);
    expect((sent!.get("file") as File).name).toBe("license.pdf");
    expect(toasts()[0]?.title).toBe("Credential uploaded");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["nurse", "credentials"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shifts"] });
  });

  it("shows TB screening date instead of expiry for a TB upload", async () => {
    serve({});
    wrap(<UploadCredentialDialog open initialType="tb_screening" onClose={() => {}} />);
    expect(screen.queryByTestId("credential-expiry-date-input")).toBeNull();
    fireEvent.change(screen.getByTestId("credential-upload-input"), { target: { files: [pdf()] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Screening date is required for a TB screening")).toBeTruthy();
  });
});

describe("Credentials list", () => {
  it("shows expired status and the license call to action", async () => {
    serve({
      "GET /api/nurses/me/credentials": {
        licenseValid: false,
        credentials: [
          { id: "c1", type: "license", licenseType: "RN", status: "verified", expiresOn: "2026-06-01", screenedOn: null, uploadedAt: "2025-06-01T10:00:00.000Z", expired: true, hasFile: true },
        ],
      },
    });
    wrap(<Credentials />);
    expect(await screen.findByText("Nursing license (RN)")).toBeTruthy();
    expect(screen.getByText("Expired", { selector: ".badge" })).toBeTruthy();
    expect(screen.getByText("Your license has expired.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Upload renewal/ }));
    expect(screen.getByRole("dialog", { name: "Upload credential" })).toBeTruthy();
  });
});
