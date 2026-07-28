import { expect, test } from "@playwright/test";

test.describe("Analysis page", () => {
  test("renders the terminal heading, hero stats, and section dividers", async ({ page }) => {
    await page.goto("/analysis");

    // Heading + hero stats render once the /api/analysis payload resolves.
    await expect(
      page.getByRole("heading", { name: "Rest Advantage Analysis" })
    ).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText("OVERALL WIN RATE")).toBeVisible();

    // Terminal section dividers (current markup — no text-7xl hero).
    await expect(page.getByText("WIN RATE BY RA THRESHOLD")).toBeVisible();
    await expect(page.getByText("HOME TEAM MORE RESTED")).toBeVisible();
    await expect(page.getByText("WIN RATE BY SEASON")).toBeVisible();
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
