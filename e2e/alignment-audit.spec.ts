import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The alignment instrument.
 *
 * "Spacing looks awkward" is not a reviewable claim, so this turns it into one: it walks every
 * layout-significant box on every in-scope page and reports where their left and right edges
 * actually land. A page is aligned when its edges cluster on a few shared rails; it looks
 * awkward when an edge sits a handful of pixels off a rail that most of the page uses, which
 * reads as a mistake rather than as a distinction.
 *
 * This is a REPORTER, not an assertion. It writes a file and always passes. The numbers are the
 * output — deliberately written to disk rather than logged, because this environment has masked
 * numeric digits in stdout before (see CLAUDE.md, Evidence discipline) and a spacing audit read
 * off a corrupted stdout is worse than no audit.
 *
 *   pnpm exec playwright test alignment-audit
 *   → test-results/alignment/report.txt
 *
 * Run it once before a spacing change and once after, and diff the two.
 */

/** In scope per the alignment pass: the eight published routes, the reference section, and
 *  `/referees` (mechanically maintained, never published). The front door `/` is deliberately
 *  absent — it is a full-bleed, self-scoped surface that does not play by the shared grid. It
 *  was at `/about` when this list was written; the swap on 2026-08-12 moved it to `/` and the
 *  games board it displaced to `/games`, so the exemption follows the page, not the address. */
const ROUTES = [
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
  "/behind-the-data/playoff-predictions",
  "/behind-the-data/player-shooting",
  "/behind-the-data/shot-value",
  "/behind-the-data/availability",
  "/behind-the-data/referees",
  "/behind-the-data/data-and-limits",
];

/** Desktop, the laptop width where the container stops growing, and a small phone. */
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 800 },
  { name: "390", width: 390, height: 844 },
];

/**
 * An edge this far off a busier rail is a near-miss: too close to read as a deliberate step,
 * too far to look flush. 10px is one step over the largest gap on the 4px scale that could be
 * intentional (8px), so anything inside it is either a mistake or an undocumented exception.
 */
const NEAR_MISS_PX = 10;

/**
 * A 1px difference is structure, not a mistake: `getBoundingClientRect` includes an element's
 * own border, so a bordered box's contents necessarily begin 1px inside the box's reported
 * edge. Nothing in the design system can remove that, and reporting it buried the real strays.
 */
const NEAR_MISS_MIN_PX = 2;

/** A rail needs this many edges on it before a nearby stray counts as missing *it*. */
const RAIL_MIN_POPULATION = 4;

type Edge = { x: number; label: string };
type Measured = { left: Edge[]; right: Edge[] };

test.describe.configure({ mode: "serial" });

// 51 page loads (17 routes × 3 viewports), the first pass of which pays for a cold Turbopack
// compile of every route. The default 30s is a per-*test* budget, and this is deliberately one
// test so the whole sweep lands in one report file.
test.setTimeout(20 * 60 * 1000);

test("measure every rail on every page", async ({ page }) => {
  const lines: string[] = [];
  lines.push("FullCourt alignment audit");
  lines.push(`near-miss window: ${NEAR_MISS_PX}px · rail floor: ${RAIL_MIN_POPULATION} edges`);
  lines.push("");

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const route of ROUTES) {
      // A route that never reaches network idle (a live-polling page, a slow query) still has a
      // laid-out DOM worth measuring, so a stalled wait degrades to measuring what is there
      // rather than failing the sweep and losing the other 50 measurements with it.
      try {
        await page.goto(route, { waitUntil: "networkidle", timeout: 45_000 });
      } catch {
        lines.push(`  (note: ${route} never reached network idle — measured as rendered)`);
      }

      const measured: Measured | null = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return null;

        const left: { x: number; label: string }[] = [];
        const right: { x: number; label: string }[] = [];

        const describe = (el: Element) => {
          const tag = el.tagName.toLowerCase();
          const cls = (el.getAttribute("class") ?? "")
            .split(/\s+/)
            .filter((c) => c && !c.startsWith("hover:") && !c.startsWith("motion-"))
            .slice(0, 3)
            .join(".");
          const text = (el.textContent ?? "").trim().slice(0, 24).replace(/\s+/g, " ");
          return `${tag}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
        };

        for (const el of main.querySelectorAll("*")) {
          const rect = el.getBoundingClientRect();
          // Invisible, collapsed, or decorative slivers carry no alignment meaning.
          if (rect.width < 40 || rect.height < 8) continue;

          // Chart internals (axis ticks, series labels) are positioned by the plotting library
          // against the data, not by the page grid. They are not misaligned when they disagree
          // with a card edge, so counting them would bury the real strays.
          if (el.closest("svg")) continue;

          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
            continue;
          }
          // Anything positioned out of flow (modals, tooltips, the sticky nav) aligns to its own
          // anchor rather than to the page column, so it would only add noise.
          if (style.position === "fixed" || style.position === "absolute") continue;

          const paints =
            style.borderLeftWidth !== "0px" ||
            style.borderTopWidth !== "0px" ||
            (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent");

          // Only boxes have edges the page grid controls. An inline <em> or <span> in the middle
          // of a sentence begins wherever the word before it ended and ends wherever its own last
          // character falls — both of its edges measure the copy, not the layout. Counting them
          // reported every sentence in the app as a pile of alignment faults. A badge is still
          // counted, because it paints, and a paragraph is, because it is a block.
          const isBox =
            paints ||
            style.display.startsWith("block") ||
            style.display.startsWith("flex") ||
            style.display.startsWith("grid") ||
            style.display.startsWith("table") ||
            style.display === "list-item" ||
            el.tagName === "TD" ||
            el.tagName === "TH";

          if (!isBox) continue;

          const label = describe(el);
          left.push({ x: Math.round(rect.left), label });
          right.push({ x: Math.round(rect.right), label });
        }

        return { left, right };
      });

      lines.push(`── ${route} @ ${vp.name}px ${"─".repeat(Math.max(0, 46 - route.length))}`);

      if (!measured || measured.left.length === 0) {
        lines.push("   (no measurable content — page empty or failed to load)");
        lines.push("");
        continue;
      }

      for (const side of ["left", "right"] as const) {
        const edges = measured[side];
        const counts = new Map<number, string[]>();
        for (const e of edges) {
          const at = counts.get(e.x) ?? [];
          at.push(e.label);
          counts.set(e.x, at);
        }

        const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
        const rails = sorted.filter(([, l]) => l.length >= RAIL_MIN_POPULATION).map(([x]) => x);

        lines.push(`  ${side.toUpperCase()} rails: ${rails.join(", ") || "(none)"}`);

        // A stray is an edge that sits close to — but not on — a real rail.
        const strays: string[] = [];
        for (const [x, labels] of sorted) {
          if (rails.includes(x)) continue;
          const nearest = rails.find(
            (r) => Math.abs(r - x) <= NEAR_MISS_PX && Math.abs(r - x) >= NEAR_MISS_MIN_PX
          );
          if (nearest === undefined) continue;
          const delta = x - nearest;
          strays.push(
            `    ${x}px (${delta > 0 ? "+" : ""}${delta} off rail ${nearest}) ×${labels.length}` +
              ` — ${labels.slice(0, 2).join(" | ")}`
          );
        }

        if (strays.length > 0) {
          lines.push(`  ${side.toUpperCase()} strays:`);
          lines.push(...strays);
        }
      }

      lines.push("");
    }
  }

  const out = resolve(process.cwd(), "test-results/alignment/report.txt");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n"), "utf8");
});
