import { test, expect } from "@playwright/test";

/**
 * The alignment law, as assertions.
 *
 * `alignment-audit.spec.ts` measures and reports; this one fails. The two are deliberately
 * separate: the audit's stray count has a floor it can never reach, because a wrapped nav row
 * or a horizontally scrolling date strip places its items by flow and they land wherever the
 * items before them ended. Driving that number to zero is impossible and chasing it would only
 * tempt someone to tune the instrument. So the number stays advisory, and the parts of the law
 * that ARE absolute are checked here instead.
 *
 * Three rules, all of which were broken somewhere before 2026-08-11:
 *
 *  1. The outer rail is one line. Page title, page content and the nav bar above it all start
 *     at the same x.
 *  2. A table's first column starts exactly where its container's content starts — no inset of
 *     its own. Cells used to pad 10px, so every table sat 10px inside its own heading.
 *  3. Expanding a row does not move it sideways. The /shooting group rail was a `border-left`,
 *     which took layout width and shifted an open player's first column 2px right of a closed
 *     one's.
 */

/**
 * `/games`, not `/`. The front door is a full-bleed, self-scoped surface that does not play by
 * the shared grid — its hero is centred and its sections bleed past both edges by design, so
 * measuring it against the container rail asserts a law it was never meant to follow. The
 * exemption is not new; it was written into `alignment-audit.spec.ts` when this page lived at
 * `/about`, and only the route changed on 2026-08-12.
 */
const ROUTES = [
  "/games",
  "/season",
  "/schedule",
  "/analysis",
  "/playoffs",
  "/shooting",
  "/shot-quality",
  "/availability",
  "/behind-the-data",
  "/behind-the-data/rest-advantage",
];

test.describe("The outer rail is one vertical line", () => {
  for (const route of ROUTES) {
    test(`page title sits on the container gutter on ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: "networkidle" });

      const measured = await page.evaluate(() => {
        const h1 = document.querySelector("main h1");
        const column = document.querySelector("main > div");
        const nav = document.querySelector("nav");
        if (!h1 || !column) return null;
        const colStyle = getComputedStyle(column);
        return {
          title: h1.getBoundingClientRect().left,
          // The column's content edge — where its padding ends — is the outer rail.
          rail: column.getBoundingClientRect().left + parseFloat(colStyle.paddingLeft),
          nav: nav ? nav.getBoundingClientRect().left : null,
        };
      });

      expect(measured, `${route} has no h1 inside main`).not.toBeNull();
      expect(
        Math.abs(measured!.title - measured!.rail),
        `${route}: page title at ${measured!.title}, outer rail at ${measured!.rail}`
      ).toBeLessThanOrEqual(1);
    });
  }
});

/**
 * A table is a box, so its cells sit on the box's inner rail — every one of them, edges
 * included. The edge cells padded to zero for part of 2026-08-11 so a first column would land
 * on the page gutter; `termThStyle` paints the header band, so that put the column's text hard
 * against a fill. This asserts the revert, and it discriminates: it compares the first cell to
 * an interior one rather than pinning a literal, so the rule survives a change to the value.
 */
test.describe("A table's cells sit on one inset, edges included", () => {
  for (const route of ["/season", "/analysis", "/shooting", "/behind-the-data/rest-advantage"]) {
    test(`no edge cell pads differently from its neighbours on ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: "networkidle" });

      const rows = await page.evaluate(() => {
        const out: { first: string; interior: string; last: string; n: number }[] = [];
        for (const table of document.querySelectorAll("table.fc-table")) {
          // The widest header row, so a table with grouped headers is measured on the row
          // that actually has an interior cell to compare against.
          const headRows = Array.from(table.querySelectorAll("thead tr"));
          const head = headRows.sort((a, b) => b.children.length - a.children.length)[0];
          const cells = head ? Array.from(head.children) : [];
          if (cells.length < 3) continue;
          out.push({
            first: getComputedStyle(cells[0]).paddingLeft,
            interior: getComputedStyle(cells[1]).paddingLeft,
            last: getComputedStyle(cells[cells.length - 1]).paddingRight,
            n: cells.length,
          });
        }
        return out;
      });

      expect(rows.length, `${route} rendered no .fc-table with 3+ columns`).toBeGreaterThan(0);
      for (const { first, interior, last, n } of rows) {
        expect(first, `${route}: a ${n}-column table's first cell pads ${first}, interior ${interior}`).toBe(interior);
        expect(last, `${route}: a ${n}-column table's last cell pads ${last}, interior ${interior}`).toBe(interior);
        expect(first, `${route}: cells pad to zero — the edge-to-zero rule was reverted`).not.toBe("0px");
      }
    });
  }
});

/**
 * `TERM_NUMERIC_TABLE_MAX_WIDTH` is a ceiling, not a target. With `w-full` beside it a
 * three-column table still took the full 760, which ran the season report's middle column to
 * 390px to hold `+21` — 528px of nothing between a team and its own number.
 */
test("a few-column numeric table sizes to its content, not to the cap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/season", { waitUntil: "networkidle" });

  const worth = page.locator('[data-testid="schedule-value-extremes"] ~ div table.fc-table').first();
  await expect(worth).toBeVisible();

  const box = await worth.boundingBox();
  expect(box).not.toBeNull();
  // Its own `minWidth` is 420 and the shared cap is 760. Landing at the cap means `w-full`
  // came back; landing at the floor means the columns are sized by their content.
  expect(box!.width, `the three-column table is ${box!.width}px wide`).toBeLessThan(560);
});

test("expanding a /shooting player does not shift its row sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/shooting", { waitUntil: "networkidle" });

  const firstRow = page.locator("table.fc-table tbody tr").first();
  await expect(firstRow).toBeVisible();

  const nameCellBefore = await firstRow.locator("td").nth(1).boundingBox();
  await firstRow.click();
  // The expanded seasons render as rows of the same table, so the clicked row stays put.
  await expect(page.locator('[data-testid="season-row"]').first()).toBeVisible();
  const nameCellAfter = await firstRow.locator("td").nth(1).boundingBox();

  expect(nameCellBefore).not.toBeNull();
  expect(nameCellAfter).not.toBeNull();
  expect(
    Math.abs(nameCellAfter!.x - nameCellBefore!.x),
    `expanding moved the row from x=${nameCellBefore!.x} to x=${nameCellAfter!.x}`
  ).toBeLessThanOrEqual(0.5);
});
