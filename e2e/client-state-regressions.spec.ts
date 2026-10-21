import { expect, test, type Page } from "@playwright/test";
import { releaseDates, releaseGame } from "./fixtures/release-data";
import type { TeamScheduleGame } from "../src/types";

const SEASON = "2024-25";

async function mockSlates(page: Page) {
  const reads: string[] = [];
  await page.route("**/api/games/dates?*", (route) => route.fulfill({
    json: { data: releaseDates(new URL(route.request().url()).searchParams.get("season") ?? SEASON), error: null },
  }));
  await page.route(/\/api\/games\/\d{4}-\d{2}-\d{2}$/, (route) => {
    const date = new URL(route.request().url()).pathname.split("/").at(-1)!;
    reads.push(date);
    return route.fulfill({ json: { data: [releaseGame(date)], error: null } });
  });
  return reads;
}

test("active Games navigation restores its date and reload preserves that view", async ({ page }) => {
  await mockSlates(page);
  await page.goto(`/games?season=${SEASON}&date=2024-12-25`);
  const selected = page.getByTestId("selected-date-display");
  await expect(selected).toContainText("DECEMBER 25, 2024");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "GAMES", exact: true }).click();
  await expect(selected).toContainText("JANUARY 2, 2025");
  await expect(page).toHaveURL(/date=2025-01-02/);
  await page.reload();
  await expect(selected).toContainText("JANUARY 2, 2025");
});

test("same-page date history restores A to B to A and ignores game expansion", async ({ page }) => {
  const reads = await mockSlates(page);
  await page.goto(`/games?season=${SEASON}&date=2024-12-24`);
  const selected = page.getByTestId("selected-date-display");
  await expect(page.locator(".fc-game-row")).toHaveCount(1);
  const move = (date: string) => page.evaluate(({ season, date }) => {
    window.history.pushState(null, "", `/games?season=${season}&date=${date}`);
  }, { season: SEASON, date });
  await move("2024-12-25");
  await expect(selected).toContainText("DECEMBER 25, 2024");
  await move("2024-12-24");
  await expect(selected).toContainText("DECEMBER 24, 2024");
  await expect(page.locator(".fc-game-row")).toHaveCount(1);
  await page.locator(".fc-game-grid").click();
  await expect(page.locator(".fc-game-grid")).toHaveAttribute("aria-expanded", "true");
  expect(reads).toEqual(["2024-12-24", "2024-12-25", "2024-12-24"]);
  await page.goBack();
  await expect(page.locator(".fc-game-grid")).toHaveAttribute("aria-expanded", "false");
  await page.goBack();
  await expect(selected).toContainText("DECEMBER 25, 2024");
  await page.goForward();
  await expect(selected).toContainText("DECEMBER 24, 2024");
});

