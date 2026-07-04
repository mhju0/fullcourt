import { expect, test } from "@playwright/test";

test.describe("Playoffs page", () => {
  test("renders the terminal heading and eyebrow label", async ({ page }) => {
    await page.goto("/playoffs");

    // Heading + eyebrow render server-side in the page wrapper, independent
    // of PlayoffsContentLazy — no need to wait on lazy/data-dependent content.
    await expect(
      page.getByRole("heading", { name: "Series Predictions" })
    ).toBeVisible();

    await expect(page.getByText("PLAYOFF PREDICTOR")).toBeVisible();
  });
});
