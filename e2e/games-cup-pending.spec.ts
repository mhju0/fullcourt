import { expect, test } from "@playwright/test";
import { releaseGame } from "./fixtures/release-data";

const NOTE = "Rest and travel estimates pending NBA Cup scheduling.";

for (const width of [320, 390, 1440]) {
  test(`Cup estimates stay pending with results and records intact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-12-13T17:00:00Z"));
    const game = releaseGame("2026-12-12");
    game.awayTeam = { id: 2, name: "Trail Blazers", abbreviation: "POR", city: "Portland" };
    game.overtimePeriods = 2;
    game.records = { home: { wins: 13, losses: 12 }, away: { wins: 12, losses: 13 } };
    game.cupSchedulePending = { home: true, away: false };
    // An old numeric pair must not leak through a newer pending marker.
    game.homeFatigue = { ...game.homeFatigue!, score: 9.9, isBackToBack: true };
    game.awayFatigue = { ...game.awayFatigue!, score: 2.1, isBackToBack: false, is3In4: false };
    game.restAdvantage = { differential: 7.8, advantageTeam: "home" };
    await page.route("**/api/games/dates?*", route => route.fulfill({ json: { data: [{ date: game.date, gameCount: 1 }], error: null } }));
    await page.route("**/api/games/upcoming?*", route => route.fulfill({ json: { data: [], error: null } }));
    await page.route("**/api/games/2026-12-12", route => route.fulfill({ json: { data: [game], error: null } }));
    await page.goto("/games?season=2026-27&date=2026-12-12");
    const row = page.getByRole("button", { name: /^Expand .* game details$/ });
    await expect(row).toContainText("FINAL/2OT");
    await expect(row).toContainText("100–110");
    await expect(row).toContainText("(12–13)");
    await expect(row).toContainText("(13–12)");
    await expect(row).toHaveAccessibleName(/rest and travel estimates pending NBA Cup scheduling/);
    await expect(row.locator(".fc-game-edge")).toContainText("TBD");
    await expect(row).not.toContainText("REST EDGE");
    await expect(row).not.toContainText("B2B");
    await expect(row).not.toContainText("9.9");
    if (width >= 640) {
      await expect(row.locator(".fc-game-extra")).toContainText("2.1");
      await expect(row.locator(".fc-game-extra")).toContainText("TBD");
    }
    await expect(page.getByTestId("cup-fatigue-note")).toHaveText(NOTE);
    await expect(page.getByText(NOTE, { exact: true })).toHaveCount(1);
    const summary = page.getByTestId("slate-summary-line");
    await expect(summary.locator("dd").nth(0)).toHaveText("1");
    await expect(summary.locator("dd").nth(1)).toHaveText("—");
    await expect(summary.locator("dd").nth(2)).toContainText("—");
    await row.click();
    const detail = page.locator(`#game-${game.id}`);
    await expect(detail.getByText("HOME · BOS · TBD", { exact: true })).toBeVisible();
    await expect(detail.getByText("AWAY · POR", { exact: true })).toBeVisible();
    await expect(detail.getByText("NO FATIGUE DATA", { exact: true })).toHaveCount(0);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll<HTMLElement>("body *")].map(el => {
        const style = getComputedStyle(el);
        return { el, font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
      });
      for (const { el, font, line } of sizes) {
        el.style.fontSize = `${font * 2}px`;
        if (Number.isFinite(line)) el.style.lineHeight = `${line * 2}px`;
      }
    });
    await expect(page.getByText("FINAL/2OT", { exact: true })).toBeVisible();
    await expect(page.getByTestId("cup-fatigue-note")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("a partly pending slate withholds both incomplete rest summaries", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-13T17:00:00Z"));
  const pending = releaseGame("2026-12-12");
  pending.cupSchedulePending = { home: true, away: true };
  pending.homeFatigue = null;
  pending.awayFatigue = null;
  pending.restAdvantage = null;
  const measured = { ...releaseGame("2026-12-12"), id: pending.id + 1 };
  await page.route("**/api/games/dates?*", route => route.fulfill({ json: { data: [{ date: pending.date, gameCount: 2 }], error: null } }));
  await page.route("**/api/games/upcoming?*", route => route.fulfill({ json: { data: [], error: null } }));
  await page.route("**/api/games/2026-12-12", route => route.fulfill({ json: { data: [pending, measured], error: null } }));
  await page.goto("/games?season=2026-27&date=2026-12-12");
  const summary = page.getByTestId("slate-summary-line");
  await expect(summary.locator("dd").nth(0)).toHaveText("2");
  await expect(summary.locator("dd").nth(1)).toHaveText("—");
  await expect(summary.locator("dd").nth(2)).toContainText("—");
  await expect(page.getByText(NOTE, { exact: true })).toHaveCount(1);
});

