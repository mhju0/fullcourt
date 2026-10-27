// Capture the current README surfaces from a populated app; fail if expected content is absent.
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const deploymentSha = process.env.SCREENSHOT_DEPLOYMENT_SHA;
const deploymentId = process.env.SCREENSHOT_DEPLOYMENT_ID;
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname) && (!deploymentSha || !deploymentId)) {
  throw new Error("Set SCREENSHOT_DEPLOYMENT_SHA and SCREENSHOT_DEPLOYMENT_ID for a deployed capture.");
}
const out = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const pages = [
  { file: "games", route: "/games?season=2024-25&date=2024-12-02", anchor: '.fc-game-row >> nth=3' },
  { file: "shooting", route: "/shooting?year=2025", anchor: '[data-testid="player-row"] >> nth=14' },
  { file: "officiating", route: "/officiating", anchor: 'section[aria-labelledby="review-title"] summary >> nth=2' },
  { file: "games-mobile-375", route: "/games?season=2024-25&date=2024-12-02", anchor: '.fc-game-row >> nth=0', width: 375, height: 812 },
  { file: "shooting-mobile-402", route: "/shooting?year=2025", anchor: '[data-testid="player-row"] >> nth=4', scrollTo: "#pr-season", width: 402, height: 874 },
  { file: "schedule-mobile-402", route: "/schedule", anchor: 'ol a[aria-label^="View "] >> nth=0', width: 402, height: 874 },
];
const requested = process.argv.slice(2);
if (requested.some(name => !pages.some(page => page.file === name))) {
  throw new Error(`Choose from: ${pages.map(page => page.file).join(", ")}`);
}
await mkdir(out, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await readFile(`${out}/manifest.json`, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const browser = await chromium.launch();
try {
  for (const { file, route, anchor, scrollTo, width = 1280, height: viewportHeight = 2400 } of pages.filter(page => !requested.length || requested.includes(page.file))) {
    const page = await browser.newPage({ viewport: { width, height: viewportHeight }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await page.goto(new URL(route, base).href, { waitUntil: "load", timeout: 60_000 });
    await page.locator(anchor).waitFor({ state: "visible", timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    // Phone views may start lower, below the sticky header, so table rows fit above the bottom navigation.
    if (scrollTo) await page.locator(scrollTo).evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 96));
    const box = await page.locator(anchor).boundingBox();
    if (!box) throw new Error(`Missing capture anchor: ${file}`);
    const height = width < 600 ? viewportHeight : Math.ceil(box.y + box.height);
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (pageWidth > width) throw new Error(`${file}: page overflow ${pageWidth} > ${width}`);
    await page.screenshot({ path: `${out}/${file}.png`, clip: { x: 0, y: 0, width, height } });
    manifest[file] = { source: base, route, scrollTo, url: page.url(), deploymentSha, deploymentId, width, height, capturedAt: new Date().toISOString(), browser: "Chromium", physicalDevice: false, pageScrollWidth: pageWidth };
    await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${file}.png: ${width} × ${height}`);
    await page.close();
  }
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
} finally { await browser.close(); }
