import { test, expect } from "@playwright/test";

/**
 * The page never scrolls sideways.
 *
 * A guard, not a survey. It exists because on 2026-09-01 an audit found `/season` and
 * `/shooting` scrolling the *document* 57px and 47px past a 390px viewport, and no gate in the
 * repo could see it: `alignment-law.spec.ts` measures where things start, never how far the
 * page extends, and every a11y and layout pass to that point had run at 1440x900 only.
 *
 * The cause is worth knowing, because the shape recurs. `RankBadge`'s visually-hidden sentence
 * is `position: absolute` (Tailwind's `.sr-only`), and it had no positioned ancestor *inside*
 * the table's scroll container — so it resolved its containing block against the page, took its
 * static position from inside a table wider than the phone, and planted a 1x1 box out past the
 * viewport edge. One pixel of element, 57px of document.
 *
 * Both viewports run deliberately. Desktop was already clean when this was written and is here
 * to stay that way; the phone width is where the defects were, and where nothing had looked.
 */

/** Every published route. `/` included — its mark bleeds by design, but it is *clipped*. */
const ROUTES = [
  "/",
  "/games",
  "/season",
  "/schedule",
  "/analysis",
  "/playoffs",
  "/shooting",
  "/shot-quality",
  "/availability",
  "/referees",
  "/behind-the-data",
  "/behind-the-data/rest-advantage",
  "/behind-the-data/schedule-edge",
  "/behind-the-data/player-shooting",
  "/behind-the-data/shot-value",
  "/behind-the-data/availability",
  "/behind-the-data/playoff-predictions",
  "/behind-the-data/referees",
  "/behind-the-data/time-zones",
  "/behind-the-data/data-and-limits",
];

const VIEWPORTS = [
  { name: "phone 390", width: 390, height: 844 },
  { name: "desktop 1440", width: 1440, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`the document does not scroll sideways at ${viewport.name}`, () => {
    for (const route of ROUTES) {
      test(`${route} fits its viewport`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route, { waitUntil: "networkidle" });

        // Readiness gate. `networkidle` proves the network went quiet, not that React painted —
        // and the defects both new guards exist for live inside table rows, so a scan that ran
        // against an unhydrated shell would pass having measured nothing. The repo's rule
        // (docs/TESTING_AND_CICD.md) is a readiness gate wherever a spec needs one; every route
        // in the list above renders an `h1`.
        await expect(page.locator("h1").first()).toBeVisible();

        const measured = await page.evaluate(() => {
          const root = document.documentElement;
          const overflow = root.scrollWidth - root.clientWidth;

          // Name the culprit rather than only the symptom — a bare "447 > 390" sends the next
          // reader hunting through a whole page, and the offender is almost never the element
          // that looks wide. Only elements reaching *the document's* right edge are reported:
          // a table inside `overflow-auto` sticks out to 881px and is irrelevant, because its
          // scroller clips it and it sets no document extent. The offender is whatever lands
          // at scrollWidth.
          const offenders: { tag: string; cls: string; right: number }[] = [];
          if (overflow > 0) {
            for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
              const right = el.getBoundingClientRect().right;
              if (right > root.clientWidth + 1 && right <= root.scrollWidth + 1) {
                offenders.push({
                  tag: el.tagName.toLowerCase(),
                  cls: typeof el.className === "string" ? el.className.slice(0, 60) : "",
                  right: Math.round(right),
                });
              }
            }
            offenders.sort((a, b) => b.right - a.right);
          }
          return { overflow, widest: offenders.slice(0, 5) };
        });

        // 1px, not 0, and it has to be the *same* 1px the offender scan above uses. Both
        // `scrollWidth` and `clientWidth` are rounded integers, so a page laying out at 390.4
        // reports 391 vs 390 — a failure of exactly 1px whose culprit list would come back
        // empty, because the scan only reports elements past `clientWidth + 1`. A red gate that
        // names nothing is worse than no gate. `navigation.spec.ts` took the same 1px for the
        // same reason ("half a pixel is layout rounding, not coverage"); the defects this was
        // written for were +57px and +47px, so nothing real hides under the tolerance.
        expect(
          measured.overflow,
          `${route} at ${viewport.width}px overflows by ${measured.overflow}px. ` +
            `Widest: ${JSON.stringify(measured.widest)}`,
        ).toBeLessThanOrEqual(1);
      });
    }
  });
}
