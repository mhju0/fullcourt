import { expect, test } from "@playwright/test";

test.describe("Analysis page", () => {
  test("renders the terminal heading, hero stats, and section dividers", async ({ page }) => {
    await page.goto("/analysis");

    // Heading + hero stats render once the /api/analysis payload resolves.
    await expect(
      page.getByRole("heading", { name: "Rest Advantage Analysis" })
    ).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText("OVERALL WIN RATE")).toBeVisible();
    // The games the model does not call, kept on the page as a stat tile stating the home
    // team's rate. It was a full section arguing the rule; that argument lives once, in
    // /behind-the-data/rest-advantage, and the page keeps only the live figure.
    await expect(page.getByText("HOME WIN RATE · NOT COUNTED")).toBeVisible();

    // Terminal section dividers (current markup — no text-7xl hero).
    await expect(page.getByText(/WIN RATE BY RA THRESHOLD/)).toBeVisible();
    await expect(page.getByText("WIN RATE BY SEASON")).toBeVisible();

    // The frame itself. Every rate on this page is measured against how often the home team
    // wins anyway, not against a coin flip — if this line regresses to 50%, the page is
    // crediting the model with roughly ten points of home court it did not produce.
    await expect(page.getByText(/0 = \d\d\.\d%, HOW OFTEN THE HOME TEAM WINS ANYWAY/)).toBeVisible();
    await expect(page.getByText("PERCENTAGE POINTS · 0 = THAT SEASON'S OWN HOME WIN RATE")).toBeVisible();
    await expect(page.getByText(/COIN FLIP/)).toHaveCount(0);
  });

  /**
   * The reducer's transitions are unit-tested; this covers the wiring — that each
   * control sends the intent it claims to, which no unit test can see.
   */
  test("filtering and paging Explore Games moves through the result set", async ({ page }) => {
    await page.goto("/analysis");

    await expect(page.getByLabel("Rest advantage filter")).toBeVisible({ timeout: 60_000 });

    // Page forward, then confirm the range moved rather than the page number alone.
    const range = page.getByText(/SHOWING [\d,]+–[\d,]+ OF [\d,]+/);
    await expect(range).toContainText("SHOWING 1–20");
    await page.getByLabel("Next page").click();
    await expect(range).toContainText("SHOWING 21–40");

    // Any filter change returns to page 1 — the old page indexes a different set.
    await page.getByLabel("Team filter").selectOption("BOS");
    await expect(range).toContainText("SHOWING 1–20");
    await expect(page.getByRole("button", { name: /Open details:/ }).first()).toHaveAttribute(
      "aria-label",
      /BOS/
    );

    // CLEAR FILTERS appears only while a filter is active, and removes all of them.
    const clear = page.getByRole("button", { name: "CLEAR FILTERS" });
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(clear).toBeHidden();
    await expect(page.getByLabel("Team filter")).toHaveValue("");
  });
});
