import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Unit tests only (`pnpm test`); Playwright specs live in e2e/ and run with `pnpm test:e2e`.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: src("./src/") },
      // Workspace package: read the TS source so tests don't need a contracts build.
      { find: "@shiftpatch/contracts", replacement: src("../../packages/contracts/src/index.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
