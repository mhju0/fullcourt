import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * axe, as a gate rather than a pass.
 *
 * There was an accessibility audit on 2026-08-24 and it was real work: it found two discrete
 * defects, forced the text-grade pole tokens, and ended with "zero violations on all 20 routes".
 * Every word of that was true when written. It was false four days later, when the redesign
 * round merged — and *nothing in the repo could say so*, because the pass was a one-off local
 * script and `axe-core` was not a dependency. A pass that cannot fail is a claim, not a test.
 *
 * So the pass becomes a spec, and it fixes both holes the 2026-09-01 audit found in the old one:
 *
 *  - **It runs at phone width.** The 08-24 run was 1440x900 only. Of the twelve routes failing
 *    when this was written, eleven failed *only* at 390px — a width no a11y pass had ever used.
 *  - **It sees composited colour.** `design-contrast.test.ts` pins the ratios of the *tokens*,
 *    which is why an `opacity: 0.4` inherited by 10px text sailed past it at 1.8:1. axe reads
 *    what the pixel actually is.
 *
 * This lives in e2e, so it is outside the four-command commit gate by the same rule as every
 * other spec here — run `pnpm test:e2e` by hand when a route or a component moves.
 */

/** Every published route, the same list `layout-integrity.spec.ts` walks. */
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

/** The 2026-08-24 pass's tag set, kept verbatim so this gate is no weaker than the claim it replaces. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

for (const viewport of VIEWPORTS) {
  test.describe(`axe finds nothing at ${viewport.name}`, () => {
    for (const route of ROUTES) {
      test(`${route} is clean`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route, { waitUntil: "networkidle" });

        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        // Report the rule, the count and one selector per violation. A bare "3 violations"
        // costs the next reader a full local re-run to learn anything at all.
        const summary = results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          first: v.nodes[0]?.target?.join(" "),
        }));

        expect(summary, `${route} at ${viewport.width}px: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
      });
    }
  });
}
