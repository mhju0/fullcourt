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
});
