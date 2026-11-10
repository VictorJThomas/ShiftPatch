import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { MockApi } from "./mock-api";

// Marketplace date range + credential "View file" preview, on the production build and its CSP (zero violations).
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

// 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("nurse: Start/End date range filters the marketplace inclusively; a backwards range shows an inline error", async ({ page }) => {
  await MockApi.install(page);
  const violations = await recordViolations(page);
  await signIn(page, "nurse");
  const items = page.getByTestId("shift-list-item");
  await expect(items).toHaveCount(2); // seed: shift-1 (Oct 2) and shift-3 (Oct 4) are open
  await page.getByRole("button", { name: /^Filters/ }).click();
  const panel = page.getByRole("dialog", { name: "Filters" });
  await panel.getByLabel("Start date").fill("2026-10-03");
  await expect(items).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Filters, 1 active" })).toBeVisible();
  await panel.getByLabel("End date").fill("2026-10-02");
  await expect(panel.getByText("End date must be on or after the start date")).toBeVisible();
  await expect(items).toHaveCount(2); // not applied while invalid
  await panel.getByLabel("End date").fill("2026-10-04");
  await expect(items).toHaveCount(1);
  await panel.getByRole("button", { name: "Reset" }).click();
  await expect(items).toHaveCount(2);
  expect(await violations()).toEqual([]);
});

test("nurse: View file previews the credential in a dialog with Download, under the CSP", async ({ page }) => {
  await MockApi.install(page);
  let fetched = 0;
  await page.route("**/mock-r2/**", (route) => {
    fetched++;
    return route.fulfill({ status: 200, body: PNG, headers: { "content-type": "image/png", "content-disposition": 'attachment; filename="credential.png"' } });
  });
  const violations = await recordViolations(page);
  await signIn(page, "nurse");
  await page.goto("/nurse/credentials");
  await page.getByRole("button", { name: "Nursing license (RN)" }).first().click();
  await page.getByRole("button", { name: "View Nursing license (RN)" }).click();
  const dlg = page.getByTestId("credential-preview-dialog");
  await expect(dlg.getByRole("img", { name: "Nursing license (RN), document preview" })).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Download Nursing license (RN)" })).toBeVisible();
  const download = page.waitForEvent("download");
  await dlg.getByRole("button", { name: "Download Nursing license (RN)" }).click();
  expect((await download).suggestedFilename()).toBe("credential.png");
  expect(fetched).toBe(1); // Download reused the loaded bytes
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View Nursing license (RN)" })).toBeFocused(); // focus returns to the opener
  expect(await violations()).toEqual([]);
});
