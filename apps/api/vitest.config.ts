import { configDefaults, defineConfig } from "vitest/config";

// `pnpm test`: unit + integration. Contract tests run separately via `pnpm test:contract`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.contract.test.ts"] },
});
