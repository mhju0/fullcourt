import { expect, test } from "@playwright/test";

test.describe("About page", () => {
  test("renders the hero, the five surfaces, and both calls to action", async ({ page }) => {
    await page.goto("/about");

    // Client-rendered (ssr: false), so give the chunk a moment on a cold dev compile.
    await expect(
      page.getByRole("heading", { name: "One side is always carrying." })
    ).toBeVisible({ timeout: 30_000 });

    // The surface links use the five nav labels, so a nav rename that misses this page
    // shows up here rather than drifting quietly out of sync. Each card is one link
    // wrapping label + copy, so the accessible name is "<label> <copy>" — anchor at the
    // start rather than matching exactly.
    const surfaces = page.getByRole("navigation", { name: "Product surfaces" });
    await expect(surfaces.getByRole("link")).toHaveCount(5);
    for (const name of [
      "Games",
      "Schedule Edge",
      "Model Results",
      "Playoff Predictions",
      "Shot Value",
    ]) {
      await expect(
        surfaces.getByRole("link", { name: new RegExp(`^${name}\\b`) })
      ).toBeVisible();
    }

    await expect(
      page.getByRole("link", { name: "Open the games board" }).first()
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "See the backtest" })).toBeVisible();
  });

  test("is reachable from the footer, and is not a sixth nav tab", async ({ page }) => {
    await page.goto("/");

    // Still five tabs — the marketing page deliberately stays out of the primary nav.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link")).toHaveCount(5);

    await page.getByRole("link", { name: "WHAT THIS MEASURES" }).click();
    await expect(page).toHaveURL(/\/about$/);
  });
});
