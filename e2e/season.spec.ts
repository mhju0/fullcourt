import { expect, test } from "@playwright/test";

test.describe("Season Report", () => {
  test("renders the scorecard and switches season", async ({ page }) => {
    await page.goto("/season");

    await expect(page.getByRole("heading", { level: 1, name: "Season Report" })).toBeVisible();

    // The rate tile is data-dependent, so wait for it rather than for a fixed timeout.
    const rate = page.getByTestId("season-rest-win-rate");
    await expect(rate).toBeVisible();
    await expect(rate).not.toHaveText("");

    const selector = page.getByLabel("SEASON");
    await expect(selector).toHaveValue(/^\d{4}-\d{2}$/);

    await selector.selectOption("2015-16");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2015-16 VS HISTORY");

    // Still on 2015-16 from the season switch above: a complete 30-team season.
    await expect(page.getByTestId("edge-conversion-row")).toHaveCount(30);
    await expect(page.getByTestId("schedule-tax-row")).toHaveCount(30);

    // Section 4 caps at ten however many decidable games a season holds.
    await expect(page.getByTestId("loudest-call-row")).toHaveCount(10);

    await expect(page.getByTestId("fatigue-calendar")).toBeVisible();
  });

  test("is reachable from the primary nav", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("link", { name: "SEASON REPORT" }).click();

    await expect(page).toHaveURL(/\/season$/);
  });
});
