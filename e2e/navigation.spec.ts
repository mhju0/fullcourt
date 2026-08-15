import { expect, test, type Locator, type Page } from "@playwright/test";

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

  /**
   * The retracting bar, front door only. `/` stopped being a product surface on 2026-08-12, and
   * chrome pinned over a long marketing scroll competes with it. Measured against the bar's own
   * box rather than a class name, so the assertions survive a restyle.
   */
  const barTop = async (page: Page) =>
    Math.round((await page.getByRole("banner").boundingBox())!.y);

  /**
   * Wheel from mid-viewport, so the gesture is never spent on the nav's own horizontal scroll
   * strip — and then wait for the page to actually move. `mouse.wheel` dispatches the event but
   * the scrolling it causes is not instant: reading `scrollY` straight afterwards reads 0, which
   * silently turned "the bar did not retract" into a test that measured nothing.
   */
  const wheel = async (page: Page, dy: number) => {
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, dy);
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
  };

  test("the front door's bar retracts on the way down and comes back on the way up", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Rest is a stat" })).toBeVisible({
      timeout: 30_000,
    });

    const bar = page.getByRole("banner");
    const height = (await bar.boundingBox())!.height;
    expect(await barTop(page)).toBe(0);

    // Where `<main>` starts in the document. The bar sits in normal flow above it, so retracting
    // by collapsing height or `display` would drag the whole page up under the reader and fight
    // the alignment law. A transform leaves this untouched, which is the point of using one.
    const mainTop = () => page.evaluate(() => document.querySelector("main")!.offsetTop);
    const mainBefore = await mainTop();

    await wheel(page, 1400);
    // Assert the page actually moved, or "the bar did not retract" would pass on a page that
    // never scrolled and this test would be measuring nothing.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(height);
    await expect.poll(async () => await barTop(page)).toBeLessThanOrEqual(-height + 1);
    expect(await mainTop()).toBe(mainBefore);

    // Retracted, NOT unmounted. `the front door is not a tab` above asserts six links and zero
    // aria-current on this route; hiding the bar by dropping it from the DOM would take that
    // invariant with it and this is what fails first if anyone tries.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link")).toHaveCount(6);
    await expect(nav.locator("[aria-current='page']")).toHaveCount(0);

    await wheel(page, -400);
    await expect.poll(async () => await barTop(page)).toBe(0);
  });

  test("a retracted bar comes back when the keyboard reaches it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Rest is a stat" })).toBeVisible({
      timeout: 30_000,
    });

    const height = (await page.getByRole("banner").boundingBox())!.height;
    await wheel(page, 1400);
    await expect.poll(async () => await barTop(page)).toBeLessThanOrEqual(-height + 1);

    // A retracted bar still holds six focusable tabs. Landing a focus ring on a control sitting
    // off the top of the screen is the serious half of this feature going wrong.
    await page.getByRole("link", { name: "GAMES", exact: true }).focus();
    await expect.poll(async () => await barTop(page)).toBe(0);
  });

  test("under reduced motion the bar still retracts, but does not slide", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Rest is a stat" })).toBeVisible({
      timeout: 30_000,
    });

    const bar = page.getByRole("banner");
    const height = (await bar.boundingBox())!.height;

    // The 96px band never travels the screen; it is simply not where it was.
    expect(await bar.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");

    await wheel(page, 1400);
    await expect.poll(async () => await barTop(page)).toBeLessThanOrEqual(-height + 1);
  });

  test("every other route keeps the bar pinned", async ({ page }) => {
    await page.goto("/analysis");

    // Wait for the payload before touching the wheel. This page is client-rendered and its own
    // spec allows 60s for the heading; without the wait, `<main>` is still empty, the document
    // has nothing to scroll, and the test fails on a page that never loaded rather than on a bar
    // that moved. Seen on merged main 2026-08-13, with an empty `main` in the failure snapshot.
    await expect(page.getByRole("heading", { name: "Model Results" })).toBeVisible({
      timeout: 60_000,
    });

    const bar = page.getByRole("banner");
    const height = (await bar.boundingBox())!.height;
    expect(await barTop(page)).toBe(0);

    await wheel(page, 1400);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(height);

    // Long enough for the front door's 300ms slide to have finished, had this route had one.
    await page.waitForTimeout(600);
    expect(await barTop(page)).toBe(0);
  });

  /**
   * Chrome links have to answer the pointer, and twice now they silently have not: the colour or
   * background sat in an inline `style` while the hover state was a `hover:` utility, and an
   * inline declaration outranks a class rule — so the utility was dead and nothing noticed. Fixed
   * on the home surface cards (#28) and again here on the footer and the method link, which
   * between them render on every page and on eight respectively.
   *
   * Value-agnostic on purpose: it asserts the paint *moves*, not what it moves to, so a restyle
   * keeps passing and a dead state fails.
   */
  const paintOf = (el: Locator) =>
    el.evaluate((n) => {
      const cs = getComputedStyle(n);
      return `${cs.color} | ${cs.backgroundColor}`;
    });

  const answersThePointer = async (page: Page, el: Locator) => {
    await el.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const rest = await paintOf(el);
    await el.hover();
    await expect.poll(() => paintOf(el)).not.toBe(rest);
  };

  test("the footer's links visibly answer the pointer", async ({ page }) => {
    await page.goto("/games");

    // The footer is on every page, so a dead hover here is dead everywhere.
    await answersThePointer(page, page.getByRole("link", { name: "SYSTEM STATUS" }));
    await answersThePointer(page, page.getByRole("link", { name: "WHAT THIS MEASURES" }));
  });

  test("the method link visibly answers the pointer", async ({ page }) => {
    await page.goto("/analysis");
    await expect(page.getByRole("heading", { name: "Model Results" })).toBeVisible({
      timeout: 60_000,
    });

    // Scoped to `main`, and NOT `.last()` on the whole page. The Reference landmark in the header
    // also points at /behind-the-data, so before the payload arrives the loosest locator silently
    // resolves to that nav tab instead — and passes, having measured the wrong element.
    await answersThePointer(page, page.locator("main").locator('a[href^="/behind-the-data"]').first());
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

  test("the 404's Games button lands on the games board, not the front door", async ({ page }) => {
    // The 2026-08-12 swap was checked component by component and this file was missed, because
    // nothing routes to it: no nav link, no e2e spec, and no unit test renders it. The button
    // still said GAMES while pointing at `/`, which had stopped being the games board — a link
    // whose label and destination disagree, shown to someone already lost.
    const response = await page.goto("/does-not-exist");
    expect(response?.status()).toBe(404);

    const games = page.getByRole("link", { name: "Games", exact: true });
    await expect(games).toHaveAttribute("href", "/games");

    await games.click();
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

  /**
   * The strip has to *say* it scrolls. The 2026-08-04 measurement found the OTHER menu
   * entirely off-screen at phone widths with nothing signalling that the row continues —
   * the scrollbar is hidden on purpose, so it cannot be the signal. An edge fade is how
   * Naver Sports' tab strips and ESPN's mobile subnavs carry this, and each side shows
   * only while there is actually content under it: a fade over a row that fits would dim
   * the last tab for no reason.
   */
  test("the phone strip fades the edge that still has content under it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/analysis");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    const strip = page.locator(".fc-nav-scroll");
    const left = page.locator(".fc-nav-fade-left");
    const right = page.locator(".fc-nav-fade-right");
    const opacity = (loc: typeof left) => loc.evaluate((el) => getComputedStyle(el).opacity);

    // At rest: content continues to the right and only to the right.
    await expect.poll(() => opacity(right)).toBe("1");
    await expect.poll(() => opacity(left)).toBe("0");

    // Scrolled to the far end: the signals swap sides.
    await strip.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect.poll(() => opacity(right)).toBe("0");
    await expect.poll(() => opacity(left)).toBe("1");
  });

  /**
   * The skip link is the first tab stop on every page — the pattern ESPN carries and Naver
   * ships as 본문 바로가기. Without it a keyboard visitor walks the brand link, six tabs, the
   * OTHER menu and the reference landmark before any page's content, on every page.
   */
  test("the first Tab lands on a skip link that reaches the content", async ({ page }) => {
    await page.goto("/games");
    await expect(page.getByRole("heading", { level: 1, name: "Games" })).toBeVisible();

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    // Following it must move real focus into main, not just the URL fragment — otherwise the
    // next Tab starts from the nav anyway and the link skipped nothing.
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ""))
      .toBe("main");
  });

  test("a desktop strip that fits shows no fade at all", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/analysis");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    await expect.poll(() => page.locator(".fc-nav-fade-left").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    await expect.poll(() => page.locator(".fc-nav-fade-right").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
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
