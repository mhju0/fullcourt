// Regenerates docs/screenshots/*.png for the README.
//
//   pnpm dev            # in another terminal
//   node scripts/screenshots.mjs
//   node scripts/screenshots.mjs analysis season      # just these two
//
// Shots are cropped rather than fullPage: the real pages run several thousand pixels tall, which
// reads as a wall of pixels in a README.
//
// EACH PAGE NAMES THE ELEMENT ITS SHOT ENDS ON, NOT HOW TALL THE SHOT IS. The crop height is
// measured from that element's bottom edge at capture time. Until 2026-08-11 every entry carried a
// hand-derived pixel height instead, with a paragraph of prose explaining what the number had been
// measured against — so the rule lived in English next to the number it produced, and any layout
// change silently invalidated it. There was no way for that to fail: `games.png` had been short of
// the two matchup rows its alt text describes ever since the home page grew its thesis band, and
// four heights moved by exactly 1px the day a table header gained a top rule. Those heights were
// re-derived by hand three times in a single day before this replaced them.
//
// An anchor that no longer resolves throws. A stale number could not.
//
// Anchors are Playwright selectors. Prefer something the page already has — a row, an existing
// `data-testid` — and fall back to a `data-shot-anchor` attribute on the block itself when the
// intended cut is a whole card or section that nothing else identifies.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(fileURLToPath(new URL("..", import.meta.url)), "docs/screenshots");

const WIDTH = 1440;
// Tall enough that every anchor below is laid out and measurable in one pass. The page is rendered
// at this height and then cropped, so nothing is resized between measuring and shooting.
const MEASURE_HEIGHT = 2800;

const PAGES = [
  // Two complete matchup rows, which is what the README's alt text describes. The row group's
  // bottom is its toggle's bottom — the collapsed expansion below it has no height.
  // `/games`, not `/`. The board moved there in the 2026-08-12 front-door swap and this target
  // was not moved with it, so the anchor had been pointing at the marketing page ever since —
  // which is exactly the failure the anchor rule above is meant to make loud rather than silent.
  { file: "games", path: "/games", endsAfter: '[aria-label$="game details"] >> nth=1' },
  // Through the slimmed WHAT THE SCHEDULE WAS WORTH (callout, extremes, crosslink — the table's
  // one home is /schedule since 2026-08-23) and ten rows into REST EDGE CONVERSION, the section
  // that move lifted up the page.
  {
    file: "season",
    path: "/season",
    endsAfter: '[data-testid="edge-conversion-row"] >> nth=9',
  },
  // The whole WIN RATE BY SEASON card. The next block (READING THESE NUMBERS) is the "how to read
  // this" essay, which the README states in prose anyway.
  { file: "analysis", path: "/analysis", endsAfter: '[data-shot-anchor="win-rate-by-season"]' },
  // Nine complete rows of FULL BREAKDOWN, the first of the two tables on the page.
  {
    file: "schedule",
    path: "/schedule",
    endsAfter: "table.fc-table >> nth=0 >> tbody tr >> nth=8",
  },
  // The complete FIRST ROUND block, which is what the README's alt text describes. Every round
  // carries the anchor; the shot ends after the first.
  { file: "playoffs", path: "/playoffs", endsAfter: '[data-shot-anchor="round-group"] >> nth=0' },
  // Twenty-five complete player rows. Row 25 is the largest positive rest effect, which the
  // README's alt text calls out by name.
  { file: "shooting", path: "/shooting", endsAfter: "table.fc-table tbody tr >> nth=24" },
  // The whole two-court card.
  { file: "shot-quality", path: "/shot-quality", endsAfter: '[data-shot-anchor="two-court"]' },
  // Through THE SCHEDULE STILL COUNTS, so the shot carries the headline, the frequency, the
  // load-management trend and the defensive result. The section below it is the "what this is not"
  // disclaimer, which the README states in prose anyway.
  {
    file: "availability",
    path: "/availability",
    endsAfter: '[data-shot-anchor="schedule-still-counts"]',
  },
  // Twelve complete rows of the foul-mix table, which is the page's identity: the deviation
  // columns and the emphasis rule. The folklore chapter runs several thousand pixels below and
  // is left to the live page rather than stretched into a README image.
  {
    file: "referees",
    path: "/referees",
    endsAfter: '[data-testid="referee-style-row"] >> nth=11',
  },
];

