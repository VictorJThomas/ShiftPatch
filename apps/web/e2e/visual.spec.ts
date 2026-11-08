import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { MockApi, USERS } from "./mock-api";

// Visual review artifacts for humans. Written to the OS temp dir on purpose: never committed.
const dir = process.env.SP_SHOT_DIR ?? join(tmpdir(), "shiftpatch-web-shots");
mkdirSync(dir, { recursive: true });
const shot = (name: string) => join(dir, `${name}.png`);

test.describe("screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await MockApi.install(page);
  });

  for (const [label, size] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 844 }],
  ] as const) {
    test(`login ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/login");
      await expect(page.getByTestId("login-submit-button")).toBeVisible();
      await page.screenshot({ path: shot(`login-${label}`) });

      await page.getByTestId("login-email-input").fill(USERS.nurse.email);
      await page.getByTestId("login-password-input").fill("wrongpassword");
      await page.getByTestId("login-submit-button").click();
      await expect(page.getByTestId("notification-banner")).toBeVisible();
      await page.screenshot({ path: shot(`login-${label}-error`) });
    });
  }

  test("shells per role", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "nurse");
    await expect(page.getByRole("heading", { level: 1, name: "Available shifts" })).toBeVisible();
    await page.screenshot({ path: shot("shell-nurse-mobile") });

    await page.setViewportSize({ width: 1280, height: 844 });
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
    // The profile row, not the rail icon (both are labelled "Sign out" at >= 1000 px).
    await page.locator("#main").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, "multi");
    await page.getByRole("button", { name: /switch agency/i }).click();
    await page.getByRole("option", { name: /Sunrise/ }).click();
    await expect(page.getByTestId("agency-shift-count")).toBeVisible();
    await page.getByRole("button", { name: /switch agency/i }).click();
    await page.screenshot({ path: shot("shell-agency-desktop-switcher") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: shot("shell-agency-mobile") });
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, "admin");
    await expect(page.getByRole("heading", { level: 1, name: "Coverage" })).toBeVisible();
    await page.screenshot({ path: shot("shell-admin-desktop") });
  });
});
