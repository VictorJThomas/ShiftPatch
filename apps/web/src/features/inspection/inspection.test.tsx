import "@/lib/zod-csp";
import type { InspectionCandidate, InspectionPackage } from "@shiftpatch/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session";
import { InspectionPage } from "./InspectionPage";
import { buildRequest, CSV_HEADER, defaultPeriod, expiryText, type FormValues, formError, packageState, periodError, pruneSelection, setIncludeDocuments, toCsv, toggleNurse } from "./model";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
const fetchMock = vi.mocked(apiFetch);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); fetchMock.mockReset(); useSessionStore.setState({ user: null, agencies: [], activeAgencyId: null }); });

const base: FormValues = { from: "2026-10-01", to: "2026-10-31", nurseIds: ["n1"], includeDocuments: false, includeTbDocuments: false };

describe("form logic", () => {
  it("default period is the last 90 days ending today", () => {
    expect(defaultPeriod(new Date("2026-11-10T12:00:00Z"))).toEqual({ from: "2026-08-12", to: "2026-11-10" });
  });
  it("period: order and the 366-day cap (inclusive)", () => {
    expect(periodError("2026-01-01", "2027-01-01")).toBeNull(); // 366 days inclusive
    expect(periodError("2026-01-01", "2027-01-02")).toMatch(/at most 366/);
    expect(periodError("2026-02-01", "2026-01-01")).toMatch(/on or after/);
    expect(periodError("", "2026-01-01")).toMatch(/Choose/);
  });
  it("needs a nurse; TB documents need license documents", () => {
    expect(formError(base)).toBeNull();
    expect(formError({ ...base, nurseIds: [] })).toMatch(/at least one nurse/);
    expect(formError({ ...base, includeTbDocuments: true })).toMatch(/require attaching license/);
    expect(formError({ ...base, nurseIds: Array.from({ length: 201 }, (_, i) => `n${i}`) })).toMatch(/at most 200/);
  });
  it("turning documents off also turns TB off; the request never carries TB without documents", () => {
    const on = setIncludeDocuments({ ...base, includeDocuments: true, includeTbDocuments: true }, false);
    expect(on).toMatchObject({ includeDocuments: false, includeTbDocuments: false });
    expect(buildRequest({ ...base, includeTbDocuments: true })).toMatchObject({ includeDocuments: false, includeTbDocuments: false });
    expect(buildRequest({ ...base, includeDocuments: true, includeTbDocuments: true })).toMatchObject({ includeDocuments: true, includeTbDocuments: true });
  });
  it("toggle and prune the selection", () => {
    expect(toggleNurse(base, "n2").nurseIds).toEqual(["n1", "n2"]);
    expect(toggleNurse(base, "n1").nurseIds).toEqual([]);
    expect(pruneSelection({ ...base, nurseIds: ["n1", "n9"] }, ["n1"]).nurseIds).toEqual(["n1"]);
    expect(pruneSelection(base, ["n1"])).toBe(base);
  });
  it("expiry text and package state", () => {
    const now = new Date("2026-11-10T10:00:00Z");
    expect(expiryText("2026-11-11T10:00:00Z", now)).toBe("Expires in 24 h 0 min");
    expect(expiryText("2026-11-10T10:12:30Z", now)).toBe("Expires in 12 min");
    expect(expiryText("2026-11-10T10:00:20Z", now)).toBe("Expires in under a minute");
    expect(expiryText("2026-11-10T09:59:00Z", now)).toBe("Expired");
    expect(packageState({ revoked: true, expired: true })).toBe("revoked");
    expect(packageState({ revoked: false, expired: true })).toBe("expired");
    expect(packageState({ revoked: false, expired: false })).toBe("active");
  });
});

