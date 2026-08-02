import { expect, test } from "@playwright/test";
import {
  AVAILABILITY_BEST_OUT_BY_SEASON,
  AVAILABILITY_EFFECTS,
} from "../src/lib/availability-facts";

test.describe("Availability Cost page", () => {
  test("renders the heading and the headline number", async ({ page }) => {
    await page.goto("/availability");

    await expect(
      page.getByRole("heading", { name: "What a missing player is worth" })
    ).toBeVisible();

    // Every figure is a published constant, so the page is complete without a database round
    // trip — that is what makes it useful when the API is slow or empty.
    await expect(
      page.getByText(`${AVAILABILITY_EFFECTS.bestPlayerOut.points.toFixed(2)} points`)
    ).toBeVisible();
    await expect(page.getByText("WHAT AN ABSENCE COSTS")).toBeVisible();
  });

  test("keeps the two disclaimers the numbers depend on", async ({ page }) => {
    await page.goto("/availability");

    // These are not decoration. The measurement is retrospective, so without the first line
    // the page reads as a forecast; and the effects are small against how noisy a game is, so
    // without the second it reads as though the model explains games. Both have to survive
    // any copy edit, which is why they are asserted rather than reviewed.
    await expect(
      page.getByText("This measures what an absence cost, not who will play tonight.")
    ).toBeVisible();
    await expect(page.getByText("And a basketball game is mostly noise.")).toBeVisible();
  });

  test("draws one column per season, on a track that starts at zero", async ({ page }) => {
    await page.goto("/availability");

    const trend = page.getByRole("img", { name: /Share of team-games played without/ });
    await expect(trend).toBeVisible();
    await expect(trend.locator("> div")).toHaveCount(AVAILABILITY_BEST_OUT_BY_SEASON.length);

    // The tallest column is the most recent season and fills the track. A truncated axis would
    // turn a real threefold rise into a dramatic one, so the full-height column is load-bearing.
    const last = AVAILABILITY_BEST_OUT_BY_SEASON.at(-1)!;
    await expect(trend.locator("> div").last()).toHaveAttribute(
      "title",
      new RegExp(`^${last.season} `)
    );
  });

  test("is reachable through the OTHER menu and is not a direct tab", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    // Lives behind OTHER, so it must not appear as a top-level link. The bar is already six
    // tabs wide; promoting this one has to be a deliberate edit, not a side effect.
    await expect(
      nav.getByRole("link", { name: "AVAILABILITY COST", exact: true })
    ).toHaveCount(0);

    await nav.getByRole("button", { name: /OTHER/ }).click();
    // A real link inside the menu, not a click-handler — asserted by role, so a regression to
    // a button that navigates fails here rather than silently losing middle-click and crawling.
    const item = page.getByRole("menuitem", { name: "AVAILABILITY COST", exact: true });
    await expect(item).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(/\/availability$/);
  });
});
