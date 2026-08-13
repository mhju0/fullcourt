import { expect, test } from "@playwright/test";

test.describe("Playoff Rest page", () => {
  test("renders the terminal heading and eyebrow label", async ({ page }) => {
    await page.goto("/playoffs");

    // Heading + eyebrow render server-side in the page wrapper, independent of
    // PlayoffsContentLazy — no need to wait on lazy/data-dependent content.
    await expect(
      page.getByRole("heading", { level: 1, name: "Playoff Rest" })
    ).toBeVisible();

    // The eyebrow, not the nav tab. Asserted as a literal because "PLAYOFF REST" also appears
    // in the nav, so a looser matcher would pass on the tab and stop testing this page's header.
    await expect(
      page.getByText("PRIOR-ROUND GRIND · SERIES WIN RATE")
    ).toBeVisible();
  });

  test("leads with the finding, not the bracket", async ({ page }) => {
    await page.goto("/playoffs");

    // Both sections are server-rendered constants, so they are present without any DB round
    // trip. This is what makes the page useful when the API is slow or empty.
    await expect(page.getByText("THE POSTSEASON HAS NO REST")).toBeVisible();
    await expect(page.getByText("THE GRIND TAX")).toBeVisible();

    // The argument itself moved to Behind the Data on 2026-08-01; the product page carries the
    // numbers only.
    await expect(page.getByText("WHAT THE MODEL DOES WITH IT")).toHaveCount(0);
  });
});
