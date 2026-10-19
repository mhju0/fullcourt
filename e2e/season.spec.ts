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

  test("without a chosen season, keeps the prior report until current results are released", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-19T12:00:00Z"));
    let currentReportReads = 0;
    await page.route("**/api/season-readiness?season=2026-27", route => route.fulfill({ json: {
      data: { season: "2026-27", ready: false, expectedAfterDate: "2026-11-11" }, error: null,
    } }));
    await page.route("**/api/season-report?season=2026-27*", route => {
      currentReportReads++;
      return route.fulfill({ json: { data: reportFixture("2026-27"), error: null } });
    });
    await page.goto("/season");
    await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2025-26");
    await expect(page.getByTestId("season-default-note")).toContainText("2026-27");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2025-26 vs history");
    await expect(page.getByTestId("season-data-guide")).toContainText("Expected after the November 11 games (ET).");
    await expect(page.getByTestId("season-awaiting-results")).toHaveCount(0);
    expect(currentReportReads).toBe(0);
  });

  test("an explicitly selected upcoming season has one guide with usable links", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-08T12:00:00Z"));
    await page.route("**/api/season-readiness?season=2026-27", route => route.fulfill({ json: {
      data: { season: "2026-27", ready: false, expectedAfterDate: "2026-11-11" }, error: null,
    } }));
    await page.goto("/season?season=2026-27");
    await expect(page.getByTestId("season-awaiting-results")).toHaveCount(1);
    await expect(page.getByTestId("season-data-guide")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "View 2025-26 report" })).toHaveAttribute("href", "/season?season=2025-26");
    await expect(page.getByRole("link", { name: "View 2026-27 schedule" })).toHaveAttribute("href", "/schedule?season=2026-27");
    await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
    await expect(page.getByTestId("season-data-guide")).not.toContainText(/10 games|30 teams/);
  });

  test("released current results retain the separate inference threshold", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-12T12:00:00Z"));
    await page.route("**/api/season-readiness?season=2026-27", route => route.fulfill({ json: {
      data: { season: "2026-27", ready: true, expectedAfterDate: "2026-11-11" }, error: null,
    } }));
    await page.route("**/api/season-report?season=2026-27*", route => route.fulfill({ json: {
      data: reportFixture("2026-27"), error: null,
    } }));
    await page.goto("/season");
    await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2026-27");
    await expect(page.getByTestId("season-rest-win-rate")).toHaveText("Too early");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2026-27 vs history");
    await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
  });

  test("a delayed readiness response respects selection and Back", async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/season-readiness?season=2026-27", async route => {
      await pending;
      await route.fulfill({ json: { data: { season: "2026-27", ready: false, expectedAfterDate: "2026-11-11" }, error: null } });
    });
    await page.route("**/api/season-report?*", route => {
      const season = new URL(route.request().url()).searchParams.get("season")!;
      return route.fulfill({ json: { data: reportFixture(season), error: null } });
    });
    await page.goto("/season?season=2024-25");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2024-25 vs history");
    await page.getByLabel("SEASON", { exact: true }).selectOption("2026-27");
    await expect(page.getByText("Checking season data…", { exact: true })).toBeVisible();
    await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
    await page.getByLabel("SEASON", { exact: true }).selectOption("2025-26");
    release();
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2025-26 vs history");
    await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2026-27");
    await expect(page.getByTestId("season-data-guide")).toBeVisible();
    await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
  });

  test("readiness failures show a retryable error and never unlock current results", async ({ page }) => {
    let fail = true;
    await page.route("**/api/season-readiness?season=2026-27", route => route.fulfill({
      status: fail ? 500 : 200,
      json: fail ? { data: null, error: "Data status unavailable" } : {
        data: { season: "2026-27", ready: false, expectedAfterDate: "2026-11-11" }, error: null,
      },
    }));
    await page.goto("/season?season=2026-27");
    await expect(page.locator("main").getByRole("alert")).toContainText("COULD NOT CHECK SEASON DATA");
    await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
    await expect(page.getByTestId("season-rest-win-rate")).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Retry data status" }).click();
    await expect(page.getByTestId("season-data-guide")).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("an overdue estimate does not promise a future release", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-12T12:00:00Z"));
    await page.route("**/api/season-readiness?season=2026-27", route => route.fulfill({ json: {
      data: { season: "2026-27", ready: false, expectedAfterDate: "2026-11-11" }, error: null,
    } }));
    await page.goto("/season?season=2026-27");
    await expect(page.getByTestId("season-data-guide")).toBeVisible();
    await expect(page.getByTestId("season-data-guide")).not.toContainText("Expected after");
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

function reportFixture(season: string) {
  return {
    season, basis: "played", completedGames: 150, scheduledGames: 1230,
    latestFinalDate: `${Number(season.slice(0, 4)) + 1}-01-01`, seasonComplete: false,
    homeRate: { games: 150, homeWins: 90, winPct: 60 },
    overall: { games: 90, restedTeamWins: 55, winPct: 61.1, band: 10.1 },
    threePlus: { games: 20, restedTeamWins: 12, winPct: 60, band: 21.5 },
    swingBaseline: 22.2, teams: [], weeks: [], loudestCalls: [],
  };
}
