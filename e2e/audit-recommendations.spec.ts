import { test, expect } from "@playwright/test";
import { releaseDates, releaseGame } from "./fixtures/release-data";

for (const width of [390, 1440]) {
  test(`Games explains its status and score units at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/games/**", async route => {
      const url = new URL(route.request().url());
      const data = url.pathname.endsWith("/dates")
        ? releaseDates("2024-25")
        : url.pathname.endsWith("/upcoming") ? [] : [releaseGame("2024-12-25")];
      await route.fulfill({ json: { data, error: null } });
    });
    await page.goto("/games?season=2024-25&date=2024-12-25");
    await expect(page.getByText("Checked", { exact: true })).toBeVisible();
    await page.getByText("About rest advantage and game status", { exact: true }).click();
    await expect(page.getByText(/Scores are final-only\. LIVE is estimated/)).toBeVisible();
    await page.getByText("How to read the board", { exact: true }).click();
    const guide = page.locator("details").filter({ hasText: "How to read the board" });
    await expect(guide).toContainText("Higher means more estimated schedule load");
    await expect(guide).toContainText("the model applies a time-zone adjustment");
    await expect(guide).not.toContainText("won");
    await expect(guide.getByRole("link", { name: "Model Results" })).toHaveAttribute("href", "/analysis");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const palette = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return ["--term-bg", "--term-surface", "--term-surface-2"].map(name => css.getPropertyValue(name).trim().toUpperCase());
    });
    expect(palette).toEqual(["#F3F8FC", "#FBFDFF", "#EAF2F8"]);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#F3F8FC");
  });
}

test("Methods scopes uncertainty styling to the study legend", async ({ page }) => {
  await page.goto("/behind-the-data");
  await expect(page.getByText(/Where a study uses uncertainty styling/)).toBeVisible();
  await expect(page.getByText("Muted differences have not cleared", { exact: false })).toHaveCount(0);
});

test("Home keeps final findings visible with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Rest is a stat/ })).toBeVisible();
  await expect(page.getByText(/fatigue-score points/)).toBeVisible();
  const motion = await page.locator("main header").first().evaluate(el => getComputedStyle(el).animationName);
  expect(motion).toBe("none");
});