// Optional filter: `node scripts/screenshots.mjs analysis season` shoots only those.
// One page changing is the common case, and regenerating all eight puts seven unrelated
// binaries in the diff — which makes a review of the one that matters harder, not easier.
const only = process.argv.slice(2);
const targets = only.length > 0 ? PAGES.filter((p) => only.includes(p.file)) : PAGES;

if (targets.length === 0) {
  console.error(
    `no page matches ${only.join(", ")}. known: ${PAGES.map((p) => p.file).join(", ")}`
  );
  process.exit(1);
}

const browser = await chromium.launch();

for (const { file, path: route, endsAfter } of targets) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: MEASURE_HEIGHT },
    deviceScaleFactor: 2,
    // Cards enter with a staggered fadeInUp; globals.css already neutralises that
    // keyframe under reduced motion. Without this a capture can land mid-fade and
    // come out washed out and a few pixels low.
    reducedMotion: "reduce",
  });

  const page = await context.newPage();
  // Not networkidle: /shot-quality holds a Realtime socket open, so idle never comes.
  await page.goto(BASE + route, { waitUntil: "load", timeout: 60_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });

  // Wait for the content, not the clock. A fixed pause captured /games mid-load once the
  // dev server had more routes to compile — the shot shipped with "0 games" and five empty
  // skeleton rows, which is a worse artifact than the stale one it replaced. Skeletons carry
  // data-slot="skeleton", so their absence is the real "this page is ready" signal.
  await page
    .waitForFunction(() => document.querySelectorAll('[data-slot="skeleton"]').length === 0, {
      timeout: 45_000,
    })
    .catch(() => console.warn(`  ${file}: skeletons still present at timeout`));
  await page.waitForTimeout(4000); // charts mount and animate in

  // The footer prints the render clock, so an unfrozen capture produces a fresh
  // ~600KB binary diff on every run even when nothing changed. Blanking the value
  // (the SYSTEM STATUS link beside it survives) makes repeat runs no-ops.
  //
  // Every text node, not just the first: layout.tsx renders `RENDERED: {renderedAt} ·{" "}`,
  // which React emits as separate nodes — "RENDERED: ", the timestamp, then " ·". Replacing
  // only `firstChild` left the live timestamp on the page, so /shot-quality (the one capture
  // whose fixed height reaches the footer) shipped a fresh ~600KB diff every single day.
  await page.evaluate(() => {
    for (const span of document.querySelectorAll("footer span")) {
      if (!span.textContent?.includes("RENDERED:")) continue;
      let isFirst = true;
      for (const node of [...span.childNodes]) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        node.textContent = isFirst ? "RENDERED: — · " : "";
        isFirst = false;
      }
    }
  });

  // The whole point of the rewrite: measure, never assume. A missing anchor is a hard failure —
  // shooting the page anyway is how a wrong picture used to ship unnoticed.
  const anchor = page.locator(endsAfter);
  if ((await anchor.count()) === 0) {
    throw new Error(
      `${file}: anchor \`${endsAfter}\` matched nothing on ${route}. ` +
        `The markup it names has moved or been renamed — re-point it rather than guessing a height.`
    );
  }
  const box = await anchor.boundingBox();
  if (!box) throw new Error(`${file}: anchor \`${endsAfter}\` is not visible on ${route}.`);

  const height = Math.ceil(box.y + box.height);
  if (height > MEASURE_HEIGHT) {
    throw new Error(
      `${file}: the shot wants ${height}px but the page was measured at ${MEASURE_HEIGHT}px. ` +
        `Raise MEASURE_HEIGHT — the anchor was laid out below the fold and may have measured wrong.`
    );
  }

  await page.screenshot({
    path: path.join(OUT, `${file}.png`),
    clip: { x: 0, y: 0, width: WIDTH, height },
  });
  await context.close();
  console.log(`${file}.png  ${height}px`);
}

await browser.close();
