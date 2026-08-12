import { expect, test } from "@playwright/test";

/**
 * The front door. This page lived at `/about` until 2026-08-12 and the spec moved with it —
 * `e2e/home.spec.ts` used to cover the games board, which is now `e2e/games.spec.ts`. The
 * redirect from the old address is asserted in `navigation.spec.ts`.
 */
test.describe("Front door", () => {
  test("renders the hero, every surface, and the single way in", async ({ page }) => {
    await page.goto("/");

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
      "Season Report",
      "Schedule Edge",
      "Model Results",
      "Playoff Rest",
      "Player Shooting",
    ]) {
      await expect(
        surfaces.getByRole("link", { name: new RegExp(`^${name}\\b`) })
      ).toBeVisible();
    }

    // One call to action, at the end. The hero carried a pair of buttons under the
    // headline; they competed with the one line the page opens on and asked for a decision
    // before the argument had been made. The hero is now the claim and nothing else.
    const enter = page.getByRole("link", { name: "Open the games board" });
    await expect(enter).toHaveCount(1);
    await expect(enter).toBeVisible();
    await expect(page.getByRole("link", { name: "See the backtest" })).toHaveCount(0);
  });

  test("is reachable from the footer, and is not itself a nav tab", async ({ page }) => {
    await page.goto("/games");

    // The front door stays out of the primary nav: it explains the product rather than being
    // one of its surfaces. The count tracks DIRECT_NAV_ITEMS — the surfaces behind the
    // OTHER menu are not in the DOM until it opens — so a new tab has to be a
    // deliberate edit here too.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link")).toHaveCount(6);

    await page.getByRole("link", { name: "WHAT THIS MEASURES" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("its one CTA opens the board, not itself", async ({ page }) => {
    await page.goto("/");

    // The CTA pointed at `/` while this page was at `/about`. After the swap that would have
    // scrolled the reader to the top of the page they were already on — a dead button that
    // looks like it works, which nothing else here would have caught.
    const enter = page.getByRole("link", { name: "Open the games board" });
    await expect(enter).toHaveAttribute("href", "/games");

    await enter.click();
    await expect(page).toHaveURL(/\/games$/);
    await expect(page.getByRole("heading", { level: 1, name: "Games" })).toBeVisible();
  });
});
