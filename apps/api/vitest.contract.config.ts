import { defineConfig } from "vitest/config";

// `pnpm test:contract`: the 6 required routes against a throwaway seeded Postgres (Fastify inject).
export default defineConfig({
  test: { include: ["src/**/*.contract.test.ts"], fileParallelism: false },
});
