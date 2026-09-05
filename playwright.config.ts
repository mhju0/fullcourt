import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer from 1 to 65535");
}
const EXTERNAL_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/alignment-audit.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial everywhere, not just CI. The suite runs against one `pnpm dev` server, so parallel
  // workers race each other for cold Turbopack compiles rather than for CPU: measured 18 passed
  // in 16.8s serially vs. 26s *and* readiness-gate failures on /schedule at the default worker
  // count. Parallelism here buys nothing and costs correctness.
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // No storageState any more. Every spec used to boot with an onboarding-complete flag in
    // localStorage, because a modal opened over the app on first visit and covered whatever the
    // test was about. The modal was removed on 2026-08-11 — the site now explains itself in
    // place — so the flag, and the coupling of the whole e2e suite to it, went with it.
    trace: "on-first-retry",
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // An explicit URL tests an existing production/preview server. Otherwise start this
  // checkout's dev server; never silently reuse another worktree's process on the port.
  webServer: EXTERNAL_BASE_URL ? undefined : {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
