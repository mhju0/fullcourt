import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { PlayerRestPayload } from "../src/lib/player-rest";

const historical: PlayerRestPayload = {
  generated: "2026-10-19", names: ["Test Player"], teams: ["BOS"],
  seasons: [[0, 2025, 0, 25, 70, 1000, 50, 200, 48, 300, 52]],
  shrunk: [[0, 4, 1.5, 3]],
};
const earlyCurrent: PlayerRestPayload = {
  ...historical,
  seasons: [...historical.seasons, [0, 2026, 0, 26, 5, 98765, 65, 100, 60, 100, 70]],
};
async function playerExport(page: Page, data = historical) {
  await page.route("**/data/player-rest.json", route => route.fulfill({ json: data }));
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-19T12:00:00Z"));
});

for (const width of [1280, 390]) {
  test(`latest publication defaults and explicit current stays awaiting at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await playerExport(page);
    await page.goto("/shooting");
    const main = page.locator("main");
    await expect(main.locator("#pr-season")).toHaveValue("2025");
    await expect(main.getByTestId("player-row")).toHaveCount(1);
    await expect(main).toContainText("Showing 2025-26, the latest published results.");
    await main.locator("#pr-season").selectOption("2026");
    await expect(main.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
    await expect(main.getByTestId("season-data-guide")).toHaveCount(1);
    await expect(main.locator("#pr-season")).toHaveValue("2026");
    await expect(main.getByTestId("player-row")).toHaveCount(0);
    await expect(main.getByRole("searchbox")).toHaveCount(0);
    await expect(main.locator("#pr-team")).toHaveCount(0);
    await expect(main.getByText("Show zero-rest player workload")).toHaveCount(0);
    const previous = main.getByRole("link", { name: /View published results/ });
    await expect(previous).toHaveAttribute("href", "/shooting?year=2025");
    expect((await previous.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await main.getByTestId("season-data-guide").locator("p").first().evaluate(el => getComputedStyle(el).fontSize)).toBe("15px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(violations.map(({ id }) => id)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`shooting-current-${width}.png`), fullPage: true });

    await previous.click();
    await expect(main.locator("#pr-season")).toHaveValue("2025");
    await expect(main.getByTestId("player-row")).toHaveCount(1);
    await expect(main.getByTestId("season-data-guide")).toHaveCount(0);
    await main.locator("#pr-season").selectOption("2026");
    await expect(main.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
    await expect(main.getByTestId("player-row")).toHaveCount(0);
    await page.goBack();
    await expect(main.locator("#pr-season")).toHaveValue("2025");
    await expect(main.getByTestId("player-row")).toHaveCount(1);
    await page.goBack();
    await expect(main.locator("#pr-season")).toHaveValue("2026");
    await expect(main.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
    await page.goBack();
    await expect(main.locator("#pr-season")).toHaveValue("2025");
    await expect(main.getByTestId("player-row")).toHaveCount(1);
    await page.goForward();
    await expect(main.locator("#pr-season")).toHaveValue("2026");
    await expect(main.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
  });
}

test("explicit current selection stays awaiting even if games are ready but its export is unpublished", async ({ page }) => {
  await playerExport(page);
  let readinessReads = 0;
  await page.route("**/api/season-readiness?*", route => {
    readinessReads++;
    return route.fulfill({ json: { data: { season: "2026-27", ready: true, expectedAfterDate: null }, error: null } });
  });
  await page.goto("/shooting?year=2026");
  await expect(page.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
  await expect(page.getByTestId("player-row")).toHaveCount(0);
  expect(readinessReads).toBe(0);
});

test("a current-containing export preserves retry, career and historical-expansion guards", async ({ page }) => {
  await playerExport(page, earlyCurrent);
  let fail = true;
  let released = false;
  await page.route("**/api/season-readiness?*", route => route.fulfill({
    status: fail ? 500 : 200,
    json: fail ? { data: null, error: "Data status unavailable" } : {
      data: { season: "2026-27", ready: released, expectedAfterDate: null }, error: null,
    },
  }));
  await page.goto("/shooting?year=2026");
  const main = page.locator("main");
  await expect(main.getByRole("alert")).toContainText("COULD NOT CHECK SEASON DATA");
  await expect(main.getByTestId("player-row")).toHaveCount(0);
  fail = false;
  await main.getByRole("button", { name: "Retry data status" }).click();
  await expect(main.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
  await main.locator("#pr-season").selectOption("career");
  await expect(main.getByRole("heading", { name: /Awaiting results/ })).toBeVisible();
  await expect(main.getByTestId("player-row")).toHaveCount(0);
  await main.locator("#pr-season").selectOption("2025");
  await expect(main.getByTestId("season-data-guide")).toHaveCount(0);
  await main.getByRole("button", { name: "Expand Test Player shooting details" }).click();
  await expect(main.getByTestId("season-row")).toHaveCount(1);
  await expect(main.getByTestId("season-row")).toContainText("2025-26");
  await expect(main.getByTestId("career-row")).toHaveCount(0);
  await expect(main.getByTestId("career-data-held")).toBeVisible();
  await expect(main).not.toContainText("98,765");
  await main.locator("#pr-season").selectOption("2026");
  released = true;
  await page.reload();
  await expect(main.getByTestId("season-data-guide")).toHaveCount(0);
  await expect(main.locator("#pr-season")).toHaveValue("2026");
  await expect(main.getByTestId("season-row").filter({ hasText: "2026-27" })).toContainText("70.0%");
  await main.locator("#pr-season").selectOption("career");
  await expect(main.getByTestId("player-row")).toHaveCount(1);
});

test("an export loading failure is retryable instead of appearing as unpublished data", async ({ page }) => {
  let fail = true;
  await page.route("**/data/player-rest.json", route => route.fulfill({
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
