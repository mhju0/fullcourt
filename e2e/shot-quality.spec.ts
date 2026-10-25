import { expect, test } from "@playwright/test";
import type { ShotQualityResponse } from "../src/types";

test.describe("Shot Quality page", () => {
  test("renders the terminal heading and eyebrow label", async ({ page }) => {
    await page.goto("/shot-quality");

    // Heading + eyebrow render server-side in the page wrapper, independent
    // of ShotQualityContentLazy (hexbin chart) — no need to wait on the chart.
    await expect(
      page.getByRole("heading", { name: "Expected Shot Value" })
    ).toBeVisible();

    await expect(page.getByText("EXPECTED SHOT VALUE · xeFG%")).toBeVisible();
  });
});


test("one court keeps the selected location across models, including a missing model value", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const surface: ShotQualityResponse = {
    season: "2025-26", latestPublishedSeason: "2025-26", activeModel: "gbm-v1",
    meta: { cellCount: 3, totalFga: 500 },
    cells: [
      { cellX: 0, cellY: 0, zoneBasic: "Restricted Area", zoneRange: "Less Than 8 ft.", zoneArea: "Center(C)", fga: 200, fgm: 120, fg3a: 0, fg3m: 0, baseline: { pMake: .6, expectedEfg: .6, xpps: 1.2 }, gbm: { pMake: .65, expectedEfg: .65, xpps: 1.3 } },
      { cellX: 10, cellY: 10, zoneBasic: "Mid-Range", zoneRange: "8-16 ft.", zoneArea: "Right Side(R)", fga: 250, fgm: 100, fg3a: 0, fg3m: 0, baseline: { pMake: .4, expectedEfg: .4, xpps: .8 }, gbm: { pMake: .45, expectedEfg: .45, xpps: .9 } },
      { cellX: 20, cellY: 20, zoneBasic: "Above the Break 3", zoneRange: "24+ ft.", zoneArea: "Right Side(R)", fga: 50, fgm: 15, fg3a: 50, fg3m: 15, baseline: { pMake: .3, expectedEfg: .45, xpps: .9 }, gbm: null },
    ],
  };
  await page.route("**/api/shot-quality*", route => route.fulfill({ json: { data: surface, error: null } }));
  await page.goto("/shot-quality?season=2025-26");
  const modelControls = page.getByRole("group", { name: "Shot value model", exact: true });
  await expect(modelControls).toBeVisible();
  const court = page.getByRole("group", { name: /half-court expected-shot-value map/ });
  await expect(court).toHaveCount(1);
  const panel = page.getByRole("status").filter({ hasText: "attempts at this location" });
  // Arrow keys move across the court: right from the rim reaches the mid-range location.
  await court.focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel).toContainText("10.5 ft across, 10.5 ft upcourt");
  await expect(panel).toContainText("40.0% eFG");
  await expect(panel).toContainText("45.0% eFG");
  const before = await court.locator("circle").last().getAttribute("cx");
  await modelControls.getByRole("button", { name: "Location model", exact: true }).click();
  await expect(panel).toContainText("10.5 ft across, 10.5 ft upcourt");
  expect(await court.locator("circle").last().getAttribute("cx")).toBe(before);
  await court.focus();
  await page.keyboard.press("ArrowUp");
  await expect(panel).toContainText("20.5 ft across, 20.5 ft upcourt");
  await expect(panel).toContainText("Unavailable");
  await modelControls.getByRole("button", { name: "Zone average", exact: true }).click();
  await expect(panel).toContainText("20.5 ft across, 20.5 ft upcourt");
  await expect(page.getByRole("slider")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
