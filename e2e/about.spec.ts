import { expect, test } from "@playwright/test";

test.describe("About page", () => {
  test("renders the hero, every surface, and both calls to action", async ({ page }) => {
    await page.goto("/about");

    // Client-rendered (ssr: false), so give the chunk a moment on a cold dev compile.
    await expect(
      page.getByRole("heading", { name: "Rest is a stat" })
    ).toBeVisible({ timeout: 30_000 });

    // The surface links mirror the nav labels, so a rename that misses this page shows
    // up here rather than drifting quietly out of sync. Each card is one link wrapping
    // label + copy, so the accessible name is "<label> <copy>" — anchor at the start
    // rather than matching exactly.
    const surfaces = page.getByRole("navigation", { name: "Product surfaces" });
    await expect(surfaces.getByRole("link")).toHaveCount(6);
    for (const name of [
      "Games",
      "Schedule Edge",
      "Model Results",
      "Playoff Predictions",
      "Shot Value",
      "Rest & Shooting",
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

  test("is reachable from the footer, and is not itself a nav tab", async ({ page }) => {
    await page.goto("/");

    // /about stays out of the primary nav: it explains the product rather than being
    // one of its surfaces. The count tracks PRIMARY_NAV_ITEMS, so a new tab has to be
    // a deliberate edit here too.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link")).toHaveCount(6);

    await page.getByRole("link", { name: "WHAT THIS MEASURES" }).click();
    await expect(page).toHaveURL(/\/about$/);
  });
});
