import { defineConfig, devices } from "@playwright/test";
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_STORAGE_VALUE,
} from "./src/lib/onboarding";

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
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [
            {
              name: ONBOARDING_STORAGE_KEY,
              value: ONBOARDING_STORAGE_VALUE,
            },
          ],
        },
      ],
    },
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
