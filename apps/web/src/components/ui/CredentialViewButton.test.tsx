import "@/lib/zod-csp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorMessage } from "@shiftpatch/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { previewKind, sniffCredentialFile } from "@/lib/credential-file";
import { useToastStore } from "@/stores/toasts";
import { CredentialViewButton } from "./CredentialViewButton";

vi.mock("@/lib/api-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-client")>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

const PDF = new TextEncoder().encode("%PDF-1.4\n...");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0]);
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

const LABEL = "Nursing license (RN)";
const signed = (n: number) => ({ url: `https://storage.example/private-credentials/c1?sig=${n}`, expiresAt: "2026-11-10T12:05:00.000Z" });

let qc: QueryClient;
let storage: ReturnType<typeof vi.fn>;
let created: Blob[];
let revoked: string[];

/** Storage answers: bytes = 200 with that body, a number = that HTTP status, an Error = network/CORS failure. */
function storageAnswers(...answers: (Uint8Array | number | Error)[]) {
  storage = vi.fn(async () => {
    const a = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (a instanceof Error) throw a;
    if (typeof a === "number") return { ok: false, status: a, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, arrayBuffer: async () => a.slice().buffer };
  });
  vi.stubGlobal("fetch", storage);
}

function linkAnswers() {
  let n = 0;
  api.mockImplementation(async () => signed(++n));
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  created = [];
  revoked = [];
  let i = 0;
  URL.createObjectURL = vi.fn((b: Blob) => {
    created.push(b);
    return `blob:http://localhost/obj-${++i}`;
  });
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  linkAnswers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  act(() => useToastStore.getState().clear());
});

const open = async () => {
  render(
    <QueryClientProvider client={qc}>
      <CredentialViewButton credentialId="c1" label={LABEL} />
    </QueryClientProvider>,
  );
  expect(api).not.toHaveBeenCalled(); // never in advance: each link is an audit row
  fireEvent.click(screen.getByRole("button", { name: `View ${LABEL}` }));
  return screen.findByRole("dialog", { name: LABEL });
};

describe("sniffCredentialFile / previewKind", () => {
  it("trusts magic bytes only and renders PDF/JPEG/PNG, never HEIC or anything else", () => {
    expect([PDF, PNG, JPEG, HEIC, HTML].map(sniffCredentialFile)).toEqual(["application/pdf", "image/png", "image/jpeg", "image/heic", null]);
    expect(previewKind("application/pdf", true)).toBe("pdf");
    expect(previewKind("application/pdf", false)).toBe("none");
    expect(previewKind("image/jpeg", true)).toBe("image");
    expect(previewKind("image/heic", true)).toBe("none");
    expect(previewKind(null, true)).toBe("none");
  });
});

describe("CredentialViewButton (View file dialog)", () => {
  it("opens a dialog, shows loading, then the image preview with a Download button", async () => {
    let release: () => void = () => {};
    storage = vi.fn(() => new Promise((r) => (release = () => r({ ok: true, status: 200, arrayBuffer: async () => PNG.slice().buffer }))));
    vi.stubGlobal("fetch", storage);
    const dlg = await open();
    expect(await within(dlg).findByText("Loading document…")).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: `Download ${LABEL}` })).toBeTruthy(); // usable while loading too
    await act(async () => release());
    const img = await within(dlg).findByRole("img", { name: `${LABEL}, document preview` });
    expect(img.getAttribute("src")).toBe("blob:http://localhost/obj-1");
    expect(created[0]?.type).toBe("image/png"); // typed from the sniffed bytes
    expect(api).toHaveBeenCalledWith("/api/credentials/c1/download-url", expect.objectContaining({ schema: expect.anything() }));
    expect(storage).toHaveBeenCalledWith(signed(1).url, expect.objectContaining({ credentials: "omit", cache: "no-store" }));
  });

  it("frames a PDF with an accessible title, and revokes the blob URL on close", async () => {
    storageAnswers(PDF);
    const dlg = await open();
    const frame = await within(dlg).findByTitle(`${LABEL}, document preview`);
    expect(frame.tagName).toBe("IFRAME");
    expect(created[0]?.type).toBe("application/pdf");
    fireEvent.click(within(dlg).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(revoked).toContain(frame.getAttribute("src"));
  });

  it("Download inside the dialog saves the loaded bytes as credential.<ext> without a second link", async () => {
    storageAnswers(PDF);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("credential.pdf");
    });
    const dlg = await open();
    await within(dlg).findByTitle(`${LABEL}, document preview`);
    fireEvent.click(within(dlg).getByRole("button", { name: `Download ${LABEL}` }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(created.at(-1)?.type).toBe("application/octet-stream"); // saved, never rendered
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("HEIC: 'Preview not available' with Download still there", async () => {
    storageAnswers(HEIC);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const dlg = await open();
    expect(await within(dlg).findByText("Preview not available for this file type")).toBeTruthy();
    expect(within(dlg).queryByRole("img")).toBeNull();
    expect(created).toHaveLength(0); // nothing rendered from the bytes
    fireEvent.click(within(dlg).getByRole("button", { name: `Download ${LABEL}` }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("an unknown file type is never rendered (no blob URL with an untrusted type)", async () => {
    storageAnswers(HTML);
    const dlg = await open();
    expect(await within(dlg).findByText("Preview not available for this file type")).toBeTruthy();
    expect(created).toHaveLength(0);
  });

  it("a PDF in a browser without an inline PDF viewer falls back to Download", async () => {
    vi.stubGlobal("navigator", { ...navigator, pdfViewerEnabled: false });
    storageAnswers(PDF);
    const dlg = await open();
    expect(await within(dlg).findByText("Preview not available on this device")).toBeTruthy();
    expect(within(dlg).queryByTitle(`${LABEL}, document preview`)).toBeNull();
  });

  it("expired link: explains it, and Retry requests a new link", async () => {
    storageAnswers(403, JPEG);
    const dlg = await open();
    const alert = await within(dlg).findByRole("alert");
    expect(alert.textContent).toContain("The secure link expired");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await within(dlg).findByRole("img", { name: `${LABEL}, document preview` })).toBeTruthy();
    expect(api).toHaveBeenCalledTimes(2); // a fresh signed link, not the expired one
    expect(storage).toHaveBeenLastCalledWith(signed(2).url, expect.anything());
  });

  it("shows the API's error verbatim, and a storage it cannot reach as its own message", async () => {
    api.mockImplementation(() => Promise.reject(new ApiError(404, ErrorMessage.notFound)));
    storageAnswers(PDF);
    const dlg = await open();
    expect((await within(dlg).findByRole("alert")).textContent).toContain(ErrorMessage.notFound);
    expect(storage).not.toHaveBeenCalled();

    cleanup();
    api.mockClear();
    linkAnswers();
    storageAnswers(new TypeError("Failed to fetch")); // CORS / CSP / offline
    const dlg2 = await open();
    expect((await within(dlg2).findByRole("alert")).textContent).toContain("couldn't be reached from this browser");
    expect(within(dlg2).getByRole("button", { name: `Download ${LABEL}` })).toBeTruthy();
  });

  it("re-opening fetches a new link (no cached document bytes)", async () => {
    storageAnswers(PNG);
    let dlg = await open();
    await within(dlg).findByRole("img");
    fireEvent.click(within(dlg).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: `View ${LABEL}` }));
    dlg = await screen.findByRole("dialog", { name: LABEL });
    await within(dlg).findByRole("img");
    expect(api).toHaveBeenCalledTimes(2);
  });
});
