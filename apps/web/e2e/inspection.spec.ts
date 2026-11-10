import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { MockApi } from "./mock-api";

// Inspection packages (ESCALATION.md Option D) against the mocked API: the inspection endpoints are stubbed here, on top of MockApi
// (later page.route handlers win). Synthetic data only.

const PKG = {
  id: "insp_1", createdByName: "Alex Kim", createdAt: "2026-11-10T10:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", revoked: false, expired: false,
  nurseCount: 1, from: "2026-10-01", to: "2026-10-31", includeDocuments: true, includeTbDocuments: false,
};
const DETAIL = {
  package: PKG,
  nurses: [{
    nurseId: "nurse-1", name: "Maria Lopez", email: "maria.lopez@example.com",
    licenses: [{ licenseType: "RN", number: "RN-12345", issuingState: "FL", expiresOn: "2027-01-01", status: "verified", verifiedByName: "Alex Kim", verifiedAt: "2026-01-02T00:00:00.000Z" }],
    tb: { onFile: true, screenedOn: "2026-05-05", status: "verified" },
  }],
  documents: [{ credentialId: "cred-doc-1", nurseId: "nurse-1", nurseName: "Maria Lopez", type: "license" }],
};

async function stub(page: Page, opts: { detailStatus?: number } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  await page.route("**/api/inspection**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    calls.push({ method: req.method(), path, body: req.postDataJSON() });
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/inspection/nurses") return json(200, { nurses: [{ id: "nurse-1", name: "Maria Lopez", licenseStatus: "verified" }] });
    if (path === "/api/inspection-packages" && req.method() === "POST") return json(201, { package: PKG });
    if (path === "/api/inspection-packages") return json(200, { packages: [PKG] });
    if (path === "/api/inspection-packages/insp_1") return opts.detailStatus === 410 ? json(410, { error: "Inspection package expired" }) : json(200, DETAIL);
    if (path === "/api/inspection-packages/insp_1/revoke") return json(200, { package: { ...PKG, revoked: true } });
    return json(404, { error: "Not found" });
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await MockApi.install(page);
});

test("admin: pick a nurse, attach license documents (TB toggle gated), create, see it listed", async ({ page }) => {
  const calls = await stub(page);
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Inspection" }).click();
  await expect(page.getByRole("heading", { name: "Inspection packages" })).toBeVisible();
  const tb = page.getByLabel(/Attach TB documents/);
  await expect(tb).toBeDisabled();
  await page.getByLabel(/Maria Lopez/).check();
  await page.getByLabel("Attach license documents").check();
  await expect(tb).toBeEnabled();
  await page.getByRole("button", { name: "Create package" }).click();
  await expect(page.getByText("Package ready.")).toBeVisible();
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/inspection-packages")!;
  expect(post.body).toMatchObject({ nurseIds: ["nurse-1"], includeDocuments: true, includeTbDocuments: false });
  await expect(page.getByTestId("inspection-package-table")).toContainText("Alex Kim");
});

test("admin: package view shows the expiry, the summary, a document Open button and no storage details", async ({ page }) => {
  await stub(page);
  await signIn(page, "admin");
  await page.goto("/admin/inspection/insp_1");
  await expect(page.getByTestId("inspection-expiry")).toContainText("Expires in");
  await expect(page.getByTestId("inspection-summary-table")).toContainText("RN-12345");
  await expect(page.getByTestId("inspection-summary-table")).toContainText("On file");
  await expect(page.getByRole("button", { name: /Open License document for Maria Lopez/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/credentials\/|https?:\/\/signed/);
});

test("expired package: a clear message, no data", async ({ page }) => {
  await stub(page, { detailStatus: 410 });
  await signIn(page, "admin");
  await page.goto("/admin/inspection/insp_1");
  await expect(page.getByText("This package has expired")).toBeVisible();
  await expect(page.getByTestId("inspection-summary-table")).toHaveCount(0);
});

test("agency owner sees the Inspection link; a manager does not", async ({ page }) => {
  await stub(page);
  await signIn(page, "agency"); // owner of Sunrise
  await expect(page.getByRole("navigation", { name: "Agency" }).getByRole("link", { name: "Inspection" })).toBeVisible();
});

test("agency manager: no nav link, and the page says owners only", async ({ page }) => {
  await stub(page);
  await signIn(page, "agencyB"); // manager of Metro
  await expect(page.getByRole("navigation", { name: "Agency" }).getByRole("link", { name: "Inspection" })).toHaveCount(0);
  await page.goto("/agency/inspection");
  await expect(page.getByText("Owners only")).toBeVisible();
});
