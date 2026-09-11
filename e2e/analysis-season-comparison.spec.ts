import { expect, test, type Page, type Route } from "@playwright/test";
import type { AnalysisResponse } from "../src/types";
import { MIN_GAMES_FOR_INFERENCE } from "../src/lib/season-report";

// Synthetic evidence: intentionally different era baselines, plus seasons on each side
// of the maturity gate. Requests are controlled; no populated database is needed.
const season = (label: string, games: number, winPct = 60, homeBaselinePct = 55) => ({
  season: label,
  homeGames: 1000,
  homeWins: Math.round(1000 * homeBaselinePct / 100),
  latestEvidenceDate: "2026-04-12",
  games,
  restedTeamWins: Math.round(games * winPct / 100),
  winPct,
  homeBaselinePct,
  isComplete: true,
});
const backtest: AnalysisResponse = {
  latestEvidenceDate: "2026-04-12",
  totalGames: 1000, overallWins: 600, overallWinRate: 60,
  thresholds: [2, 3, 5, 7].map((threshold) => ({ threshold, games: 100, restedTeamWins: 60, winPct: 60 })),
  homeAwayBreakdown: {
    homeTeamMoreRested: { games: 1000, restedTeamWins: 600, winPct: 60 },
    awayTeamMoreRested: { games: 1000, restedTeamWins: 400, winPct: 40 },
  },
  venueBaseline: { games: 2000, homeWins: 1160, homeWinPct: 58, roadWinPct: 42 },
  seasonWinRates: [
    season("1998-99", 382, 60, 67),
    season("2024-25", MIN_GAMES_FOR_INFERENCE),
    season("2025-26", MIN_GAMES_FOR_INFERENCE - 1),
    season("2026-27", 5),
  ],
};
const filtered: AnalysisResponse = {
  ...backtest,
  seasonWinRates: [
    season("1998-99", 10, 60, 67),
    season("2024-25", 10),
    season("2025-26", 1),
    season("2026-27", 1),
    season("2023-24", 900), // No unfiltered evidence: never admitted.
  ],
};
const fulfill = (route: Route, data: AnalysisResponse) => route.fulfill({ json: { data, error: null } });

async function openComparison(page: Page, thresholdRead: (route: Route) => Promise<void>) {
  await page.route("**/api/analysis?*", thresholdRead);
  await page.route("**/api/analysis", (route) => fulfill(route, backtest));
  await page.route("**/api/games/search?*", (route) => route.fulfill({
    json: { data: { games: [], total: 0, page: 1, pageSize: 20 }, error: null },
  }));
  await page.goto("/analysis");
  const comparison = page.getByRole("region", { name: "Win rate by season" });
  await expect(comparison).toBeVisible({ timeout: 60_000 });
  return comparison;
}

test("filtered failure stays local, can retry, and never claims an empty measurement", async ({ page }, testInfo) => {
  let attempts = 0;
  const comparison = await openComparison(page, async (route) => {
    attempts++;
    if (attempts === 1) {
      await route.fulfill({ status: 503, json: { data: null, error: "Comparison temporarily unavailable" } });
    } else {
      await fulfill(route, filtered);
    }
  });
  await comparison.getByRole("button", { name: "RA ≥ 7", exact: true }).click();
  await expect(comparison.getByRole("alert")).toContainText("Comparison temporarily unavailable");
  await expect(comparison.getByText("NO SEASON-LEVEL DATA YET")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Model Results" })).toBeVisible();
  await expect(page.getByText("RESTED TEAM AT HOME WON · ANY GAP", { exact: true })).toBeVisible();
  await comparison.screenshot({ path: testInfo.outputPath("season-comparison-error.png") });
  await comparison.getByRole("button", { name: "Retry season comparison" }).click();
  await expect(comparison.getByRole("alert")).toHaveCount(0);
  await expect(comparison.getByText(/THE WIDEST GAP OF THE 2 SEASONS SHOWN/)).toBeVisible();
  await expect(comparison.getByRole("button", { name: "RA ≥ 7", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(attempts).toBe(2);
  await comparison.screenshot({ path: testInfo.outputPath("season-comparison-ready.png") });
});

test("threshold views use unfiltered maturity and each season's own venue baseline", async ({ page }) => {
  const comparison = await openComparison(page, (route) => fulfill(route, filtered));
  await comparison.getByRole("button", { name: "RA ≥ 7", exact: true }).click();
  await expect(comparison.getByText(/THE WIDEST GAP OF THE 2 SEASONS SHOWN/)).toBeVisible();
  const caption = comparison.getByText(/VS ITS OWN 67% HOME COURT/);
  await expect(caption).toContainText("1998-99:");
  await expect(caption).toContainText("−7 PP");
  await expect(comparison.getByRole("application").getByText("2024-25", { exact: true })).toBeVisible();
  for (const withheld of ["2023-24", "2025-26", "2026-27"]) {
    await expect(comparison.getByRole("application").getByText(withheld, { exact: true })).toHaveCount(0);
  }
});

test("a successful empty threshold view is quiet and All Games recovers from a failed view", async ({ page }) => {
  const comparison = await openComparison(page, (route) => {
    if (new URL(route.request().url()).searchParams.get("seasonMinRA") === "7") {
      return fulfill(route, { ...backtest, seasonWinRates: [] });
    }
    return route.fulfill({ status: 503, json: { data: null, error: "Unavailable" } });
  });
  await comparison.getByRole("button", { name: "RA ≥ 7", exact: true }).click();
  await expect(comparison.getByText("NO SEASON-LEVEL DATA YET")).toBeVisible();
  await expect(comparison.getByRole("alert")).toHaveCount(0);
  await comparison.getByRole("button", { name: "RA ≥ 5", exact: true }).click();
  await expect(comparison.getByRole("alert")).toBeVisible();
  await comparison.getByRole("button", { name: "ALL GAMES", exact: true }).click();
  await expect(comparison.getByRole("alert")).toHaveCount(0);
  await expect(comparison.getByText(/THE WIDEST GAP OF THE 2 SEASONS SHOWN/)).toBeVisible();
});

test("a late threshold response cannot replace a newer selection", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const comparison = await openComparison(page, async (route) => {
    if (new URL(route.request().url()).searchParams.get("seasonMinRA") === "7") {
      await held;
      await fulfill(route, { ...filtered, seasonWinRates: [season("1998-99", 10)] });
    } else {
      await fulfill(route, { ...filtered, seasonWinRates: [season("2024-25", 10)] });
    }
  });
  await comparison.getByRole("button", { name: "RA ≥ 7", exact: true }).click();
  await expect(comparison.getByRole("status")).toContainText("Loading season comparison");
  await expect(comparison.getByText("NO SEASON-LEVEL DATA YET")).toHaveCount(0);
  await comparison.getByRole("button", { name: "RA ≥ 5", exact: true }).click();
  await expect(comparison.getByText(/○ 2024-25:/)).toBeVisible();
  const oldResponse = page.waitForResponse((response) => response.url().endsWith("seasonMinRA=7"));
  release();
  await oldResponse;
  await expect(comparison.getByRole("button", { name: "RA ≥ 5", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(comparison.getByText(/○ 2024-25:/)).toBeVisible();
  await expect(comparison.getByText(/○ 1998-99:/)).toHaveCount(0);
});
