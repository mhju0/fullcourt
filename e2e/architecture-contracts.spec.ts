import { expect, test, type Page } from "@playwright/test";
import type { ScheduleDisparityResponse, ScheduleDisparityTeam } from "../src/types";

const team = (teamId: number, abbreviation: string, netEdgeGames: number | null, netRestEdge = 0): ScheduleDisparityTeam => ({
  teamId, abbreviation, name: `${abbreviation} team`, netEdgeGames, netRestEdge,
  favorableGames: netEdgeGames === null ? null : Math.max(netEdgeGames, 0),
  unfavorableGames: netEdgeGames === null ? null : Math.max(-netEdgeGames, 0),
  scheduleValueWins: 0.1, // A priced opener does not grant a place in the fatigue ranking.
  bigFavorableGames: null, bigUnfavorableGames: null, backToBackEdge: 0, threeInFourEdge: 0,
});
const mixed = [team(1, "ATL", null, 8), team(2, "BOS", 2), team(3, "CHI", 0), team(4, "DEN", -3)];

async function openSchedule(page: Page, teams = mixed) {
  await page.route("**/api/schedule-disparity?*", (route) => {
    const data: ScheduleDisparityResponse = {
      season: new URL(route.request().url()).searchParams.get("season")!,
      provisional: true, latestFinalDate: "2025-10-24", scheduledGames: 10, teams,
      league: { delta: 5, gamesWithAnyEdge: 5, gamesWithLargeEdge: 2, countedGames: 8, measuredGames: 4 },
    };
    return route.fulfill({ json: { data, error: null } });
  });
  await page.goto("/schedule");
  await expect(page.getByRole("listitem").first()).toBeVisible({ timeout: 60_000 });
}

test("mixed-season ranking leaves missing measurements unranked in both displays", async ({ page }, testInfo) => {
  await openSchedule(page);
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveText([/1\s*BOS\s*\+2/, /2\s*CHI\s*0/, /3\s*DEN\s*−3/, /—\s*ATL\s*Not measured\s*—/]);
  const atl = page.getByRole("row").filter({ hasText: "ATL team" });
  await expect(atl.getByRole("cell").nth(0)).toHaveText("—");
  await expect(atl.getByRole("cell").nth(2)).toHaveText("Not measured");
  await expect(atl.getByRole("cell").nth(3)).toHaveText("—");
  await expect(atl.getByRole("cell").nth(5)).toContainText("+0.1");
  await expect(page.getByText("Teams without a fatigue measurement appear below the ranking with a dash.")).toBeVisible();
  await page.getByRole("list").screenshot({ path: testInfo.outputPath("mixed-ranking.png") });
});

test("an entirely unmeasured season keeps net-rest-days ranking and units", async ({ page }) => {
  await openSchedule(page, [team(1, "ATL", null, -2), team(2, "BOS", null, 4)]);
  await expect(page.getByRole("listitem")).toHaveText([/1\s*BOS\s*\+4/, /2\s*ATL\s*−2/]);
  await expect(page.getByRole("columnheader", { name: "Net rest days" })).toBeVisible();
  await expect(page.getByText("6", { exact: true })).toBeVisible();
  await expect(page.getByText("Teams without a fatigue measurement appear below the ranking with a dash.")).toHaveCount(0);
});

// Observe the real browser transition; the controller's focused tests own timing edge cases.
async function observeTransitions(page: Page) {
  await page.addInitScript(() => {
    const state = { started: 0, settled: 0 };
    Object.assign(window, { observedTransitions: state });
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (update) => {
      state.started++;
      const transition = start(update);
      void transition.updateCallbackDone.then(() => { state.settled++; });
      return transition;
    };
  });
}
const transitions = (page: Page) => page.evaluate(() =>
  (window as typeof window & { observedTransitions: { started: number; settled: number } }).observedTransitions
);

test("current tab and palette destination skip motion; a different pathname cross-fades", async ({ page }) => {
  await observeTransitions(page);
  await openSchedule(page);
  const current = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "SCHEDULE EDGE", exact: true });
  await current.click();
  await expect(current).toHaveAttribute("aria-current", "page");
  expect((await transitions(page)).started).toBe(0);
  await page.getByRole("button", { name: "SEARCH", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("option").filter({ hasText: "SCHEDULE EDGE" }).click();
  await expect(palette).toBeHidden();
  expect((await transitions(page)).started).toBe(0);
  await page.getByRole("navigation", { name: "Reference" }).getByRole("link", { name: "BEHIND THE DATA" }).click();
  await expect(page).toHaveURL(/\/behind-the-data$/);
  await expect.poll(() => transitions(page)).toEqual({ started: 1, settled: 1 });
});

test("reduced motion keeps normal navigation for a different pathname", async ({ page }) => {
  await observeTransitions(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSchedule(page);
  await page.getByRole("navigation", { name: "Reference" }).getByRole("link", { name: "BEHIND THE DATA" }).click();
  await expect(page).toHaveURL(/\/behind-the-data$/);
  expect((await transitions(page)).started).toBe(0);
});
