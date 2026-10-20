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

  test(`officiating keeps explicit unpublished current selected at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/officiating");
    const selector = page.locator("#officiating-season");
    await expect(selector).not.toHaveValue("2026-27");
    const published = await selector.inputValue();
    await selector.selectOption("2026-27");
    await expect(selector).toHaveValue("2026-27");
    await expect(page.getByRole("heading", { name: "Awaiting results · 2026-27" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Season finding" })).toHaveCount(0);
    await page.reload();
    await expect(selector).toHaveValue("2026-27");
    await page.getByRole("link", { name: `View published results · ${published}` }).click();
    await expect(selector).toHaveValue(published);
    await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
    await page.goBack();
    await expect(selector).toHaveValue("2026-27");
    await expect(page.getByRole("heading", { name: "Awaiting results · 2026-27" })).toBeVisible();
    await page.goForward();
    await expect(selector).toHaveValue(published);
  });
}

test("report current publication stays held during delayed and failed readiness", async ({ page }) => {
  await reportFixtures(page, ["2024-25", "2026-27"]);
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/season-readiness?*", async route => {
    await wait;
    await route.fulfill({ status: 503, json: { data: null, error: "Unavailable" } });
  });
  await page.goto("/season");
  await expect(page.locator("#season-report-season")).toHaveValue("2024-25");
  await page.locator("#season-report-season").selectOption("2026-27");
  await expect(page.getByText("Checking season data…", { exact: true })).toBeVisible();
  await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
  finish();
  await expect(page.locator("main").getByRole("alert")).toContainText("COULD NOT CHECK SEASON DATA");
  await expect(page.locator("#season-report-season")).toHaveValue("2026-27");
  await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
});

test("shot value defaults to its actual publication and keeps an explicit unpublished current awaiting", async ({ page }) => {
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
  await expect(selector).toHaveValue("2024-25");
  await expect(page.locator('[data-shot-anchor="two-court"]')).toBeVisible();
  await selector.selectOption("2026-27");
  await expect(selector).toHaveValue("2026-27");
  await expect(page.getByRole("heading", { name: "Awaiting results · 2026-27" })).toBeVisible();
  await expect(page.locator('[data-shot-anchor="two-court"]')).toHaveCount(0);
  await page.goBack();
  await expect(selector).toHaveValue("2024-25");
  await expect(page.locator('[data-shot-anchor="two-court"]')).toBeVisible();
  await page.goForward();
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
