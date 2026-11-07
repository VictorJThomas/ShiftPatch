import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { MockApi } from "./mock-api";

// Security headers from next.config.ts on the production build, and the CSP must not be violated by our own code,
// including caught probes (e.g. zod's `new Function` JIT check): they still fire `securitypolicyviolation` events.
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`));
  });
  return () => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

test("pages carry the security headers", async ({ page }) => {
  const res = await page.goto("/login");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval"); // production build only
  expect(h["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("sign-in and a signed-in shell run under the CSP with zero violations", async ({ page }) => {
  await MockApi.install(page);
  const violations = await recordViolations(page);
  await signIn(page, "agency"); // login + /api/me responses are zod-parsed client-side; the agency shell hydrates
  await expect(page.getByRole("heading", { level: 1, name: "Shifts" })).toBeVisible();
  expect(await violations()).toEqual([]);
});
