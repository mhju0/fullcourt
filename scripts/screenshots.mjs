// Regenerates docs/screenshots/*.png for the README.
//
//   pnpm dev            # in another terminal
//   node scripts/screenshots.mjs
//
// Heights are fixed per page rather than fullPage: the real pages run several
// thousand pixels tall, which reads as a wall of pixels in a README. Each value
// is the point where that page's last complete card ends.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(fileURLToPath(new URL("..", import.meta.url)), "docs/screenshots");

// Every height below was re-derived on 2026-08-11 after the alignment pass, by measuring the
// bottom edge of the last complete card or table row in the DOM rather than by eye. The pass
// moved almost every one of them: badges gained 2px of height, off-scale gaps were snapped, and
// `termInsetStyle` became a band, so cards and rows are a few pixels taller than they were and
// each old height had drifted into slicing the row it used to end on.
//
// Four of them moved exactly +1px later the same day, when `.fc-table`'s header row took a
// `border-top` so a table closes at the top as well as the bottom. One table above the anchor,
// one pixel: season, schedule, shooting, availability. The pages with no `.fc-table` above their
// anchor (games, analysis, playoffs, shot-quality) did not move.
const PAGES = [
  // Two complete matchup rows, which is what the README's alt text describes — the second one
  // ends at 1240. Rows are a uniform 81px again (80px for the first, which carries no top
  // rule): the evidence sentence moved into the expansion on 2026-08-11, so no collapsed row
  // is taller than any other. The rows also start lower than they did, because this height was
  // last derived before the home page grew its thesis band.
  { file: "games", path: "/", height: 1240 },
  // Tenth complete row of WHAT THE SCHEDULE WAS WORTH (rows step 35px from 1136). The extremes
  // line above the table carries both ends of the range that ten rows cannot show. The skeleton
  // wait logs a warning on this page: ZeroRestWorkload sits far below this cut and is still
  // fetching player-rest.json when the timer expires. Harmless — check the capture, not the
  // warning.
  { file: "season", path: "/season", height: 1452 },
  // Stops after the complete WIN RATE BY SEASON card; the next block (READING THESE NUMBERS)
  // starts at 1580. Up 152px from 1380 on 2026-08-11, when the excluded half left the hero tile
  // row and became a 104px NOT COUNTED band beneath it (plus the 48px chapter gap).
  { file: "analysis", path: "/analysis", height: 1532 },
  // The scale sentence plus the breakdown table's first nine complete rows (rows step 35px
  // from 1569); anything between 1814 and 1849 slices row 9 in half.
  { file: "schedule", path: "/schedule", height: 1850 },
  // The complete FIRST ROUND · 8 SERIES block, which is what the README's alt text describes.
  // CONFERENCE SEMIFINALS runs on to 2398, and the old 1965 cut two series into it.
  { file: "playoffs", path: "/playoffs", height: 1885 },
  // Twenty-five complete player rows (rows step 35px from 611). Row 25 is James Harden, whom
  // the README's alt text calls out as the largest positive rest effect — at the previous 1400
  // the crop stopped at row 23, so the alt text had been describing a row the image did not
  // contain. Ends on a row boundary either way.
  { file: "shooting", path: "/shooting", height: 1452 },
  // The whole two-court card, which ends at 1275. The old 1430 ran 155px past it into the
  // footer.
  { file: "shot-quality", path: "/shot-quality", height: 1275 },
  // Stops after "THE SCHEDULE STILL COUNTS" (bottom 1891), so the shot carries the headline,
  // the frequency, the load-management trend and the defensive result. The section below is the
  // "what this is not" disclaimer, which the README states in prose anyway.
  { file: "availability", path: "/availability", height: 1892 },
];

// Optional filter: `node scripts/screenshots.mjs analysis season` shoots only those.
// One page changing is the common case, and regenerating all nine puts eight unrelated
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

for (const { file, path: route, height } of targets) {
  const context = await browser.newContext({
    viewport: { width: 1440, height },
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

  // Wait for the content, not the clock. A fixed 4s pause captured /games mid-load once the
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

  await page.screenshot({ path: path.join(OUT, `${file}.png`) });
  await context.close();
  console.log(`${file}.png`);
}

await browser.close();
