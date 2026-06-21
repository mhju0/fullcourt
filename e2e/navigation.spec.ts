import { expect, test } from "@playwright/test";

// Active-link color (#C9082A) is applied via an inline style, not a class.
const ACTIVE_COLOR = "rgb(201, 8, 42)";

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

    await expect(games).toHaveCSS("color", ACTIVE_COLOR);

    await analysis.click();
    await expect(page).toHaveURL(/\/analysis$/);
    await expect(analysis).toHaveCSS("color", ACTIVE_COLOR);

    await picks.click();
    await expect(page).toHaveURL(/\/upcoming$/);
    await expect(picks).toHaveCSS("color", ACTIVE_COLOR);

    await games.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(games).toHaveCSS("color", ACTIVE_COLOR);
  });
});
