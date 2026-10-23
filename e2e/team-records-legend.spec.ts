import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { winRateBand, winRateInterval, type SeasonReportResponse, type SeasonReportTeamLabelled } from "../src/lib/season-report";

const abbreviations = ["PHX", "NYK", "GSW", "PHI", "CLE", "LAL", "DEN", "CHA", "ATL", "BOS", "BKN", "CHI", "DAL", "DET", "HOU", "IND", "LAC", "MEM", "MIA", "MIL", "MIN", "NOP", "OKC", "ORL", "POR", "SAC", "SAS", "TOR", "UTA", "WAS"];

function reportFixture(baseline: number | null = 20): SeasonReportResponse {
  const teams: SeasonReportTeamLabelled[] = abbreviations.map((abbreviation, index) => ({
    teamId: index + 1, abbreviation, name: abbreviation,
    restedGames: 20, restedWins: 12, restedWinPct: 60,
    tiredGames: 20, tiredWins: 8, tiredWinPct: 40,
    swing: 20, scheduleValueWins: 0, travelMiles: 0, backToBacks: 0, threeInFours: 0, jetLagGames: 0,
    restStates: { restedHome: 0, tiredHome: 0, neutralHome: 0, restedRoad: 0, tiredRoad: 0, neutralRoad: 0 },
  }));
  Object.assign(teams[0], { restedWins: 16, restedWinPct: 80, swing: 40 });
  Object.assign(teams[1], { restedWins: 10, restedWinPct: 50, swing: 10 });
  Object.assign(teams[3], { restedGames: 21, restedWins: 12, restedWinPct: 57.1, tiredGames: 16, tiredWins: 13, tiredWinPct: 81.3, swing: -24.1 });
  Object.assign(teams[4], { restedGames: 0, restedWins: 0, restedWinPct: null, swing: null });
  Object.assign(teams[5], { restedGames: 5, restedWins: 2, restedWinPct: 40, swing: 0 });
  return {
    season: "2025-26", basis: "played", completedGames: 150, scheduledGames: 1230,
    availableFinalGames: 150, missingFatigueGames: 0,
    latestFinalDate: "2026-04-12", seasonComplete: false,
    homeRate: { games: 150, homeWins: 90, winPct: 60 },
    overall: { games: 100, restedTeamWins: 60, winPct: 60, band: winRateBand(60, 100), interval: winRateInterval(60, 100) },
    threePlus: { games: 20, restedTeamWins: 12, winPct: 60, band: winRateBand(12, 20), interval: winRateInterval(12, 20) },
    swingBaseline: baseline, teams, weeks: [], loudestCalls: [],
  };
}

async function fixture(page: Page, baseline: number | null = 20) {
  await page.route("**/api/season-report?*", route => route.fulfill({ json: { data: reportFixture(baseline), error: null } }));
  await page.route("**/api/analysis", route => route.fulfill({ json: { data: { seasonWinRates: [] }, error: null } }));
  await page.goto("/season?season=2025-26");
}

for (const width of [1280, 390]) {
  test(`home/rest colors describe the same-season league gap at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    const section = page.locator("section[aria-labelledby='season-team-heading']");
    const rows = section.getByTestId("edge-conversion-row");
    const gaps = section.getByTestId("team-home-rest-gap");
    await expect(section.getByTestId("swing-baseline-note")).toContainText("+20.0 pp");
    await expect(rows).toHaveCount(30);
    await expect(rows.nth(5)).toBeVisible();
    await expect(rows.nth(6)).not.toBeVisible();
    await expect(gaps.nth(0)).toContainText("Larger home/rest gap than league");
    if (width === 390) await expect(gaps.nth(0).getByText("Larger gap", { exact: true })).toBeVisible();
    await expect(gaps.nth(1)).toContainText("Smaller home/rest gap than league");
    await expect(gaps.nth(2)).toContainText("At the league home/rest gap");
    await expect(gaps.nth(3)).toContainText("−24.1");
    await expect(gaps.nth(4)).toContainText("Gap unavailable");
    await expect(gaps.nth(4)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(gaps.nth(5)).toContainText("Small sample");
    await expect(gaps.nth(5)).toContainText("Smaller home/rest gap than league");
    expect(await gaps.nth(1).evaluate(el => getComputedStyle(el).backgroundColor))
      .not.toBe(await gaps.nth(0).evaluate(el => getComputedStyle(el).backgroundColor));
    await expect(gaps.nth(2)).toHaveCSS("background-color", "rgb(237, 241, 243)");
    await expect(section).toContainText("do not measure the effect of rest alone");
    await expect(section).toContainText("statistical significance");
    await section.getByText("Show the other 24 teams", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(rows.nth(29)).toBeVisible();
    await section.getByText("How to read these records", { exact: true }).click();
    await expect(section).toContainText("at least 0.5 model points lower");
    await expect(section).toContainText("does not mean zero days off");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const violations = (await new AxeBuilder({ page }).include("section[aria-labelledby='season-team-heading']").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
    expect(violations.map(({ id }) => id)).toEqual([]);
    await section.screenshot({ path: info.outputPath(`team-records-${width}.png`) });
  });
}

test("missing league reference leaves every difference untinted", async ({ page }) => {
  await fixture(page, null);
  await expect(page.getByTestId("swing-baseline-note")).toContainText("No league comparison is available yet");
  const gap = page.getByTestId("team-home-rest-gap").first();
  await expect(gap).toContainText("+40.0");
  await expect(gap).toContainText("League comparison unavailable");
  await expect(gap).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});
