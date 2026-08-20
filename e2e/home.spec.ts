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

    // Plus one whisper-weight early path (2026-08-20): the page serves product visitors
    // as well as the credibility read, and its only CTA sat five screens down. Distinct
    // wording, so the count-of-one on the outro CTA above stays meaningful.
    await expect(page.getByRole("link", { name: /^Skip to the games board/ })).toHaveCount(1);
  });

  /**
   * The surface cards have to read as links. They did not: the resting `borderColor` and
   * `background` sat in an inline `style` while the hover state was `hover:border-…` /
   * `hover:bg-…` classes, and an inline declaration outranks a class rule — so hovering a card
   * changed nothing but its glyph opacity, and `lint`, `typecheck`, the unit suite and every
   * e2e spec passed over it. Nothing here pins a colour: the assertions compare one state
   * against another, so a restyle keeps passing and a dead state fails.
   */
  /**
   * Read after a repaint boundary, never within one.
   *
   * Two `evaluate` calls can both land in the same frame, and computed style does not change
   * between them — so `settledSkin` below would see two identical samples of a value that is
   * still moving and call it settled. That produced a "hover" state holding a shadow 0.1% into
   * its transition (`0px 0.0226585px 0.0478345px …`), which then failed to equal the real focus
   * state. Waiting two frames guarantees consecutive samples straddle a paint, so a value in
   * flight cannot repeat itself and only a genuinely stopped one reads as stable.
   */
  const skinOf = (card: Locator) =>
    card.evaluate(
      (el) =>
        new Promise<{ paint: string; size: string; top: number }>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              resolve({
                paint: [cs.borderTopColor, cs.backgroundColor, cs.boxShadow].join(" | "),
                // Width and height only. The lift is a transform and moves `top` deliberately;
                // it is the box that must not move, because the row height is a layout contract.
                size: `${Math.round(r.width)}x${Math.round(r.height)}`,
                top: Math.round(r.top),
              });
            })
          );
        })
    );

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

  /**
   * The thesis is the one sentence this page is built around. Its word-by-word scroll
   * brightening once left the sentence at 12% opacity permanently under
   * `prefers-reduced-motion: reduce` — the effect block returned early and nothing restored
   * the resting state. The word scrub is gone (2026-08-20) and the resting markup is fully
   * visible, which is exactly what this pins: for the reduced-motion audience the sentence
   * must be legible with no animation ever having run.
   *
   * Asserted as legibility rather than as an exact value, so retuning the effect keeps passing
   * and only a genuinely unreadable resting state fails.
   */
  test("under reduced motion the thesis is legible, not left at its animation start", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const thesis = page.locator(".fc-thesis");
    await expect(thesis).toBeVisible({ timeout: 30_000 });

    // The effect is imported dynamically; give the chunk time to land and do nothing.
    const opacity = async () =>
      thesis.locator("p").first().evaluate((el) => Number(getComputedStyle(el).opacity));

    await expect.poll(opacity).toBeGreaterThan(0.85);
  });

  /**
   * A scroll reveal that never plays leaves its targets at the animation's *start* — invisible,
   * with a silence nothing else catches: `lint`, `typecheck`, the unit suite and `build` all pass
   * over six product links sitting at `opacity: 0`, and the accessible-name assertions above pass
   * too, because the elements are present and named. It happened: the card row was built with
   * `gsap.from`, whose end values are inferred, and a `ScrollTrigger.refresh()` re-applied the
   * start state to a trigger that was still alive. `onEnter`, `onStart` and `onComplete` had all
   * fired.
   *
   * Asserted on all six rather than the first, and as "visible enough to click" rather than an
   * exact value, so retuning a reveal keeps passing.
   */
  test("every surface card settles visible once its reveal has played", async ({ page }) => {
    await page.goto("/");

    const surfaces = page.getByRole("navigation", { name: "Product surfaces" });
    await expect(surfaces.getByRole("link")).toHaveCount(6, { timeout: 30_000 });
    await surfaces.getByRole("link").first().scrollIntoViewIfNeeded();

    const opacities = async () =>
      surfaces.getByRole("link").evaluateAll((els) =>
        els.map((el) => Number(getComputedStyle(el).opacity))
      );

    await expect.poll(async () => Math.min(...(await opacities()))).toBeGreaterThan(0.9);
  });

  /**
   * The pin is gone (2026-08-20): holding the section still while the document scrolled
   * under it was the page's one scroll-jack, and the hand review retired it. What must
   * still hold is the invisible-content guard — a reveal that never completes leaves the
   * six inputs at their start opacity, the same silent failure the surface cards once
   * shipped with. So this scrolls the section into view and asserts every input settles
   * lit, and that the document was never held (the section keeps moving with the scroll).
   */
  test("the score section scrolls freely and its six inputs settle lit", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Rest is a stat" })).toBeVisible({
      timeout: 30_000,
    });

    const section = page.locator(".fc-inputs");
    const top = async () => Math.round((await section.boundingBox())!.y);
    const opacities = async () =>
      page.locator(".fc-input").evaluateAll((els) =>
        els.map((el) => Number(getComputedStyle(el).opacity))
      );

    const start = await page.evaluate(
      () =>
        Math.round(
          (document.querySelector(".fc-inputs") as HTMLElement).getBoundingClientRect().top +
            window.scrollY
        )
    );

    // Not held: 300px more document scroll moves the section 300px, like any content.
    await page.evaluate((y) => window.scrollTo(0, y), start);
    const atStart = await top();
    await page.evaluate((y) => window.scrollTo(0, y), start + 300);
    await expect.poll(top).toBe(atStart - 300);

    // And every input settles visible.
    await expect.poll(async () => Math.min(...(await opacities()))).toBeGreaterThan(0.9);
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
