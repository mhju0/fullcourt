import { expect, test, type Page } from "@playwright/test";
import { buildSeasonReport, type SeasonReportRow } from "../src/lib/season-report";
import { computeScheduleDisparity, type DisparityGameRow } from "../src/lib/schedule-disparity";

function report(season: string, missingRestData = false) {
  const side = { fatigueScore: "1", travelLegMiles: 0, isBackToBack: false, isThreeInFour: false, hasTimeZoneDisplacement: false };
  const row: SeasonReportRow = {
    gameId: 1, date: `${season.slice(0, 4)}-10-22`, status: "final",
    homeTeamId: 1, awayTeamId: 2, homeScore: 100, awayScore: 90, neutralSite: false,
    home: missingRestData ? null : side, away: { ...side, fatigueScore: "4" },
  };
  return { ...buildSeasonReport(season, [row]), teams: [] };
}

async function stubAnalysis(page: Page) {
  await page.route("**/api/analysis", route => route.fulfill({ json: { data: { seasonWinRates: [] }, error: null } }));
}

test("season fallback describes unavailable rest coverage even when final scores exist", async ({ page }) => {
  await stubAnalysis(page);
  await page.route("**/api/season-report?*", route => {
    const season = new URL(route.request().url()).searchParams.get("season")!;
    return route.fulfill({ json: { data: report(season, season === "2026-27"), error: null } });
  });
  await page.goto("/season");
  await expect(page.getByTestId("season-default-note")).toContainText("Showing the 2025-26 report while 2026-27 season results are unavailable.");
  await expect(page.getByTestId("season-default-note")).not.toContainText("no completed games yet");
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2025-26");
});

test("report retry stays usable after another failure and recovers the selected season", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await stubAnalysis(page);
  let recover = false;
  let requests = 0;
  await page.route("**/api/season-report?*", route => {
    requests++;
    const season = new URL(route.request().url()).searchParams.get("season")!;
    return route.fulfill(recover
      ? { json: { data: report(season), error: null } }
      : { status: 503, json: { data: null, error: "Report temporarily unavailable" } });
  });
  await page.goto("/season?season=2024-25");
  const retry = page.getByRole("button", { name: "Retry report", exact: true });
  await expect(retry).toBeVisible();
  const beforeRetry = requests;
  await retry.click();
  await expect.poll(() => requests).toBeGreaterThan(beforeRetry);
  await expect(retry).toBeEnabled();
  recover = true;
  await retry.click();
  await expect(page.getByRole("heading", { name: "Home court and rest", exact: true })).toBeVisible();
  await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2024-25 vs history");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("comparison-unavailable retry fetches a new report before rendering its figures", async ({ page }) => {
  await stubAnalysis(page);
  let recover = false;
  await page.route("**/api/season-report?*", route => {
    const { homeRate, ...legacy } = report("2024-25");
    return route.fulfill({ json: { data: recover ? { ...legacy, homeRate } : legacy, error: null } });
  });
  await page.goto("/season?season=2024-25");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("SEASON COMPARISON UNAVAILABLE");
  await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
  recover = true;
  await page.getByRole("button", { name: "Retry report", exact: true }).click();
  await expect(page.getByTestId("season-rest-win-rate")).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

function schedule(count: number) {
  const games: DisparityGameRow[] = Array.from({ length: 82 }, (_, round) => {
    const date = new Date(Date.UTC(2026, 9, 20 + round * 2)).toISOString().slice(0, 10);
    return Array.from({ length: 15 }, (_, pair) => ({
      date, homeTeamId: (pair * 2 + round) % 30 + 1, awayTeamId: (pair * 2 + round + 1) % 30 + 1,
      status: "scheduled", homeFatigueScore: "1", awayFatigueScore: "4",
    }));
  }).flat().slice(0, count);
  const result = computeScheduleDisparity("2026-27", games);
  return {
    ...result,
    teams: result.teams.map(team => ({ ...team, abbreviation: team.teamId === 1 ? "BOS" : `T${team.teamId}`, name: team.teamId === 1 ? "Boston Celtics" : `Team ${team.teamId}` })),
  };
}

for (const count of [1200, 1230]) {
  test(`schedule with ${count} fixtures distinguishes publication coverage from projected results`, async ({ page }) => {
    await page.route("**/api/schedule-disparity?*", route => route.fulfill({ json: { data: schedule(count), error: null } }));
    await page.route("**/api/season-report?*", route => route.fulfill({ json: { data: report("2026-27", true), error: null } }));
    await page.goto("/schedule?season=2026-27");
    await expect(page.getByText("This season has unsettled games", { exact: false })).toBeVisible();
    await expect(page.getByText("compared games are projected", { exact: false })).toBeVisible();
    const missing = page.getByTestId("schedule-missing-fixtures");
    if (count === 1200) await expect(missing).toContainText("missing 30 regular-season fixtures");
    else await expect(missing).toHaveCount(0);
    await expect(page.getByText("This season’s schedule is not finished.", { exact: false })).toHaveCount(0);
    const teamLink = page.getByRole("link", { name: "View Boston Celtics games in 2026-27", exact: true });
    await expect(teamLink).toHaveAttribute("href", "/games/team?season=2026-27&team=BOS");
    await page.getByText("Show full breakdown", { exact: true }).click();
    await expect(teamLink).toHaveCount(2);
    await expect(teamLink.nth(1)).toHaveAttribute("href", "/games/team?season=2026-27&team=BOS");
  });
}
