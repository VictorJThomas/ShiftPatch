import { configDefaults, defineConfig } from "vitest/config";

// `pnpm test`: unit + integration. Contract tests run separately via `pnpm test:contract`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/*.contract.test.ts"],
    env: { JWT_SECRET: "test-only-secret-0123456789abcdef0123456789" }, // not a real secret
  },
});
