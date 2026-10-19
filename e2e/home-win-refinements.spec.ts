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
  await expect(chart.locator(".recharts-reference-line")).toHaveCount(0);
  await expect(page.getByLabel("Home win rate chart legend")).toContainText("Annual home win rate");
  await expect(page.getByLabel("Home win rate chart legend")).toContainText("Trailing five-season rate");
  await expect(page.getByText(/The first four seasons have no rolling value/)).toBeVisible();
  await expect(page.getByText(/DASHED LINE: .*ACROSS EVERY SEASON/)).toHaveCount(0);
  await chart.getByRole("application").focus();
  await expect(chart.locator(".recharts-tooltip-wrapper").getByText("2017-18", { exact: true })).toBeVisible();
  for (const season of seasons.slice(1, 5)) {
    await page.keyboard.press("ArrowRight");
    await expect(chart.locator(".recharts-tooltip-wrapper").getByText(season.season, { exact: true })).toBeVisible();
  }
  await expect(chart.getByText("Trailing five seasons: 52.9%", { exact: true })).toBeVisible();
  await expect(chart.getByText("500 wins / 1,000 games", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
