import { expect, test } from "@playwright/test";

test.describe("Primary navigation", () => {
  test("exposes core routes with an active-state treatment", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    // Labels are uppercase strings in PRIMARY_NAV_ITEMS, and `exact` matching is
    // case-sensitive — so these must be spelled the way the source spells them.
    const games = nav.getByRole("link", { name: "GAMES", exact: true });
    const modelResults = nav.getByRole("link", { name: "MODEL RESULTS", exact: true });
    const scheduleEdge = nav.getByRole("link", { name: "SCHEDULE EDGE", exact: true });

    await expect(games).toBeVisible();
    await expect(modelResults).toBeVisible();
    await expect(scheduleEdge).toBeVisible();

    // Five tabs since /upcoming was folded into Games — asserted so a stray sixth tab,
    // or a resurrected Upcoming Edges, fails here rather than silently returning.
    await expect(nav.getByRole("link")).toHaveCount(5);

    // The active route carries aria-current="page" (rendered as the amber underline).
    // Assert inactive links lack it too, so the check actually discriminates.
    await expect(games).toHaveAttribute("aria-current", "page");
    await expect(modelResults).not.toHaveAttribute("aria-current", "page");

    await modelResults.click();
    await expect(page).toHaveURL(/\/analysis$/);
    await expect(modelResults).toHaveAttribute("aria-current", "page");
    await expect(games).not.toHaveAttribute("aria-current", "page");

    await scheduleEdge.click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(scheduleEdge).toHaveAttribute("aria-current", "page");

    await games.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(games).toHaveAttribute("aria-current", "page");
  });
});
