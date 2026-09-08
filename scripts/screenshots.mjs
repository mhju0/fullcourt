// Capture the current README surfaces from a populated app; fail if expected content is absent.
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const out = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const pages = [
  { file: "games", route: "/games?season=2024-25&date=2024-12-25", anchor: '.fc-game-row >> nth=1' },
  { file: "shooting", route: "/shooting", anchor: '[data-testid="player-row"] >> nth=14' },
  { file: "officiating", route: "/officiating", anchor: 'section[aria-labelledby="review-title"] summary >> nth=2' },
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
  for (const { file, route, anchor } of pages.filter(page => !requested.length || requested.includes(page.file))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 2400 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await page.goto(new URL(route, base).href, { waitUntil: "load", timeout: 60_000 });
    await page.locator(anchor).waitFor({ state: "visible", timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    const box = await page.locator(anchor).boundingBox();
    if (!box) throw new Error(`Missing capture anchor: ${file}`);
    const height = Math.ceil(box.y + box.height);
    await page.screenshot({ path: `${out}/${file}.png`, clip: { x: 0, y: 0, width: 1280, height } });
    manifest[file] = { source: base, route, width: 1280, height, capturedAt: new Date().toISOString() };
    console.log(`${file}.png: 1280 × ${height}`);
    await page.close();
  }
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
} finally { await browser.close(); }
