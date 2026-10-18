import { test, expect } from "@playwright/test";
import type { TeamScheduleGame } from "../src/types";

// Synthetic schedule rows exercise mixed states without depending on the live clock.
const row: TeamScheduleGame = {
  id: 1, date: "2026-10-20", status: "scheduled", tipOffEt: "7:00 PM ET",
  tipOffUtc: "2026-10-20T23:00:00Z", isHome: true, neutralCity: null,
  opponent: { id: 2, name: "Trail Blazers", city: "Portland", abbreviation: "POR" },
  teamScore: null, opponentScore: null,
  restAdvantage: { differential: 5, advantageTeam: "home" }, projectedFatigue: true,
};

for (const width of [320, 390, 768, 1440]) {
  test(`team schedule headings stay on one line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-10-18T18:00:00Z"));
    await page.route("**/api/games/team?*", route => route.fulfill({ json: { data: [
      { ...row, id: 2, date: "2026-10-18", status: "final", teamScore: 110, opponentScore: 100, projectedFatigue: false },
      row,
    ], error: null } }));
    await page.goto("/games/team?season=2026-27&team=BOS");
    await expect(page.getByTestId("team-game-row")).toHaveCount(2);
    await expect(page.getByText(/Tip-off times are Eastern Time \(ET\)/)).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "TIME", exact: true })).toHaveCount(0);
    const dimensions = await page.locator("table.fc-table thead th").evaluateAll(headers => headers
      .filter(header => header.getBoundingClientRect().width > 0)
      .map(header => {
        const range = document.createRange(); range.selectNodeContents(header);
        const box = range.getBoundingClientRect();
        return { height: box.height, lineHeight: parseFloat(getComputedStyle(header).lineHeight), scroll: header.scrollWidth, width: header.clientWidth };
      }));
    for (const header of dimensions) {
      expect(header.height).toBeLessThanOrEqual(header.lineHeight + 2);
      expect(header.scroll).toBeLessThanOrEqual(header.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const rows = page.getByTestId("team-game-row");
    await expect(page.getByRole("columnheader", { name: "GAME", exact: true })).toBeVisible();
    await expect(rows.nth(0).locator("td").nth(3)).toHaveText("W 110–100");
    await expect(rows.nth(1).locator("td").nth(3)).toHaveText("7:00 PM");
    await expect(rows.nth(0).locator("td").nth(1)).not.toContainText(/W|110|100/);
    await expect(rows.nth(0).getByTestId("team-game-link")).toHaveAccessibleName(/Portland Trail Blazers/);
    const visibleHeaders = await page.locator("table.fc-table th").evaluateAll(headers => headers
      .filter(header => header.getBoundingClientRect().width > 0).map(header => header instanceof HTMLElement ? header.innerText.trim() : ""));
    expect(visibleHeaders).toEqual(width < 640 ? ["DATE", "OPPONENT", "GAME", "RA"] : ["#", "DATE", "OPPONENT", "GAME", "REST GAP"]);
    if (width < 640) {
      await expect(page.getByRole("columnheader", { name: "Rest advantage", exact: true })).toBeVisible();
      await expect(rows.nth(0).getByTestId("team-game-link")).toHaveText("POR", { useInnerText: true });
      const heights = await rows.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator("table.fc-table").evaluate(table => table.scrollWidth <= table.parentElement!.clientWidth)).toBe(true);
  });
}

for (const width of [320, 1440]) {
  test(`unscheduled Cup games preserve their numbering and span at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-10-18T18:00:00Z"));
    const games = Array.from({ length: 80 }, (_, index) => ({
      ...row, id: index + 1, date: new Date(Date.UTC(2026, 9, 20 + index * 2)).toISOString().slice(0, 10),
    }));
    await page.route("**/api/games/team?*", route => route.fulfill({ json: { data: games, error: null } }));
    await page.goto("/games/team?season=2026-27&team=BOS");
    await expect(page.getByTestId("team-game-row")).toHaveCount(80);
    const cup = page.getByTestId("cup-placeholder-row");
    await expect(cup).toHaveCount(2);
    await expect(cup.first()).toContainText("Early Dec");
    await expect(cup.first().locator("td[colspan='3']")).toHaveText("NBA CUP GAME · TBD");
    await expect(cup.first().getByRole("link")).toHaveCount(0);
    await expect(page.getByTestId("team-game-row").last().locator("td").first()).toHaveText("82");
    const spans = await cup.first().locator("td").evaluateAll(cells => cells
      .filter(cell => cell.getBoundingClientRect().width > 0).reduce((sum, cell) => sum + Number(cell.getAttribute("colspan") ?? 1), 0));
    expect(spans).toBe(width < 640 ? 4 : 5);
    expect(await page.locator("table.fc-table").evaluate(table => table.scrollWidth <= table.parentElement!.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
