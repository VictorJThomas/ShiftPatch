import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Pin the monorepo root: Turbopack root inference breaks in the nested OneDrive folder.
const root = fileURLToPath(new URL("../..", import.meta.url));

// Security headers (ARCHITECTURE §13, Browser <-> Vercel). Static CSP, no nonce: Next inlines its bootstrap scripts, so
// script-src needs 'unsafe-inline' (a nonce would force every page dynamic). Everything else is same-origin only: the API
// is reached through the /api rewrite below, and next/font self-hosts the font files. Dev (React refresh) also needs eval.
const dev = process.env.NODE_ENV !== "production";
// Credential preview (CredentialViewButton) fetches the signed file straight from object storage, so connect-src must name
// that one origin (R2 `https://<account>.r2.cloudflarestorage.com`, MinIO `http://localhost:9000`). Unset = no preview
// fetch (the dialog shows an error; Download still works by navigation). Parsed so only a bare origin can reach the header.
const storageOrigin = process.env.CREDENTIAL_STORAGE_ORIGIN ? new URL(process.env.CREDENTIAL_STORAGE_ORIGIN).origin : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${storageOrigin ? ` ${storageOrigin}` : ""}`,
  // The preview frames a PDF from a same-origin blob: URL built from bytes whose type was checked (lib/credential-file.ts).
  "frame-src blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  outputFileTracingRoot: root,
  turbopack: { root },
  // Workspace package ships TS source under the "development" export condition.
  transpilePackages: ["@shiftpatch/contracts"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN ?? "http://localhost:3001"}/api/:path*` }];
  },
};

export default config;