for (const width of [320, 390, 1440]) {
  test(`By Team shows pending Cup rest without suppressing the final result at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-12-13T17:00:00Z"));
    await page.route("**/api/games/team?*", route => route.fulfill({ json: { data: [{
      id: 118730, date: "2026-12-12", status: "final", tipOffEt: "9:00 PM ET", tipOffUtc: "2026-12-13T02:00:00Z",
      isHome: true, neutralCity: null, opponent: { id: 29, name: "Trail Blazers", abbreviation: "POR", city: "Portland" },
      teamScore: 141, opponentScore: 135, overtimePeriods: 1, restAdvantage: { differential: 4.89, advantageTeam: "home" },
      projectedFatigue: false, cupSchedulePending: true,
    }], error: null } }));
    await page.goto("/games/team?season=2026-27&team=DEN");
    const row = page.getByTestId("team-game-row");
    await expect(row).toContainText("W 141–135 FINAL/OT");
    await expect(row).toContainText("TBD");
    await expect(row).not.toContainText("4.8");
    await expect(page.getByText(NOTE, { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("team-summary-line").locator("dd").nth(3)).toContainText("—");
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll<HTMLElement>("body *")].map(el => {
        const style = getComputedStyle(el);
        return { el, font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
      });
      for (const { el, font, line } of sizes) {
        el.style.fontSize = `${font * 2}px`;
        if (Number.isFinite(line)) el.style.lineHeight = `${line * 2}px`;
      }
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [390, 1440]) {
  test(`game detail modal distinguishes Cup-pending estimates at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const game = releaseGame("2026-12-12");
    game.overtimePeriods = 2;
    game.cupSchedulePending = { home: true, away: false };
    game.homeFatigue = null;
    game.restAdvantage = null;
    await page.route("**/api/analysis**", route => route.fulfill({ json: { data: {
      latestEvidenceDate: "2026-12-12", totalGames: 1000, overallWins: 620, overallWinRate: 62,
      thresholds: [], gapRanges: [], eras: [], seasonWinRates: [],
      homeAwayBreakdown: { homeTeamMoreRested: { games: 1000, restedTeamWins: 620, winPct: 62 }, awayTeamMoreRested: { games: 500, restedTeamWins: 200, winPct: 40 } },
      venueBaseline: { games: 2000, homeWins: 1200, homeWinPct: 60, roadWinPct: 40 },
    }, error: null } }));
    await page.route("**/api/games/search?*", route => route.fulfill({ json: { data: {
      games: [{ gameId: game.id, date: game.date, season: game.season, homeTeamAbbreviation: "BOS", awayTeamAbbreviation: "BKN", homeScore: 110, awayScore: 100, homeFatigueScore: null, awayFatigueScore: 4, restAdvantageDifferential: null, advantageTeam: null, restedTeamWon: null }],
      total: 1, page: 1, limit: 20,
    }, error: null } }));
    await page.route(`**/api/game/${game.id}`, route => route.fulfill({ json: { data: { game, homeRecentWeek: [], awayRecentWeek: [] }, error: null } }));
    await page.goto("/analysis");
    await page.getByRole("button", { name: /^Open details:/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Game details" });
    await expect(dialog.getByText("FINAL/2OT", { exact: true })).toBeVisible();
    await expect(dialog.getByText(NOTE, { exact: true })).toHaveCount(1);
    await expect(dialog.getByText("HOME · BOS · TBD", { exact: true })).toBeVisible();
    await expect(dialog.getByText("NO DATA", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("NO FATIGUE DATA", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
