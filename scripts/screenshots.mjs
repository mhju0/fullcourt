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

const PAGES = [
  { file: "games", path: "/", height: 1390 },
  // 1450 lands just under the last complete REST EDGE CONVERSION row rather than slicing one
  // in half. The skeleton wait logs a warning on this page: ZeroRestWorkload sits far below
  // this cut and is still fetching player-rest.json when the timer expires. Harmless here —
  // check the capture, not the warning.
  { file: "season", path: "/season", height: 1450 },
  // Raised from 1160 on 2026-08-06: the page lost its "half this model declines" card and
  // gained the baseline frame, so 1160 now slices the season chart in half. This stops after
  // the complete WIN RATE BY SEASON card.
  { file: "analysis", path: "/analysis", height: 1400 },
  { file: "schedule", path: "/schedule", height: 1320 },
  // Raised from 1670 on 2026-07-31: the page was rebuilt argument-first (Sections A-D ahead
  // of the bracket), so this now stops after Section C's confound test instead of mid-bracket.
  { file: "playoffs", path: "/playoffs", height: 1965 },
  { file: "shooting", path: "/shooting", height: 1400 },
  { file: "shot-quality", path: "/shot-quality", height: 1430 },
  // Stops after "THE SCHEDULE STILL COUNTS" (measured bottom 1849), so the shot carries the
  // headline, the frequency, the load-management trend and the defensive result. The page
  // runs 2,266px; the section below this one is the "what this is not" disclaimer, which the
  // README states in prose anyway.
  { file: "availability", path: "/availability", height: 1880 },
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
  // First-visit guide would cover every shot.
  await context.addInitScript(() => {
    window.localStorage.setItem("fullcourt:onboarding:v1", "complete");
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
