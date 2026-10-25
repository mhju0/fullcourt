import { expect, test } from "@playwright/test";
import type { AnalysisResponse } from "../src/types";

const seasons: AnalysisResponse["seasonWinRates"] = Array.from({ length: 7 }, (_, index) => ({
  season: `${2017 + index}-${String(2018 + index).slice(-2)}`,
  homeGames: index === 4 ? 1000 : 100,
  homeWins: index === 4 ? 500 : 60,
  homeBaselinePct: index === 4 ? 50 : 60,
  latestEvidenceDate: `${2018 + index}-04-15`,
  games: 100, restedTeamWins: 65, winPct: 65, isComplete: true,
}));
const evidence: AnalysisResponse = {
  latestEvidenceDate: "2024-04-15", totalGames: 700, overallWins: 455, overallWinRate: 65,
  thresholds: [], gapRanges: [], eras: [],
  homeAwayBreakdown: {
    homeTeamMoreRested: { games: 700, restedTeamWins: 455, winPct: 65 },
    awayTeamMoreRested: { games: 0, restedTeamWins: 0, winPct: 0 },
  },
  venueBaseline: { games: 1600, homeWins: 860, homeWinPct: 53.8, roadWinPct: 46.2 },
  seasonWinRates: seasons,
};

test("Model Results shows annual and game-weighted five-season history without a pooled flatline", async ({ page }) => {
  await page.route("**/api/analysis*", route => route.fulfill({ json: { data: evidence, error: null } }));
  await page.route("**/api/explore*", route => route.fulfill({ json: { data: { games: [], total: 0, page: 1, pageSize: 20 }, error: null } }));
  await page.goto("/analysis");
  await expect(page.getByRole("heading", { name: "Home teams’ win rate over time", exact: true })).toBeVisible();
  const chart = page.getByTestId("home-win-trend");
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator(".recharts-line")).toHaveCount(2);
  await expect(chart.locator('path.recharts-line-curve[stroke-dasharray="6 4"]')).toHaveCount(1);
  // The one reference line is the vertical selection marker; no pooled horizontal flatline.
  await expect(chart.locator(".recharts-reference-line")).toHaveCount(1);
  await expect(page.getByLabel("Home win rate chart legend")).toContainText("Each season");
  await expect(page.getByLabel("Home win rate chart legend")).toContainText("Five-season average");
  await page.getByText("How the line is calculated", { exact: true }).click();
  await expect(page.getByText(/The first four seasons have no rolling value/)).toBeVisible();
  await expect(page.getByText(/DASHED LINE: .*ACROSS EVERY SEASON/)).toHaveCount(0);
  const readout = page.getByTestId("home-win-trend-readout");
  await expect(readout.getByRole("heading", { name: "2023-24" })).toBeVisible();
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(readout.getByRole("heading", { name: "2017-18" })).toBeVisible();
  for (const season of seasons.slice(1, 5)) {
    await page.keyboard.press("ArrowRight");
    await expect(readout.getByRole("heading", { name: season.season })).toBeVisible();
  }
  await expect(readout.getByText("Five-season average: 52.9%", { exact: true })).toBeVisible();
  await expect(readout.getByText("Home teams won · 500 wins / 1,000 games", { exact: true })).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(chart).toBeFocused();
    await chart.press("ArrowLeft");
    await chart.press("ArrowRight");
    await expect(readout.getByRole("heading", { name: "2021-22" })).toBeVisible();
  }
  const grid = await chart.locator(".recharts-cartesian-grid").boundingBox();
  await page.mouse.click(grid!.x + 1, grid!.y + grid!.height / 2);
  await expect(readout.getByRole("heading", { name: "2017-18" })).toBeVisible();
  const otherControl = page.getByText("How the line is calculated", { exact: true });
  for (const width of [390, 1280]) {
    await chart.hover({ position: { x: 140, y: 100 } });
    await otherControl.focus();
    await expect(otherControl).toBeFocused();
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(otherControl).toBeFocused();
  }
});
