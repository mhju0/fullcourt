import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "release-smoke.spec.ts",
  forbidOnly: !!process.env.CI, workers: 1, retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-smoke-report", open: "never" }]],
  outputDir: "test-results/smoke",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "phone-reduced", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, contextOptions: { reducedMotion: "reduce" } } },
  ],
  webServer: { command: "node node_modules/tsx/dist/cli.mjs scripts/tests/release-fixture-server.ts",
    url: "http://127.0.0.1:3100/games", reuseExistingServer: false, timeout: 60_000 },
});