test("calendar deadline exposes dates-only retry while preserving the loaded slate", async ({ page }) => {
  await mockSlates(page);
  await page.clock.install({ time: new Date("2026-10-22T12:00:00Z") });
  let hang = true;
  await page.route("**/api/games/dates?*", (route) => {
    if (hang) return;
    return route.fulfill({ json: { data: releaseDates(SEASON), error: null } });
  });
  await page.goto(`/games?season=${SEASON}&date=2024-12-25`);
  await expect(page.locator(".fc-game-row")).toHaveCount(1);
  await page.clock.fastForward(12_001);
  const failure = page.locator("#main").getByRole("alert");
  await expect(failure).toContainText("FAILED TO LOAD DATES");
  await expect(failure).toContainText("Request timed out. Try again.");
  await expect(page.locator(".fc-game-row")).toHaveCount(1);
  hang = false;
  await page.getByRole("button", { name: "RETRY DATES" }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Date", exact: true })).toBeVisible();
  await expect(page.locator(".fc-game-row")).toHaveCount(1);
});

test("cancelled A to B to A slate responses cannot replace the current game", async ({ page }) => {
  await mockSlates(page);
  const release: Array<() => void> = [];
  const requested: string[] = [];
  let completed = 0;
  await page.route(/\/api\/games\/\d{4}-\d{2}-\d{2}$/, async (route) => {
    const date = new URL(route.request().url()).pathname.split("/").at(-1)!;
    requested.push(date);
    const requestNumber = requested.length;
    if (requestNumber < 3) await new Promise<void>((resolve) => release.push(resolve));
    const game = { ...releaseGame(date), homeScore: requestNumber === 3 ? 220 : 110 };
    await route.fulfill({ json: { data: [game], error: null } }).catch(() => undefined);
    completed += 1;
  });
  await page.goto(`/games?season=${SEASON}&date=2024-12-24`);
  await expect.poll(() => requested.length).toBe(1);
  await page.evaluate(() => window.history.pushState(null, "", "/games?season=2024-25&date=2024-12-25"));
  await expect.poll(() => requested.length).toBe(2);
  await page.evaluate(() => window.history.pushState(null, "", "/games?season=2024-25&date=2024-12-24"));
  await expect(page.locator(".fc-game-grid")).toContainText("220");
  release.forEach((resolve) => resolve());
  await expect.poll(() => completed).toBe(3);
  await expect(page.getByTestId("selected-date-display")).toContainText("DECEMBER 24, 2024");
  await expect(page.locator(".fc-game-grid")).toContainText("220");
  expect(requested).toEqual(["2024-12-24", "2024-12-25", "2024-12-24"]);
});

test("Officiating applies a team filter in the same tick", async ({ page }) => {
  await page.goto("/officiating?season=2024-25");
  await page.locator('section[aria-labelledby="review-title"] summary').first().waitFor();
  const result = await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Team"]')!;
    const rows = () => Array.from(document.querySelectorAll('section[aria-labelledby="review-title"] summary'), (row) => row.textContent ?? "");
    const before = rows();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "NYK");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { value: select.value, before, after: rows() };
  });
  expect(result.value).toBe("NYK");
  expect(result.before.some((row) => !row.includes("NYK"))).toBe(true);
  expect(result.after.length).toBeGreaterThan(0);
  expect(result.after.every((row) => row.includes("NYK"))).toBe(true);
  const burst = await page.evaluate(async () => {
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Team"]')!;
    const set = (value: string) => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return select.value;
    };
    const first = set("BOS");
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { first, second: set("NYK") };
  });
  expect(burst).toEqual({ first: "BOS", second: "NYK" });
});

test("a failed team schedule refresh keeps rows visible and retry recovers", async ({ page }) => {
  const game = releaseGame("2024-12-25");
  const schedule: TeamScheduleGame = {
    id: game.id, date: game.date, tipOffEt: game.tipOffEt, tipOffUtc: game.tipOffUtc,
    status: game.status, isHome: true, neutralCity: null, opponent: game.awayTeam,
    teamScore: game.homeScore, opponentScore: game.awayScore,
    restAdvantage: game.restAdvantage, projectedFatigue: false,
  };
  let failing = false;
  let requests = 0;
  await page.route("**/api/games/team?*", (route) => {
    requests += 1;
    return route.fulfill({ status: failing ? 503 : 200,
      json: failing ? { data: null, error: "Temporary failure" } : { data: [schedule], error: null } });
  });
  await page.goto(`/games/team?season=${SEASON}&team=BOS`);
  await expect(page.getByTestId("team-game-row")).toHaveCount(1);
  await page.waitForTimeout(2_100);
  failing = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByText("Schedule refresh unavailable", { exact: true })).toBeVisible();
  await expect(page.getByTestId("team-game-row")).toHaveCount(1);
  expect(requests).toBe(2);
  failing = false;
  await page.getByRole("button", { name: "Retry schedule" }).click();
  await expect(page.getByText("Schedule refresh unavailable", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("team-game-row")).toHaveCount(1);
});
