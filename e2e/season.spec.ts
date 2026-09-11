import { expect, test } from "@playwright/test";

test.describe("Season Report", () => {
  test("shows outcomes and preserves season selection through reload and navigation", async ({ page }) => {
    await page.goto("/season?season=2015-16");
    await expect(page.getByTestId("season-rest-win-rate")).toContainText("%");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2015-16 vs history");
    await expect(page.getByTestId("edge-conversion-row")).toHaveCount(30);
    await expect(page.getByTestId("loudest-call-row")).toHaveCount(5);
    await expect(page.getByTestId("schedule-tax-row")).toHaveCount(0);
    await expect(page.getByTestId("fatigue-calendar")).toHaveCount(0);
    await expect(page.getByTestId("swing-baseline-note")).toContainText("not zero");
    await expect(page.getByTestId("season-as-of")).toHaveText(/^AS OF 2016-0[45]-\d{2}$/);
    await page.getByLabel("SEASON", { exact: true }).selectOption("2024-25");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2024-25 vs history");
    await page.reload();
    await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "SCHEDULE EDGE" }).click();
    await expect(page).toHaveURL(/\/schedule\?season=2024-25/);
    await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
  });

  test("flags exceptional calendars and explains a Schedule Edge fallback", async ({ page }) => {
    await page.goto("/season?season=2019-20");
    await expect(page.getByTestId("abnormal-season-note")).toContainText("Orlando bubble");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "SCHEDULE EDGE" }).click();
    await expect(page.getByRole("status")).toContainText("2019-20 is unavailable on this page");
  });

  test("upcoming season has one awaiting-results state", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-08T12:00:00Z"));
    await page.route("**/api/season-report?season=2026-27*", route => route.fulfill({json:{data:{season:"2026-27",basis:"schedule",completedGames:0,scheduledGames:1200,latestFinalDate:null,seasonComplete:false,homeRate:{games:0,homeWins:0,winPct:0},overall:{games:0,restedTeamWins:0,winPct:0,band:null},teams:[],weeks:[],loudestCalls:[]},error:null}}));
    await page.goto("/season?season=2026-27");
    await expect(page.getByTestId("season-awaiting-results")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "View 2025-26 report" })).toBeVisible();
    await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
    await expect(page.getByTestId("schedule-tax-row")).toHaveCount(0);
  });

  test("mobile records keep team, both samples and difference on screen", async ({ page }) => {
    await page.setViewportSize({ width:390,height:844 });
    await page.goto("/season?season=2024-25");
    const row = page.getByTestId("edge-conversion-row").first();
    await expect(row).toBeVisible();
    const bounds=await row.boundingBox();
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  });
});
