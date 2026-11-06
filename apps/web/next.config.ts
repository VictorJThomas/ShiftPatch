import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Pin the monorepo root: Turbopack root inference breaks in the nested OneDrive folder.
const root = fileURLToPath(new URL("../..", import.meta.url));

const config: NextConfig = {
  outputFileTracingRoot: root,
  turbopack: { root },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN ?? "http://localhost:3001"}/api/:path*` }];
  },
};

export default config;
