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
  { file: "analysis", path: "/analysis", height: 1160 },
  { file: "schedule", path: "/schedule", height: 1320 },
  // Raised from 1300 on 2026-07-30: the calibration-led header is one card taller than the
  // accuracy tiles it replaced, which pushed 1300 to a cut mid-way through the fourth series.
  { file: "playoffs", path: "/playoffs", height: 1670 },
  { file: "shooting", path: "/shooting", height: 1400 },
  { file: "shot-quality", path: "/shot-quality", height: 1430 },
];

const browser = await chromium.launch();

for (const { file, path: route, height } of PAGES) {
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
  await page.evaluate(() => {
    for (const span of document.querySelectorAll("footer span")) {
      const first = span.firstChild;
      if (first?.nodeType === Node.TEXT_NODE && first.textContent?.includes("RENDERED:")) {
        first.textContent = "RENDERED: — · ";
      }
    }
  });

  await page.screenshot({ path: path.join(OUT, `${file}.png`) });
  await context.close();
  console.log(`${file}.png`);
}

await browser.close();
