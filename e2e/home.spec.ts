import { expect, test, type Locator } from "@playwright/test";

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

  /**
   * The surface cards have to read as links. They did not: the resting `borderColor` and
   * `background` sat in an inline `style` while the hover state was `hover:border-…` /
   * `hover:bg-…` classes, and an inline declaration outranks a class rule — so hovering a card
   * changed nothing but its glyph opacity, and `lint`, `typecheck`, the unit suite and every
   * e2e spec passed over it. Nothing here pins a colour: the assertions compare one state
   * against another, so a restyle keeps passing and a dead state fails.
   */
  const skinOf = (card: Locator) =>
    card.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        paint: [cs.borderTopColor, cs.backgroundColor, cs.boxShadow].join(" | "),
        // Width and height only. The lift is a transform and moves `top` deliberately;
        // it is the box that must not move, because the row height is a layout contract.
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        top: Math.round(r.top),
      };
    });

  /**
   * The card transitions over 300ms, so a state has to be read once it has stopped moving.
   * Polling for "different from rest" returns one frame in and captures a mid-transition
   * blend, which then fails to equal the settled focus state — the first version of this test
   * did exactly that. Waiting for two consecutive identical reads adjusts itself if the
   * duration ever changes, where a fixed sleep would quietly rot.
   */
  const settledSkin = async (card: Locator) => {
    let last = await skinOf(card);
    await expect
      .poll(async () => {
        const now = await skinOf(card);
        const stable = now.paint === last.paint;
        last = now;
        return stable;
      })
      .toBe(true);
    return last;
  };

  test("a surface card paints a hover state, and the keyboard gets the same one", async ({ page }) => {
    await page.goto("/");

    const surfaces = page.getByRole("navigation", { name: "Product surfaces" });
    await expect(surfaces.getByRole("link")).toHaveCount(6, { timeout: 30_000 });

    const card = surfaces.getByRole("link").first();
    await card.scrollIntoViewIfNeeded();

    const rest = await settledSkin(card);
    expect(await card.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");

    await card.hover();
    const hover = await settledSkin(card);
    expect(hover.paint).not.toBe(rest.paint);

    // All six cards are one shape. A hover that changed padding, border width or height would
    // shift the row — the reason this state is paint plus a transform and nothing else.
    expect(hover.size).toBe(rest.size);

    // Move the pointer off before measuring focus, or :hover is still painting the card.
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await settledSkin(card)).paint).toBe(rest.paint);

    // Seed keyboard modality so programmatic focus resolves to :focus-visible.
    await page.keyboard.press("Tab");
    await card.focus();
    expect(await card.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect((await settledSkin(card)).paint).toBe(hover.paint);
  });

  test("under reduced motion a surface card still answers the pointer, but does not move", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const surfaces = page.getByRole("navigation", { name: "Product surfaces" });
    await expect(surfaces.getByRole("link")).toHaveCount(6, { timeout: 30_000 });

    const card = surfaces.getByRole("link").first();
    await card.scrollIntoViewIfNeeded();
    const rest = await settledSkin(card);

    await card.hover();
    const hover = await settledSkin(card);
    expect(hover.paint).not.toBe(rest.paint);

    // The affordance survives; only the 4px lift is withheld.
    expect(hover.top).toBe(rest.top);
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
