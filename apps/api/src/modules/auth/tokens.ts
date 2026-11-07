import { createHash, randomBytes, randomUUID } from "node:crypto";
import { UserRole } from "@shiftpatch/contracts";
import { jwtVerify, SignJWT } from "jose";

export type Role = "nurse" | "agency" | "admin";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // sliding: every rotation starts a new 7 days
export const REFRESH_COOKIE = "sp_refresh";

// ponytail: read per call, not at boot, so /api/health still serves on a deploy missing the secret (auth returns 500).
function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || Buffer.byteLength(s) < 32) throw new Error("JWT_SECRET must be set to at least 32 bytes");
  return new TextEncoder().encode(s);
}
export const assertJwtConfigured = () => void secret();

/** HS256 access token. Claims: sub, role, jti (+ iat/exp). 15 minutes. */
export function signAccessToken(user: { id: string; role: Role }) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret());
}

/** Throws on a bad signature, wrong alg, expiry or missing claims. Status/membership checks belong to `authenticate`. */
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
  const role = UserRole.safeParse(payload.role);
  if (typeof payload.sub !== "string" || typeof payload.jti !== "string" || !role.success) throw new Error("Invalid token claims");
  return { sub: payload.sub, role: role.data, jti: payload.jti };
}

/** Opaque 256-bit refresh token. Only its SHA-256 hash is stored. */
export const newRefreshToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
