import { expect, test } from "@playwright/test";

test.describe("Analysis page", () => {
  test("renders the terminal heading, hero stats, and section dividers", async ({ page }) => {
    await page.goto("/analysis");

    // Heading + hero stats render once the /api/analysis payload resolves.
    await expect(
      page.getByRole("heading", { name: "Model Results" })
    ).toBeVisible({ timeout: 60_000 });

    // Both tiles name who won and over which slice. Asserted as literals because the failure
    // being guarded is a regression to a label that names neither — "OVERALL WIN RATE" was
    // one, and "overall" is the single word this page cannot honestly use about its own rate.
    await expect(page.getByText("RESTED TEAM AT HOME WON · ANY GAP")).toBeVisible();
    await expect(page.getByText("RESTED TEAM AT HOME WON · RA ≥ 5")).toBeVisible();
    // Two tiles, not three. A third would be read as a third cut of the same measure, and the
    // page's own callout says the rate is flat from RA ≥ 5 up — so an ascending third tile
    // would draw a trend the data does not have.
    await expect(page.locator("main").getByText(/^RESTED TEAM AT HOME WON/)).toHaveCount(2);

    // The excluded half, which must never leave the page: without it the headline sits alone
    // with no sign that 11,548 games were set aside to produce it. It is a sentence rather
    // than a fourth tile — a tile row is a row of results and this is the rule they are
    // produced under, which no 30-character label ever carried.
    await expect(page.getByText("NOT COUNTED", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/games where the rested team was the visitor, the home team won/)
    ).toBeVisible();

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
