import { expect, test, type Route } from "@playwright/test";
import type { AnalysisResponse, GapRangeBucket } from "../src/types";

// Synthetic evidence shaped like the live backtest: small gaps at the baseline, large well
// above it, and a home rate that drifts down across eight eras. Requests are controlled; no
// populated database is needed.
const bucket = (key: GapRangeBucket["key"], games: number, winPct: number): GapRangeBucket => ({
  key,
  min: { small: 0.5, medium: 3, large: 5 }[key],
  max: { small: 3, medium: 5, large: null }[key],
  games,
  restedTeamWins: Math.round((games * winPct) / 100),
  winPct,
});
const seasonLabel = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
const homeRate = (i: number) => Math.round((66 - i * 0.3) * 10) / 10;

const seasons = Array.from({ length: 40 }, (_, i) => ({
  season: seasonLabel(1985 + i),
  homeGames: 1100,
  homeWins: Math.round(11 * homeRate(i)),
  latestEvidenceDate: `${1986 + i}-04-15`,
  games: 650,
  restedTeamWins: 400,
  winPct: 61.5,
  homeBaselinePct: homeRate(i),
  isComplete: true,
}));
const eras = Array.from({ length: 8 }, (_, e) => {
  const home = homeRate(e * 5 + 2);
  return {
    firstSeason: seasonLabel(1985 + e * 5),
    lastSeason: seasonLabel(1989 + e * 5),
    seasonCount: 5,
    homeGames: 5500,
    homeWins: Math.round(55 * home),
    homeWinPct: home,
    ranges: [
      bucket("small", 2100, Math.round((home + (e % 2 ? 0.6 : -0.4)) * 10) / 10),
      bucket("medium", 840, Math.round((home + 2) * 10) / 10),
      bucket("large", 470, Math.round((home + (e === 3 ? -0.8 : 5)) * 10) / 10),
    ],
  };
});
const backtest: AnalysisResponse = {
  latestEvidenceDate: "2026-04-12",
  totalGames: 27420,
  overallWins: 16778,
  overallWinRate: 61.2,
  thresholds: [],
  gapRanges: [bucket("small", 16957, 60), bucket("medium", 6707, 61.9), bucket("large", 3756, 65.3)],
  eras,
  homeAwayBreakdown: {
    homeTeamMoreRested: { games: 27420, restedTeamWins: 16778, winPct: 61.2 },
    awayTeamMoreRested: { games: 11494, restedTeamWins: 4862, winPct: 42.3 },
  },
  venueBaseline: { games: 47112, homeWins: 28220, homeWinPct: 59.9, roadWinPct: 40.1 },
  seasonWinRates: seasons,
};

test("each gap-size bar opens exactly its own games, with the home team as the rested side", async ({ page }) => {
  const searches: URLSearchParams[] = [];
  await page.route("**/api/analysis", (route: Route) => route.fulfill({ json: { data: backtest, error: null } }));
  await page.route("**/api/games/search?*", (route) => {
    searches.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { data: { games: [], total: 0, page: 1, pageSize: 20 }, error: null } });
  });
  await page.goto("/analysis");

  await expect(page.getByText("HOME TEAM MORE RESTED", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("GAP 0.5 OR MORE · 27,420 GAMES")).toBeVisible();
  await expect(page.getByText("GAP 5 OR MORE · 3,756 GAMES")).toBeVisible();

  // The default explorer is the population the rates count, not both venues.
  await expect(page.getByLabel("Rested team filter")).toHaveValue("home");
  await expect.poll(() => searches.at(-1)?.get("side")).toBe("home");

  const rangeChart = page.locator(".recharts-wrapper").first();
  await expect(rangeChart.getByText("LARGE 5+", { exact: true })).toBeVisible();
  await expect(rangeChart.getByText("n=3,756", { exact: true })).toBeVisible();
  await rangeChart.locator(".recharts-bar-rectangle path").nth(2).click();
  await expect(page.getByLabel("Rest gap filter")).toHaveValue("large");
  await expect.poll(() => searches.at(-1)?.get("gap")).toBe("large");
  expect(searches.at(-1)?.get("minRA")).toBeNull();

  // Visitor rows are one control away, and choosing them is the only way in.
  await page.getByLabel("Rested team filter").selectOption("away");
  await expect.poll(() => searches.at(-1)?.get("side")).toBe("away");
});

test("the era chart counts the eras large gaps beat, against each era's own home rate", async ({ page }, testInfo) => {
  await page.route("**/api/analysis", (route: Route) => route.fulfill({ json: { data: backtest, error: null } }));
  await page.route("**/api/games/search?*", (route) => route.fulfill({
    json: { data: { games: [], total: 0, page: 1, pageSize: 20 }, error: null },
  }));
  await page.goto("/analysis");

  await expect(page.getByText("DOES THE LARGE-GAP EDGE HOLD IN EVERY ERA?")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/LARGE GAPS BEAT THEIR ERA'S HOME RATE IN 7 OF 8 ERAS\./)).toBeVisible();
  await expect(page.getByText("1986", { exact: true })).toBeVisible();
  await expect(page.getByText("5 SEASONS PER GROUP", { exact: true })).toBeVisible();
  await expect(page.getByText(/small gaps \(0\.5–3\)/)).toBeVisible();
  await expect(page.getByText(/win 60\.0% on 16,957 games, \+0\.1 points, within the noise/)).toBeVisible();
  await expect(page.getByText(/COIN FLIP/)).toHaveCount(0);

  await page.getByText("THE ANSWER", { exact: false }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("analysis-gap-ranges.png"), fullPage: true });
});
