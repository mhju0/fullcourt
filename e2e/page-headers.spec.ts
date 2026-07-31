import { test, expect } from "@playwright/test";

/**
 * Every page's intro sits in exactly two lines, with no stranded last line.
 *
 * This is checked rather than eyeballed because it is invisible in a diff: adding four words to
 * a description is a one-line change that silently pushes a third line onto the page and shoves
 * the content below the fold. Several pages had drifted that way — /schedule to four lines,
 * /analysis to a third line holding a single word.
 *
 * The measure is a fixed `rem` width, so wrapping does not depend on the viewport. One desktop
 * width therefore settles it, and the assertion holds on any screen wide enough to reach that
 * measure. Narrow viewports legitimately wrap further and are not asserted here.
 */
const ROUTES = [
  "/",
  "/season",
  "/schedule",
  "/analysis",
  "/playoffs",
  "/shooting",
  "/shot-quality",
  "/referees",
  "/behind-the-data",
  "/behind-the-data/rest-advantage",
  "/behind-the-data/schedule-edge",
  "/behind-the-data/playoff-predictions",
  "/behind-the-data/player-shooting",
  "/behind-the-data/shot-value",
  "/behind-the-data/data-and-limits",
];

/** Below this the final line reads as an orphan — a couple of words alone under a full line. */
const MIN_LAST_LINE_FILL = 30;

test.describe("Page header descriptions", () => {
  for (const route of ROUTES) {
    test(`fits two lines on ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: "networkidle" });

      const measured = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        const p = h1?.parentElement?.querySelector("p");
        if (!p) return null;
        // One client rect per line box, so this counts real wrapped lines rather than
        // estimating from character length.
        const range = document.createRange();
        range.selectNodeContents(p);
        const rects = [...range.getClientRects()].filter((r) => r.width > 1);
        if (rects.length === 0) return null;
        const boxWidth = p.getBoundingClientRect().width;
        const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
        const lastTop = Math.max(...tops);
        const lastWidth = rects
          .filter((r) => Math.round(r.top) === lastTop)
          .reduce((a, r) => a + r.width, 0);
        return { lines: tops.length, fill: Math.round((100 * lastWidth) / boxWidth) };
      });

      expect(measured, `${route} has no header description`).not.toBeNull();
      expect(measured!.lines, `${route} description wraps to ${measured!.lines} lines`).toBeLessThanOrEqual(2);
      if (measured!.lines === 2) {
        expect(
          measured!.fill,
          `${route} strands its last line at ${measured!.fill}% of the measure`
        ).toBeGreaterThanOrEqual(MIN_LAST_LINE_FILL);
      }
    });
  }
});
