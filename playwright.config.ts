import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
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
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
