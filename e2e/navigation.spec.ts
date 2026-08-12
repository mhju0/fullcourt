import { expect, test } from "@playwright/test";

test.describe("Primary navigation", () => {
  test("exposes core routes with an active-state treatment", async ({ page }) => {
    // `/games`, not `/`. Since 2026-08-12 `/` is the marketing page and no tab points at it,
    // so starting here is what makes the first `aria-current` assertion below mean something.
    await page.goto("/games");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    // Labels are uppercase strings in PRIMARY_NAV_ITEMS, and `exact` matching is
    // case-sensitive — so these must be spelled the way the source spells them.
    const games = nav.getByRole("link", { name: "GAMES", exact: true });
    const modelResults = nav.getByRole("link", { name: "MODEL RESULTS", exact: true });
    const scheduleEdge = nav.getByRole("link", { name: "SCHEDULE EDGE", exact: true });
    const playerShooting = nav.getByRole("link", { name: "PLAYER SHOOTING", exact: true });

    await expect(games).toBeVisible();
    await expect(modelResults).toBeVisible();
    await expect(scheduleEdge).toBeVisible();
    await expect(playerShooting).toBeVisible();

    // The exact tab count is asserted so that a stray tab, or a resurrected Upcoming
    // Edges, fails here rather than silently appearing. Adding a surface is a
    // deliberate edit to DIRECT_NAV_ITEMS or OTHER_NAV_ITEMS, the front door's SURFACES, and
    // this line. Six direct links; SHOT VALUE lives behind the OTHER menu and only
    // enters the DOM once that menu opens, which the next test covers.
    await expect(nav.getByRole("link")).toHaveCount(6);
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
    await expect(page).toHaveURL(/\/games$/);
    await expect(games).toHaveAttribute("aria-current", "page");
  });

  test("the front door is not a tab, and no tab claims it", async ({ page }) => {
    await page.goto("/");

    // The marketing page renders the same chrome, so the six tabs are all still here — but
    // none of them is active, because none of them points at `/`. This is the assertion that
    // fails if a tab is ever wired back to the root.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link")).toHaveCount(6);
    await expect(nav.locator("[aria-current='page']")).toHaveCount(0);

    // The wordmark points at the front door, which is the convention once `/` stops being the
    // product. "Take me back to the product" is served by the GAMES tab below it.
    await expect(page.getByRole("link", { name: "FullCourt home" })).toHaveAttribute("href", "/");
  });

  test("the old /about address still resolves to the front door", async ({ page }) => {
    await page.goto("/about");

    // A 307 in next.config.ts. The address is in the footer history, in shared links and in
    // anything anyone bookmarked, so it has to keep working.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rest is a stat");
  });

  test("/upcoming follows the games board to /games", async ({ page }) => {
    await page.goto("/upcoming");

    await expect(page).toHaveURL(/\/games$/);
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

  test("on a phone the nav scrolls itself rather than the page", async ({ page }) => {
    // Eight links do not fit a 390px line. They used to overflow the row and take the whole
    // document with them: measured 238px of horizontal page scroll, with the labels squeezed
    // (SCHEDULE EDGE down to 62px, wrapping inside a 44px box) and the reference links off
    // screen entirely. The row is its own scroll strip now, so the page itself must not move.
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/analysis");

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(pageOverflow).toBe(0);

    // …and the strip is what carries the overflow instead, so nothing was solved by hiding it.
    const strip = page.locator(".fc-nav-scroll");
    const { scrollW, clientW } = await strip.evaluate((el) => ({
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    }));
    expect(scrollW).toBeGreaterThan(clientW);

    // The far end of the strip is still reachable — a swipe away, not gone.
    await page.getByRole("link", { name: "BEHIND THE DATA", exact: true }).click();
    await expect(page).toHaveURL(/\/behind-the-data$/);
  });

  test("the Reference landmark holds documentation only, and no longer an ABOUT tab", async ({
    page,
  }) => {
    await page.goto("/games");

    // ABOUT left this landmark on 2026-08-12, when the page it pointed at became `/`. A link
    // from the chrome to the front door is the wordmark's job, and duplicating it here would
    // have given the row two ways to say the same thing.
    const reference = page.getByRole("navigation", { name: "Reference" });
    await expect(reference.getByRole("link")).toHaveCount(1);
    await expect(reference.getByRole("link", { name: "ABOUT", exact: true })).toHaveCount(0);

    // Still separate from the product tabs, which is what keeps the six-link count honest.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "BEHIND THE DATA", exact: true })).toHaveCount(0);

    const behind = reference.getByRole("link", { name: "BEHIND THE DATA", exact: true });
    // Visible is not the same as interactive. The header renders on the server, so this link is
    // clickable-looking before React has hydrated it — and a click that lands mid-hydration hits
    // a node that is being replaced, so the navigation is simply dropped. Waiting on a control
    // the client tree owns proves hydration finished.
    await expect(page.getByLabel("Season")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await behind.click();

    await expect(page).toHaveURL(/\/behind-the-data$/);
    await expect(behind).toHaveAttribute("aria-current", "page");
  });
});
