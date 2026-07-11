import { expect, test } from "@playwright/test";

test.describe("Primary navigation", () => {
  test("exposes core routes with an active-state treatment", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const games = nav.getByRole("link", { name: "Today's Games" });
    const analysis = nav.getByRole("link", { name: "Analysis" });
    const picks = nav.getByRole("link", { name: "Picks" });

    await expect(games).toBeVisible();
    await expect(analysis).toBeVisible();
    await expect(picks).toBeVisible();

    // The active route carries aria-current="page" (rendered as the amber underline).
    // Assert inactive links lack it too, so the check actually discriminates.
    await expect(games).toHaveAttribute("aria-current", "page");
    await expect(analysis).not.toHaveAttribute("aria-current", "page");

    await analysis.click();
    await expect(page).toHaveURL(/\/analysis$/);
    await expect(analysis).toHaveAttribute("aria-current", "page");
    await expect(games).not.toHaveAttribute("aria-current", "page");

    await picks.click();
    await expect(page).toHaveURL(/\/upcoming$/);
    await expect(picks).toHaveAttribute("aria-current", "page");

    await games.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(games).toHaveAttribute("aria-current", "page");
  });
});
