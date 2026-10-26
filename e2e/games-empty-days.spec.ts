import { expect, test, type Page } from "@playwright/test";
import { releaseGame } from "./fixtures/release-data";

const dates = [
  { date: "2026-10-20", gameCount: 2 },
  { date: "2026-10-26", gameCount: 5 },
  { date: "2027-04-11", gameCount: 15 },
];

async function fixture(page: Page, today = "2026-10-26T16:00:00Z") {
  await page.clock.setFixedTime(new Date(today));
  await page.route("**/api/games/dates?*", route => route.fulfill({ json: { data: dates, error: null } }));
  await page.route(/\/api\/games\/\d{4}-\d{2}-\d{2}(\?|$)/, route => route.fulfill({ json: { data: [], error: null } }));
}

for (const width of [1440, 390]) {
  test(`calendar includes empty dates and preserves season boundaries at ${width}px`, async ({ page }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/games?season=2026-27&date=2026-10-20");
    const previous = page.getByRole("button", { name: "Previous day", exact: true }).filter({ visible: true });
    await expect(previous).toBeDisabled();
    if (width < 640) {
      const week = page.getByRole("group", { name: "Week", exact: true });
      await expect(week.getByRole("button")).toHaveCount(7);
      await expect(week.getByRole("button").nth(0)).toBeDisabled();
      await expect(week.getByRole("button").nth(1)).toBeDisabled();
      await expect(week.getByRole("button").nth(2)).toHaveAttribute("aria-current", "date");
      await page.getByRole("button", { name: "Calendar", exact: true }).click();
    }
    const datesGroup = page.getByRole("group", { name: "Date", exact: true }).filter({ visible: true });
    await expect(datesGroup.getByRole("button")).toHaveCount(12);
    await expect(datesGroup.getByRole("button", { name: /October 19, 2026/ })).toHaveCount(0);
    await datesGroup.getByRole("button", { name: /October 21, 2026/ }).click();
    await expect(page).toHaveURL(/date=2026-10-21/);
    await expect(page.getByText("No games scheduled for this day.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("slate-summary-line")).toContainText("0");
    await expect(page.getByTestId("slate-summary-line")).toContainText("—");
    await page.reload();
    await expect(page).toHaveURL(/date=2026-10-21/);
    await expect(page.getByText("No games scheduled for this day.", { exact: true })).toBeVisible();
    await page.goto("/games?season=2026-27&date=2027-04-11");
    await expect(page.getByRole("button", { name: "Next day", exact: true }).filter({ visible: true })).toBeDisabled();
    if (width < 640) await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(datesGroup.getByRole("button")).toHaveCount(11);
    await expect(datesGroup.getByRole("button", { name: /April 12, 2027/ })).toHaveCount(0);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`empty-day reasons and pending counts agree at ${width}px`, async ({ page }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    for (const [date, message] of [
      ["2026-11-03", "Election Day. No games scheduled."],
      ["2026-11-26", "Thanksgiving. No games scheduled."],
      ["2026-12-24", "Christmas Eve. No games scheduled."],
      ["2026-12-11", "NBA Cup Championship. No regular-season games scheduled."],
      ["2027-02-19", "All-Star break."],
      ["2027-04-10", "League off day before the regular-season finale."],
    ]) {
      await page.goto(`/games?season=2026-27&date=${date}`);
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(page.getByTestId("matchups-heading-controls")).toContainText("0 GAMES");
    }
    await page.goto("/games?season=2026-27&date=2026-12-04");
    await expect(page.getByText("NBA Cup schedule pending. Matchups to be announced.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("matchups-heading-controls")).toContainText("TBD GAMES");
    await expect(page.getByTestId("slate-summary-line")).toContainText("TBD");
    const group = page.getByRole("group", { name: width < 640 ? "Week" : "Date", exact: true }).filter({ visible: true });
    await expect(group.locator('[aria-current="date"]')).toContainText("TBD");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Cup coverage changes after Group Play and after the selected date", async ({ page }) => {
  await fixture(page, "2026-11-28T17:00:00Z");
  await page.goto("/games?season=2026-27&date=2026-12-04");
  await expect(page.getByText("NBA Cup schedule not available.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("slate-summary-line")).toContainText("TBD");
  await page.clock.setFixedTime(new Date("2026-12-04T17:00:00Z"));
  await page.reload();
  await expect(page.getByText("No regular-season games listed for this day.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("matchups-heading-controls")).toContainText("— GAMES");
});

test("failed empty-date request remains an error", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/games/2026-12-04", route => route.fulfill({ status: 500, json: { data: null, error: "Schedule unavailable" } }));
  await page.goto("/games?season=2026-27&date=2026-12-04");
  await expect(page.locator("#main").getByRole("alert")).toContainText("FAILED TO LOAD GAMES");
  await expect(page.getByText("NBA Cup schedule pending. Matchups to be announced.", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("matchups-heading-controls")).toContainText("— GAMES");
});


test("real games override a stale empty index and preserve a measured zero", async ({ page }) => {
  await fixture(page);
  const game = releaseGame("2026-12-04");
  game.restAdvantage = { differential: 0, advantageTeam: "neutral" };
  await page.route("**/api/games/2026-12-04", route => route.fulfill({ json: { data: [game], error: null } }));
  await page.goto("/games?season=2026-27&date=2026-12-04");
  await expect(page.getByRole("button", { name: /^Expand .* game details$/ })).toHaveCount(1);
  await expect(page.getByTestId("matchups-heading-controls")).toContainText("1 GAME");
  await expect(page.getByTestId("slate-summary-line")).toContainText("0.0");
  await expect(page.getByRole("group", { name: "Date", exact: true }).filter({ visible: true }).locator('[aria-current="date"]')).toContainText("1 GM");
  await expect(page.getByText("NBA Cup schedule pending. Matchups to be announced.", { exact: true })).toHaveCount(0);
});


test("loading an empty date keeps its count unknown until the response succeeds", async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/games/2026-12-04", async route => {
    await gate;
    await route.fulfill({ json: { data: [], error: null } });
  });
  await page.goto("/games?season=2026-27&date=2026-12-04");
  await expect(page.getByTestId("selected-date-display")).toContainText("DECEMBER 4, 2026");
  await expect(page.getByTestId("matchups-heading-controls")).toContainText("— GAMES");
  await expect(page.getByTestId("slate-summary-line")).not.toContainText("TBD");
  await expect(page.getByText("NBA Cup schedule pending. Matchups to be announced.", { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByTestId("matchups-heading-controls")).toContainText("TBD GAMES");
});
