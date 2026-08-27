import { expect, test } from "@playwright/test";

test.describe("Season Report", () => {
  test("the verdict line settles on a real verdict, never the transient 'unavailable'", async ({ page }) => {
    await page.goto("/season");

    // The verdict is gated on the all-season baseline request (2026-08-24): while that
    // request is in flight the line renders nothing, because a pending norm and a missing
    // norm are both null and the page used to flash "ALL-SEASON NORM UNAVAILABLE" on every
    // load. The risk the gate introduces is the opposite failure — the line never settling —
    // so this waits for a real verdict and then asserts the transient claim is not on the page.
    // Matches all four settled states: ABOVE/BELOW THE NORM, IN LINE WITH THE ALL-SEASON
    // NORM (both carry "NORM — " with figures after it), and TOO EARLY TO CALL.
    await expect(
      page.getByText(/NORM — |TOO EARLY TO CALL/).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ALL-SEASON NORM UNAVAILABLE")).toHaveCount(0);
  });

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

    // The per-team pricing table has ONE home, on Schedule Edge (2026-08-23). This page states
    // the season's extremes and points there — a returning table is the regression, not a gap.
    await expect(page.getByTestId("schedule-value-row")).toHaveCount(0);
    await expect(page.getByTestId("schedule-value-extremes")).toBeVisible();
    const crosslink = page.getByTestId("schedule-value-crosslink");
    await expect(crosslink).toBeVisible();
    await expect(crosslink).toHaveAttribute("href", "/schedule");

    // Section 4 caps at ten however many decidable games a season holds.
    await expect(page.getByTestId("loudest-call-row")).toHaveCount(10);

    await expect(page.getByTestId("fatigue-calendar")).toBeVisible();
  });

  /**
   * The season-scoped "as of" stamp (2026-08-27, docs/UIUX_CHECKLIST.md §5). This page had no
   * stamp at all before it: the global one /analysis carries would have been a claim about a
   * different population than the season selected here.
   *
   * The stamp has to MOVE with the selector, which is the property that separates a real
   * season-scoped stamp from a page-level one rendered once above the selector.
   */
  test("stamps the selected season, and re-stamps when the season changes", async ({ page }) => {
    await page.goto("/season");

    const stamp = page.getByTestId("season-as-of");
    await expect(stamp).toBeVisible({ timeout: 20_000 });
    await expect(stamp).toHaveText(/^AS OF \d{4}-\d{2}-\d{2}$/);

    const opened = await stamp.textContent();

    await page.getByLabel("SEASON").selectOption("2015-16");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2015-16 VS HISTORY");

    // 2015-16 ended in April 2016, so the stamp must land in that season's window — and must
    // not still be the one the page opened on.
    await expect(stamp).toHaveText(/^AS OF 2016-0[45]-\d{2}$/);
    expect(await stamp.textContent()).not.toBe(opened);
  });

  /**
   * Copy guards, not layout checks. Both sentences exist to stop a specific misreading, and
   * both are the kind of prose a tidying pass deletes as redundant.
   */
  test("gives the wins figure its scale and the swing column its baseline", async ({ page }) => {
    await page.goto("/season");
    await page.getByLabel("SEASON").selectOption("2015-16");

    // Without this line, four-tenths of a win reads as "rest is nothing".
    const scale = page.getByTestId("rest-scale-line");
    await expect(scale).toContainText("of home court");
    await expect(scale).toContainText("far smaller");

    // The swing column's arms differ by venue, so its zero line is not zero.
    const baseline = page.getByTestId("swing-baseline-note");
    await expect(baseline).toContainText("NOT AGAINST ZERO");
    await expect(baseline).toContainText("THE RESTED ARM IS PLAYED AT HOME");

    // The section must never imply it is measuring how teams played.
    await expect(page.getByTestId("schedule-value-heading")).toHaveText(
      "WHAT THE SCHEDULE WAS WORTH"
    );
  });

  test("flags the shortened seasons and only those", async ({ page }) => {
    await page.goto("/season");

    const note = page.getByTestId("abnormal-season-note");
    const selector = page.getByLabel("SEASON");

    // 2015-16 ran 82 games for all 30 teams, so there is nothing to disclaim.
    await selector.selectOption("2015-16");
    await expect(note).toHaveCount(0);

    await selector.selectOption("2019-20");
    await expect(note).toContainText("63–67 GAMES PER TEAM");
    await expect(note).toContainText("Orlando bubble");

    await selector.selectOption("2011-12");
    await expect(note).toContainText("LOCKOUT SEASON");
  });

  test("is reachable from the primary nav", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("link", { name: "SEASON REPORT" }).click();

    await expect(page).toHaveURL(/\/season$/);
  });
});
