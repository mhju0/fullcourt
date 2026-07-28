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
    const restShooting = nav.getByRole("link", { name: "REST & SHOOTING", exact: true });

    await expect(games).toBeVisible();
    await expect(modelResults).toBeVisible();
    await expect(scheduleEdge).toBeVisible();
    await expect(restShooting).toBeVisible();

    // The exact tab count is asserted so that a stray tab, or a resurrected Upcoming
    // Edges, fails here rather than silently appearing. Adding a surface is a
    // deliberate edit to DIRECT_NAV_ITEMS or OTHER_NAV_ITEMS, /about's SURFACES, and
    // this line. Five direct links; SHOT VALUE lives behind the OTHER menu and only
    // enters the DOM once that menu opens, which the next test covers.
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expect(nav.getByRole("link", { name: "SHOT VALUE", exact: true })).toHaveCount(0);

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

  test("reaches SHOT VALUE through the OTHER menu and marks the trigger active", async ({
    page,
  }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const other = nav.getByRole("button", { name: /OTHER/ });
    await expect(other).toBeVisible();

    await other.click();
    // The item is a real link, not a button that navigates — asserted by role, so a
    // regression to a click-handler-only menu item fails here.
    const shotValue = page.getByRole("menuitem", { name: "SHOT VALUE", exact: true });
    await expect(shotValue).toBeVisible();

    await shotValue.click();
    await expect(page).toHaveURL(/\/shot-quality$/);

    // The trigger has to keep showing where you are once the menu closes behind you.
    await expect(other).toHaveAttribute("data-active-surface", "true");
  });

  test("reaches /about from the status bar without becoming a tab itself", async ({ page }) => {
    await page.goto("/");

    // Deliberately outside the "Main navigation" landmark: /about explains the product
    // rather than being one of its surfaces. Asserted here because the footer link
    // alone left the page effectively unreachable.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "ABOUT", exact: true })).toHaveCount(0);

    const about = page.getByRole("link", { name: "ABOUT", exact: true });
    await expect(about).toBeVisible();
    await about.click();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rest is a stat");
    await expect(page.getByRole("link", { name: "ABOUT", exact: true })).toHaveAttribute("aria-current", "page");
  });
});
