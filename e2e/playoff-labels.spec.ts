import { expect, test } from "@playwright/test";
import type { PlayoffSeriesWithPredictions, PlayoffsResponse } from "../src/types";

const home = { id: 1, abbreviation: "BOS", name: "Celtics" };
const away = { id: 2, abbreviation: "NYK", name: "Knicks" };

function series(overrides: Partial<PlayoffSeriesWithPredictions> = {}): PlayoffSeriesWithPredictions {
  return {
    seriesId: 1, season: "2024-25", round: 2, conference: "East", isBestOf7: true,
    homeCourtTeam: home, opponentTeam: away, homeCourtWins: 2, opponentWins: 4,
    seriesWinnerTeam: away, seedDiff: 1, winPctDiff: 0.1, entryRestDiff: 2,
    h2hDiff: 0, priorGrindDiff: 1, homeCourtPriorGames: 4, opponentPriorGames: 5,
    homeCourtPriorIsBestOf7: true, opponentPriorIsBestOf7: true,
    predictions: {
      walkForwardOos: { predictedHomeCourtWinProb: 0.3, predictedWinnerTeam: away, modelVersion: "fixture", predictedWinnerCorrect: true },
      fullInsample: { predictedHomeCourtWinProb: 0.8, predictedWinnerTeam: home, modelVersion: "fixture", predictedWinnerCorrect: false },
    }, ...overrides,
  };
}

async function openSeries(page: import("@playwright/test").Page, item = series()) {
  const summary = { knownWinnerGames: 1, predictedCorrect: 1, accuracy: 100 };
  const response: PlayoffsResponse = {
    season: "2024-25", latestPublishedSeason: "2024-25",
    rounds: [{ round: 2, roundLabel: "Conference Semifinals", series: [item] }],
    summary: { fullInsample: summary, walkForwardOos: summary },
  };
  await page.route("**/api/playoffs**", route => route.fulfill({ json: { data: response, error: null } }));
  await page.goto("/playoffs?season=2024-25");
  await expect(page.getByText("Model pick", { exact: true })).toBeVisible();
}

test("names the selected team, complements visitor probability and separates known-results fit", async ({ page }) => {
  await openSeries(page);
  await expect(page.getByText("70.0%", { exact: true })).toBeVisible();
  await expect(page.getByText("Estimated chance NYK wins the series", { exact: true })).toBeVisible();
  await expect(page.getByText("Actual result: NYK won", { exact: true })).toBeVisible();
  await expect(page.getByText("80.0%", { exact: true })).not.toBeVisible();
  await expect(page.getByText(/trained only on seasons before 2024-25/)).toBeVisible();
  await expect(page.getByText(/does not establish that the estimate was published before/)).toBeVisible();
  await page.getByText("Fit using known results", { exact: true }).click();
  await expect(page.getByText("80.0%", { exact: true })).toBeVisible();
  await expect(page.getByText("Estimated chance BOS wins the series", { exact: true })).toBeVisible();
  await expect(page.getByText(/cannot demonstrate predictive performance/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Expand series details: BOS vs NYK/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#playoff-series-features-1")).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: /Expand series details: BOS vs NYK/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Collapse series details: BOS vs NYK/ })).toHaveAttribute("aria-expanded", "true");
  const toggle = page.getByRole("button", { name: /Collapse series details: BOS vs NYK/ });
  await expect(toggle).toHaveAttribute("aria-controls", "playoff-series-features-1");
  await expect(page.locator("#playoff-series-features-1")).toBeVisible();
  await expect(page.locator("#playoff-series-features-1")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("button details, button summary")).toHaveCount(0);
});

test("does not promote a known-results fit when earlier history is missing", async ({ page }) => {
  const item = series();
  item.predictions.walkForwardOos = null;
  item.predictions.fullInsample!.predictedWinnerCorrect = true;
  await openSeries(page, item);
  await expect(page.getByText("Estimate unavailable: insufficient earlier history.", { exact: true })).toBeVisible();
  await expect(page.getByText(/✓ CORRECT|✗ MISSED/)).toHaveCount(0);
  await expect(page.getByText("80.0%", { exact: true })).not.toBeVisible();
});

test("preserves pending outcomes and missing estimates without fabricating zero scores", async ({ page }) => {
  await openSeries(page, series({ homeCourtWins: null, opponentWins: null, seriesWinnerTeam: null,
    predictions: { fullInsample: null, walkForwardOos: null } }));
  await expect(page.getByText("Actual result: pending", { exact: true })).toBeVisible();
  await expect(page.getByText("—-—", { exact: true })).toBeVisible();
  await expect(page.getByText(/✓ CORRECT|✗ MISSED/)).toHaveCount(0);
  await page.getByText("Fit using known results", { exact: true }).click();
  await expect(page.getByText("Known-results estimate unavailable.", { exact: true })).toBeVisible();
});
