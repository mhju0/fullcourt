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

const ROUTES = [
  "/",
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

test.describe("A table's first column starts where its container does", () => {
  for (const route of ["/season", "/analysis", "/shooting", "/behind-the-data/rest-advantage"]) {
    test(`first column takes no inset of its own on ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: "networkidle" });

      const offsets = await page.evaluate(() => {
        const out: { pad: string; tag: string }[] = [];
        for (const table of document.querySelectorAll("table.fc-table")) {
          const first = table.querySelector("thead th:first-child, tbody td:first-child");
          if (!first) continue;
          out.push({ pad: getComputedStyle(first).paddingLeft, tag: first.tagName });
        }
        return out;
      });

      expect(offsets.length, `${route} rendered no .fc-table`).toBeGreaterThan(0);
      for (const { pad, tag } of offsets) {
        expect(pad, `${route}: a <${tag}> first cell pads ${pad} instead of 0px`).toBe("0px");
      }
    });
  }
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
