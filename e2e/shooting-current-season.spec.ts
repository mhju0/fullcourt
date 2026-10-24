import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { PlayerRestPayload } from "../src/lib/player-rest";

const historical: PlayerRestPayload = {
  generated: "2026-10-23", names: ["Test Player"], teams: ["BOS"],
  seasons: [[0, 2025, 0, 25, 70, 1000, 50, 200, 48, 300, 52, 1000, 192, 312, 2000, 384, 624]],
  shrunk: [[0, 4, 4.6, 0.4]],
};
const earlyCurrent: PlayerRestPayload = {
  ...historical, names: [...historical.names, "Current Player"], seasonOnlyPlayers: [1],
  seasons: [...historical.seasons, [1, 2026, 0, 26, 1, 1, 150, 0, 0, 0, 0, 3, 0, 0, 9, 0, 0]],
};
async function playerExport(page: Page, data = historical) {
  await page.route("**/api/player-rest", route => route.fulfill({ json: data }));
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-23T12:00:00Z"));
});

for (const width of [1280, 390]) {
  test(`latest publication defaults and an explicit unobserved season stays awaiting at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await playerExport(page);
    await page.goto("/shooting");
    const main = page.locator("main");
    await expect(main.locator("#pr-season")).toHaveValue("2025");
    await expect(main.getByTestId("player-row")).toHaveCount(1);
    await expect(main).toContainText("2026-27 awaiting results");
    await main.locator("#pr-season").selectOption("2026");
    await expect(main.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
    await expect(main.getByTestId("season-data-guide")).toHaveCount(1);
    await expect(main.getByTestId("player-row")).toHaveCount(0);
    const previous = main.getByRole("link", { name: /View published results/ });
    await expect(previous).toHaveAttribute("href", "/shooting?year=2025");
    expect((await previous.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(violations.map(({ id }) => id)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`shooting-awaiting-${width}.png`) });
    await previous.click();
    await expect(main.locator("#pr-season")).toHaveValue("2025");
    await expect(main.getByTestId("player-row")).toHaveCount(1);
    await page.goBack();
    await expect(main.locator("#pr-season")).toHaveValue("2026");
    await expect(main.getByTestId("player-row")).toHaveCount(0);
  });
}

test("current observations bypass game-count readiness and keep missing comparisons unavailable", async ({ page }) => {
  await playerExport(page, earlyCurrent);
  let readinessReads = 0;
  await page.route("**/api/season-readiness?*", route => {
    readinessReads++;
    return route.fulfill({ status: 500, json: { data: null, error: "Unavailable" } });
  });
  await page.goto("/shooting");
  await expect(page.locator("#pr-season")).toHaveValue("2026");
  await expect(page.locator("#pr-volume")).toHaveValue("0");
  const row = page.getByTestId("player-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("150.0% eFG");
  for (const column of [3, 5]) await expect(row.locator("td").nth(column)).toHaveText("0");
  for (const column of [1, 2, 4]) await expect(row.locator("td").nth(column)).toHaveText("—");
  expect(readinessReads).toBe(0);
  await page.getByText(/^Advanced filters/).click();
  await page.locator("#pr-volume").selectOption("300");
  await expect(page).toHaveURL(/volume=300/);
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#pr-volume")).toHaveValue("300");
  await expect(row).toHaveCount(0);
});

test("current provider rows do not hold or silently join historical careers", async ({ page }) => {
  await playerExport(page, earlyCurrent);
  await page.goto("/shooting?year=career&volume=0");
  await expect(page.getByTestId("player-row")).toHaveCount(1);
  await expect(page.getByTestId("player-row")).toContainText("Test Player");
  await expect(page.getByTestId("player-row")).not.toContainText("Current Player");
  await page.getByTestId("player-row").getByRole("button").click();
  await expect(page.getByTestId("career-row")).toBeVisible();
  await expect(page.getByTestId("season-row")).toHaveCount(1);
  await expect(page.locator("main")).toContainText("Historical career gap (2025-26 through 2025-26)");
});

test("an export loading failure is retryable instead of appearing as unpublished data", async ({ page }) => {
  let fail = true;
  await page.route("**/api/player-rest", route => route.fulfill({
    status: fail ? 500 : 200, json: fail ? { error: "Unavailable" } : historical,
  }));
  await page.goto("/shooting");
  const main = page.locator("main");
  await expect(main.getByRole("alert")).toContainText("FAILED TO LOAD THE PLAYER DATABASE");
  await expect(main.getByTestId("season-data-guide")).toHaveCount(0);
  fail = false;
  await main.getByRole("button", { name: "Retry player data" }).click();
  await expect(main.locator("#pr-season")).toHaveValue("2025");
  await expect(main.getByTestId("player-row")).toHaveCount(1);
});
