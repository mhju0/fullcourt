import { expect, test, type Page } from "@playwright/test";
import { releaseGame } from "./fixtures/release-data";

async function fixture(page: Page, overtimePeriods?: number, records = true) {
  await page.clock.setFixedTime(new Date("2026-10-26T16:00:00Z"));
  const game = releaseGame("2026-10-24");
  game.overtimePeriods = overtimePeriods;
  game.awayTeam = { id: 2, name: "Trail Blazers", abbreviation: "POR", city: "Portland" };
  game.records = records ? { home: { wins: 1, losses: 1 }, away: { wins: 2, losses: 0 } } : undefined;
  await page.route("**/api/games/dates?*", route => route.fulfill({ json: { data: [{ date: game.date, gameCount: 1 }], error: null } }));
  await page.route("**/api/games/upcoming?*", route => route.fulfill({ json: { data: [], error: null } }));
  await page.route("**/api/games/2026-10-24", route => route.fulfill({ json: { data: [game], error: null } }));
  await page.goto("/games?season=2026-27&date=2026-10-24");
  return page.getByRole("button", { name: /^Expand .* game details$/ });
}

for (const width of [320, 390, 1440]) {
  test(`overtime and entering records stay subordinate and usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const row = await fixture(page, 2);
    await expect(row).toContainText("FINAL/2OT");
    await expect(row).toContainText("(2–0)");
    await expect(row).toContainText("(1–1)");
    await expect(row).toHaveAccessibleName(/Trail Blazers \(2 wins, 0 losses entering this game\).*Celtics \(1 wins, 1 losses entering this game\).*after 2 overtimes/);
    for (const record of await row.locator("[title='Regular-season record entering this game']").all()) {
      expect(await record.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(record).toBeVisible();
    }
    await page.screenshot({ path: `.local/games-ui-ot-records-${width}.png`, fullPage: true });
    const labelLines = await row.getByText("FINAL/2OT", { exact: true }).evaluate(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => rect.top)).size;
    });
    expect(labelLines).toBe(1);
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^Collapse .* game details$/ })).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: `.local/games-ui-ot-records-${width}-expanded.png`, fullPage: true });
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
    const headingFits = await page.getByTestId("matchups-heading-controls").evaluate(el => {
      const heading = el.querySelector("h2")!.getBoundingClientRect();
      const checked = el.querySelector("time")!.getBoundingClientRect();
      return heading.right <= checked.left || heading.bottom <= checked.top || checked.bottom <= heading.top;
    });
    expect(headingFits).toBe(true);
    await page.screenshot({ path: `.local/games-ui-ot-records-${width}-text200.png`, fullPage: true });
    const statusFits = await page.locator(".fc-game-status").evaluate(el => {
      const team = el.parentElement!.querySelector(".fc-game-teams")!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()].every(rect => rect.right <= team.left);
    });
    expect(statusFits).toBe(true);
    const nameBoxes = await page.locator(".fc-game-teams > div > span.truncate:not(.hidden)").evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }));
    expect(nameBoxes[0].bottom).toBeLessThanOrEqual(nameBoxes[1].top);
    const recordBoxes = await page.locator("[title='Regular-season record entering this game']").evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }));
    expect(recordBoxes[0].bottom).toBeLessThanOrEqual(recordBoxes[1].top);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("older cached payloads preserve final results without inventing records", async ({ page }) => {
  const row = await fixture(page, undefined, false);
  await expect(row).toContainText("FINAL");
  await expect(row).not.toContainText("FINAL/OT");
  await expect(row.locator("[title='Regular-season record entering this game']")).toHaveCount(0);
});

test("By Team reports the current game's overtime without changing its result", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T16:00:00Z"));
  await page.route("**/api/games/team?*", route => route.fulfill({ json: { data: [{
    id: 118730, date: "2026-10-24", status: "final", tipOffEt: "9:00 PM ET", tipOffUtc: "2026-10-25T01:00:00Z",
    isHome: true, neutralCity: null, opponent: { id: 29, name: "Pelicans", abbreviation: "NOP", city: "New Orleans" },
    teamScore: 141, opponentScore: 135, overtimePeriods: 1, restAdvantage: { differential: 4.89, advantageTeam: "home" }, projectedFatigue: false,
  }], error: null } }));
  await page.goto("/games/team?season=2026-27&team=DEN");
  await expect(page.getByTestId("team-game-row")).toContainText("W 141–135 FINAL/OT");
});

for (const width of [390, 1440]) {
  test(`single overtime and entering records remain visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const row = await fixture(page, 1);
    await expect(row).toContainText("FINAL/OT");
    await expect(row).not.toContainText("FINAL/2OT");
    await expect(row).toContainText("100–110");
  });
}
