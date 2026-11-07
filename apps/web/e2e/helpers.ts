import { expect, type Page } from "@playwright/test";
import { USERS, type UserKey } from "./mock-api";

export const HOME = { nurse: "/nurse/shifts", agency: "/agency/shifts", admin: "/admin/dashboard" } as const;
export const homeFor = (key: UserKey) => HOME[USERS[key].user.role];

export async function signIn(page: Page, key: UserKey) {
  await page.goto("/login");
  await page.getByTestId("login-email-input").fill(USERS[key].email);
  await page.getByTestId("login-password-input").fill(USERS[key].password);
  await page.getByTestId("login-submit-button").click();
  await expect(page).toHaveURL(new RegExp(`${homeFor(key)}$`));
}

export const roleCookie = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "sp_role");

export const banner = (page: Page) => page.getByTestId("notification-banner");
