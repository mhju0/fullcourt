import { expect, test } from "@playwright/test";

test.describe("Shot Quality page", () => {
  test("renders the terminal heading and eyebrow label", async ({ page }) => {
    await page.goto("/shot-quality");

    // Heading + eyebrow render server-side in the page wrapper, independent
    // of ShotQualityContentLazy (hexbin chart) — no need to wait on the chart.
    await expect(
      page.getByRole("heading", { name: "Expected Shot Value" })
    ).toBeVisible();

    await expect(page.getByText("EXPECTED SHOT VALUE · xeFG%")).toBeVisible();
  });
});
