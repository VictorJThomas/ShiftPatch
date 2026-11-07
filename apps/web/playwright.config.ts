import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Chromium only. The API is mocked per test with page.route, so the specs are deterministic and need no backend.
// First run on a machine: `npx playwright install chromium`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // memory-constrained machine: one worker
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `build` also builds @shiftpatch/contracts first; `start` serves the production bundle (proxy.ts included).
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
