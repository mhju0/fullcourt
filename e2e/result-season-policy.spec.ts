import { expect, test, type Page } from "@playwright/test";
import { buildSeasonReport } from "../src/lib/season-report";

async function reportFixtures(page: Page, seasons: string[], ready = true) {
  await page.route("**/api/season-report-publication", route => route.fulfill({ json: { data: { seasons }, error: null } }));
  await page.route("**/api/season-readiness?*", route => route.fulfill({ json: {
    data: { season: "2026-27", ready, expectedAfterDate: null }, error: null,
  } }));
  await page.route("**/api/analysis*", route => route.fulfill({ json: { data: { seasonWinRates: [] }, error: null } }));
  await page.route("**/api/season-report?*", route => {
    const season = new URL(route.request().url()).searchParams.get("season")!;
    return route.fulfill({ json: { data: {
      ...buildSeasonReport(season, []), basis: "played", completedGames: 150,
      homeRate: { games: 150, homeWins: 90, winPct: 60 },
    }, error: null } });
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
});

for (const width of [390, 1280]) {
  test(`report defaults across publication gaps and preserves explicit current with Back/Forward at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await reportFixtures(page, ["2022-23", "2024-25"]);
    await page.goto("/season");
    const selector = page.locator("#season-report-season");
    await expect(selector).toHaveValue("2024-25");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2024-25 vs history");
    await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
    await selector.selectOption("2026-27");
    await expect(page.getByRole("heading", { name: "Awaiting results · 2026-27" })).toBeVisible();
    await expect(selector).toHaveValue("2026-27");
    await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
    await page.goBack();
    await expect(selector).toHaveValue("2024-25");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2024-25 vs history");
    await page.goForward();
    await expect(selector).toHaveValue("2026-27");
    await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`officiating defaults to published current results and preserves season history at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/officiating");
    const selector = page.locator("#officiating-season");
    await expect(selector).toHaveValue("2026-27");
    await expect(page.getByRole("region", { name: "Season finding" })).toBeVisible();
    await expect(page.getByText(/Season to date: published reports so far/)).toBeVisible();
    await expect(page.getByText(/Last successful refresh.* ET/)).toBeVisible();
    await expect(page.getByText(/Latest daily update check.* ET/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: testInfo.outputPath("officiating-390.png") });
    await selector.selectOption("2025-26");
    await page.reload();
    await expect(selector).toHaveValue("2025-26");
    await selector.selectOption("2026-27");
    await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
    await page.goBack();
    await expect(selector).toHaveValue("2025-26");
    await page.goForward();
    await expect(selector).toHaveValue("2026-27");
  });
}

test("report current publication displays despite a failed unrelated readiness endpoint", async ({ page }) => {
  await reportFixtures(page, ["2024-25", "2026-27"]);
  await page.route("**/api/season-readiness?*", async route => {
    await route.fulfill({ status: 503, json: { data: null, error: "Unavailable" } });
  });
  await page.goto("/season");
  await expect(page.locator("#season-report-season")).toHaveValue("2026-27");
  await expect(page.getByTestId("season-rest-win-rate")).toHaveText("No eligible games");
  await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
});

test("shot value defaults to the current season and keeps historical publications selectable", async ({ page }) => {
  const model = { pMake: 0.6, expectedEfg: 0.6, xpps: 1.2 };
  await page.route("**/api/shot-quality*", route => {
    const season = new URL(route.request().url()).searchParams.get("season") ?? "2024-25";
    const cells = season === "2024-25" ? [{
      cellX: 0, cellY: 1, zoneBasic: "Restricted Area", zoneRange: "Less Than 8 ft.", zoneArea: "Center(C)",
      fga: 100, fgm: 60, fg3a: 0, fg3m: 0, gbm: model, baseline: model,
    }] : [];
    return route.fulfill({ json: { data: {
      season, latestPublishedSeason: "2024-25", previousPublishedSeason: "2022-23",
      activeModel: "gbm-v1", cells, meta: { cellCount: cells.length, totalFga: cells.length * 100 },
    }, error: null } });
  });
  await page.goto("/shot-quality");
  const selector = page.locator("#shot-quality-season");
  await expect(selector).toHaveValue("2026-27");
  await expect(page.getByRole("heading", { name: "Awaiting season data · 2026-27" })).toBeVisible();
  await expect(page.locator('[data-shot-anchor="two-court"]')).toHaveCount(0);
  await selector.selectOption("2024-25");
  await expect(selector).toHaveValue("2024-25");
  await expect(page.locator('[data-shot-anchor="two-court"]')).toBeVisible();
  await page.goBack();
  await expect(selector).toHaveValue("2026-27");
  await expect(page.getByRole("heading", { name: "Awaiting season data · 2026-27" })).toBeVisible();
  await expect(page.locator('[data-shot-anchor="two-court"]')).toHaveCount(0);
  await page.goForward();
  await expect(selector).toHaveValue("2024-25");
  await expect(page.locator('[data-shot-anchor="two-court"]')).toBeVisible();
  await page.goBack();
  await expect(selector).toHaveValue("2026-27");
  await expect(page.locator('[data-shot-anchor="two-court"]')).toHaveCount(0);
});

test("playoffs follows its own latest publication without the regular-season gate", async ({ page }) => {
  let readinessReads = 0;
  await page.route("**/api/season-readiness?*", route => {
    readinessReads++;
    return route.fulfill({ status: 503, json: { data: null, error: "Unavailable" } });
  });
  await page.route("**/api/playoffs*", route => {
    const season = new URL(route.request().url()).searchParams.get("season") ?? "2024-25";
    return route.fulfill({ json: { data: { season, latestPublishedSeason: "2024-25", rounds: [] }, error: null } });
  });
  await page.goto("/playoffs");
  await expect(page.locator("#playoffs-season")).toHaveValue("2024-25");
  await page.locator("#playoffs-season").selectOption("2026-27");
  await expect(page.locator("#playoffs-season")).toHaveValue("2026-27");
  await expect(page.getByTestId("season-data-guide")).toContainText("2026-27");
  await expect(page.getByTestId("season-data-guide")).toContainText("have not been published");
  expect(readinessReads).toBe(0);
});