describe("toCsv", () => {
  const detail = {
    nurses: [
      {
        nurseId: "n1", name: 'Maria "Mari" Lopez', email: "maria@example.com",
        licenses: [{ licenseType: "RN" as const, number: "RN-1", issuingState: "FL", expiresOn: "2027-01-01", status: "verified" as const, verifiedByName: "Alex Kim", verifiedAt: "2026-01-02T00:00:00.000Z" }],
        tb: { onFile: true, screenedOn: "2026-05-05", status: "verified" as const },
      },
      { nurseId: "n2", name: "=cmd|' /C calc'!A0", email: "x@example.com", licenses: [], tb: { onFile: false, screenedOn: null, status: null } },
    ],
  };
  it("header + one row per license, quoting and formula-injection guard, summary columns only", () => {
    const lines = toCsv(detail).trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('"Maria ""Mari"" Lopez",maria@example.com,RN,RN-1,FL,2027-01-01,verified,Alex Kim,2026-01-02T00:00:00.000Z,Yes,2026-05-05,verified');
    expect(lines[2]!.startsWith("'=cmd")).toBe(true);
    expect(lines[2]).toContain(",none,,,No,,");
    expect(toCsv(detail)).not.toMatch(/https?:|credentials\//);
  });
});

const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const CANDS: InspectionCandidate[] = [{ id: "n1", name: "Maria Lopez", licenseStatus: "verified" }, { id: "n2", name: "James Cook", licenseStatus: "expired" }];
const PKG: InspectionPackage = {
  id: "insp_1", createdByName: "Alex Kim", createdAt: "2026-11-10T10:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", revoked: false, expired: false,
  nurseCount: 1, from: "2026-10-01", to: "2026-10-31", includeDocuments: true, includeTbDocuments: false,
};
function route() {
  fetchMock.mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path.startsWith("/api/inspection/nurses")) return { nurses: CANDS };
    if (path === "/api/inspection-packages" && opts?.method === "POST") return { package: PKG };
    if (path === "/api/inspection-packages") return { packages: [] };
    throw new Error(`unexpected ${path}`);
  }) as never);
}
const asAdmin = () => useSessionStore.setState({ user: { id: "a", name: "Alex", role: "admin" } });

describe("InspectionPage", () => {
  it("TB toggle is disabled until documents are on, and warns about privacy", async () => {
    route(); asAdmin();
    render(wrap(<InspectionPage basePath="/admin/inspection" />));
    const tb = screen.getByLabelText(/Attach TB documents/);
    expect((tb as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Attach license documents"));
    expect((tb as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText(/license and health records/)).toBeTruthy();
  });

  it("submits the chosen nurses, period and flags; TB cleared when documents are turned off again", async () => {
    route(); asAdmin();
    render(wrap(<InspectionPage basePath="/admin/inspection" />));
    await screen.findByText("Maria Lopez");
    const submit = screen.getByRole("button", { name: "Create package" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // no nurse yet
    fireEvent.click(screen.getByLabelText(/Maria Lopez/));
    fireEvent.click(screen.getByLabelText("Attach license documents"));
    fireEvent.click(screen.getByLabelText(/Attach TB documents/));
    fireEvent.click(screen.getByLabelText("Attach license documents")); // off again -> TB off
    fireEvent.click(screen.getByLabelText("Attach license documents"));
    expect((screen.getByLabelText(/Attach TB documents/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock.mock.calls.some(([p, o]) => p === "/api/inspection-packages" && (o as { method?: string })?.method === "POST")).toBe(true));
    const [, opts] = fetchMock.mock.calls.find(([p, o]) => p === "/api/inspection-packages" && (o as { method?: string })?.method === "POST")!;
    expect((opts as { body: unknown }).body).toMatchObject({ nurseIds: ["n1"], includeDocuments: true, includeTbDocuments: false });
    await screen.findByText(/Package ready/);
  });

  it("agency manager sees the owners-only message and no form", () => {
    route();
    useSessionStore.setState({ user: { id: "m", name: "M", role: "agency" }, agencies: [{ agencyId: "agency-a", name: "A", role: "manager" }], activeAgencyId: "agency-a" });
    render(wrap(<InspectionPage basePath="/agency/inspection" />));
    expect(screen.getByText("Owners only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create package" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
