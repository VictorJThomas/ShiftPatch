/** Role -> home route + path prefix. Shared by the proxy (edge), layouts and the login flow: no imports on purpose. */
export type Role = "nurse" | "agency" | "admin";

export const ROLES: readonly Role[] = ["nurse", "agency", "admin"];

export const HOME_BY_ROLE: Record<Role, string> = {
  nurse: "/nurse/shifts",
  agency: "/agency/shifts",
  admin: "/admin/dashboard",
};

export const PREFIX_BY_ROLE: Record<Role, string> = {
  nurse: "/nurse",
  agency: "/agency",
  admin: "/admin",
};

export const LOGIN_PATH = "/login";

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

/** Which role's area a pathname belongs to, or null for public paths. */
export function roleForPath(pathname: string): Role | null {
  for (const role of ROLES) {
    const prefix = PREFIX_BY_ROLE[role];
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return role;
  }
  return null;
}
