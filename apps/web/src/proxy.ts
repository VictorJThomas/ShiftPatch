import { NextResponse, type NextRequest } from "next/server";
import { ROLE_COOKIE } from "@/lib/role-cookie";
import { HOME_BY_ROLE, LOGIN_PATH, isRole, roleForPath } from "@/lib/routes";

/**
 * UX-only routing hint (Next 16 `proxy`, formerly `middleware`): avoids a flash of the wrong area using the
 * non-sensitive `sp_role` cookie. It is NOT authorization. A forged cookie only opens an empty shell:
 * the API (bearer token + role/agency policies) is the security boundary, and the layouts re-check client-side.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const raw = request.cookies.get(ROLE_COOKIE)?.value;
  const role = isRole(raw) ? raw : null;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(role ? HOME_BY_ROLE[role] : LOGIN_PATH, request.url));
  }

  const area = roleForPath(pathname);
  if (!area) return NextResponse.next();
  if (!role) return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  if (role !== area) return NextResponse.redirect(new URL(HOME_BY_ROLE[role], request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/nurse/:path*", "/agency/:path*", "/admin/:path*"],
};
