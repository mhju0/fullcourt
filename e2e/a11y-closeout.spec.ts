import { writeFile } from "node:fs/promises";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { releaseDates, releaseGame } from "./fixtures/release-data";
import type { AnalysisResponse } from "../src/types";

async function recordGeometry(info: TestInfo, name: string, data: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(data, null, 2));
  await info.attach(name, { path, contentType: "application/json" });
}

// Synthetic API fixtures exercise UI states, never published basketball evidence.
const analysis: AnalysisResponse = {
  latestEvidenceDate: "2024-12-25", totalGames: 1000, overallWins: 620, overallWinRate: 62,
  thresholds: [], gapRanges: [
    { key: "small", min: 0.5, max: 3, games: 600, restedTeamWins: 360, winPct: 60 },
    { key: "medium", min: 3, max: 5, games: 300, restedTeamWins: 195, winPct: 65 },
    { key: "large", min: 5, max: null, games: 100, restedTeamWins: 65, winPct: 65 },
  ], eras: [], seasonWinRates: [],
  homeAwayBreakdown: { homeTeamMoreRested: { games: 1000, restedTeamWins: 620, winPct: 62 }, awayTeamMoreRested: { games: 500, restedTeamWins: 200, winPct: 40 } },
  venueBaseline: { games: 2000, homeWins: 1200, homeWinPct: 60, roadWinPct: 40 },
};

async function fixtures(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-15T17:00:00Z"));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname === "/api/analysis") data = analysis;
    else if (url.pathname === "/api/games/search") data = { games: [{ gameId: 20241225, date: "2024-12-25", season: "2024-25", homeTeamAbbreviation: "BOS", awayTeamAbbreviation: "BKN", homeScore: 110, awayScore: 100, homeFatigueScore: 1, awayFatigueScore: 4, restAdvantageDifferential: 3, advantageTeam: "home", restedTeamWon: true }], total: 1, page: 1, limit: 20 };
    else if (url.pathname.startsWith("/api/game/")) {
      const id = Number(url.pathname.split("/").at(-1));
      const game = releaseGame(id === 20241224 ? "2024-12-24" : "2024-12-25");
      const recent = [{ gameId: 20241224, date: "2024-12-24", opponentAbbreviation: "NYK", isHome: true, teamScore: 100, opponentScore: 90, won: true }];
      data = { game, homeRecentWeek: recent, awayRecentWeek: recent };
    } else if (url.pathname === "/api/games/dates") data = releaseDates(url.searchParams.get("season") ?? "2024-25");
    else if (url.pathname === "/api/games/upcoming") data = [];
    else if (/^\/api\/games\/\d{4}-\d{2}-\d{2}$/.test(url.pathname)) data = Array.from({ length: 10 }, (_, i) => ({ ...releaseGame(url.pathname.split("/").at(-1)!), id: 20241225 + i }));
    else return route.fulfill({ status: 501, json: { data: null, error: "No fixture" } });
    await route.fulfill({ json: { data, error: null } });
  });
}

async function doubledText(page: Page) {
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>("body *")).map(el => {
      const css = getComputedStyle(el);
      return { el, font: parseFloat(css.fontSize), line: parseFloat(css.lineHeight) };
    });
    for (const { el, font, line } of sizes) {
      el.style.fontSize = `${font * 2}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 2}px`;
    }
  });
}

for (const width of [390, 1440]) {
  test(`analysis modal native controls, axe and drill/back/focus at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await fixtures(page);
    await page.goto("/analysis");
    const opener = page.getByRole("button", { name: /^Open details:/ }).first();
    await opener.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Game details" });
    const recent = dialog.getByRole("button", { name: /^View game details:/ });
    await expect(recent).toHaveCount(2);
    const violations = (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations;
    expect.soft(violations.map(v => ({ id: v.id, nodes: v.nodes.length }))).toEqual([]);
    expect.soft(await recent.first().evaluate(el => ({ tag: el.tagName, parent: el.parentElement?.tagName })) ).toEqual({ tag: "BUTTON", parent: "LI" });
    const geometry = [];
    for (const control of [dialog.getByRole("button", { name: "Close dialog" }), recent.first()]) {
      const box = (await control.boundingBox())!;
      geometry.push({ label: await control.getAttribute("aria-label"), width: box.width, height: box.height });
      expect.soft(box.width).toBeGreaterThanOrEqual(44); expect.soft(box.height).toBeGreaterThanOrEqual(44);
    }
    await recordGeometry(info, "modal-geometry", { width, violations, geometry });
    await page.screenshot({ path: info.outputPath("modal.png") });
    await recent.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("modal-recent.png") });
    await recent.first().focus(); await page.keyboard.press("Space");
    const back = dialog.getByRole("button", { name: "Back to previous game" }); await expect(back).toBeVisible();
    await back.click(); await expect(back).toHaveCount(0);
    const close = dialog.getByRole("button", { name: "Close dialog" });
    await close.focus(); await page.keyboard.press("Shift+Tab"); await expect(recent.last()).toBeFocused();
    await page.keyboard.press("Tab"); await expect(close).toBeFocused();
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  });
}

test("Analysis keeps its heading and one live loading status while data is delayed", async ({ page }, info) => {
  await fixtures(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void; const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route("**/api/analysis", async route => { requested(); await gate; await route.fulfill({ json: { data: analysis, error: null } }); });
  await page.goto("/analysis"); await started;
  await expect.soft(page.getByRole("heading", { level: 1, name: "Model Results" })).toBeVisible();
  await expect.soft(page.getByRole("status")).toHaveText("Loading model results…");
  expect.soft(await page.locator('[data-slot="skeleton"]').evaluateAll(els => els.every(el => !!el.closest('[aria-hidden="true"]')))).toBe(true);
  await page.screenshot({ path: info.outputPath("analysis-loading.png"), fullPage: true });
  release(); await expect(page.getByRole("heading", { name: "The answer", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Model Results" })).toHaveCount(1);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("Games calendar fits 320px and refresh heading reflows with doubled computed text", async ({ page }, info) => {
  await fixtures(page); await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/games?season=2024-25&date=2024-12-25");
  await expect(page.getByRole("button", { name: /^Expand .* game details$/ })).toHaveCount(10);
  const calendar = page.getByRole("button", { name: "Calendar", exact: true });
  const calendarGeometry = await calendar.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  await recordGeometry(info, "calendar-geometry", calendarGeometry);
  expect.soft(calendarGeometry.scrollWidth).toBeLessThanOrEqual(calendarGeometry.clientWidth);
  await page.screenshot({ path: info.outputPath("games-320.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await doubledText(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await recordGeometry(info, "doubled-text-geometry", { viewport: 390, overflow });
  expect.soft(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("games-double-text.png"), fullPage: true });
});

test("Home reflows at 390px with doubled computed fonts (simulation, not native zoom)", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await expect(page.getByRole("heading", { name: "Rest is a stat" })).toBeVisible();
  // The credential-free build omits schedule rows. Exercise their real CSS with
  // synthetic markup matching HomeContent's populated dl branch.
  await page.evaluate(() => {
    const rule = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
      .find(rule => "selectorText" in rule && /^\.[\w-]+_teams$/.test(String(rule.selectorText))) as CSSStyleRule;
    const list = document.createElement("dl"); list.className = rule.selectorText.slice(1);
    list.innerHTML = "<div><dt>Trail Blazers<small>Highest</small></dt><dd>+12 <span>net edge games</span></dd></div>";
    document.querySelector('section[aria-label="Schedule and player findings"] article')!.append(list);
  });
  await doubledText(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await recordGeometry(info, "doubled-text-geometry", { viewport: 390, overflow });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("home-double-text.png"), fullPage: true });
});

test("Analysis identity and one status survive delayed client scripts", async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await fixtures(page);
  await page.route("**/*.js", async route => { await gate; await route.continue(); });
  await page.goto("/analysis", { waitUntil: "commit" });
  try {
    await expect(page.getByRole("heading", { level: 1, name: "Model Results" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Loading model results…");
    expect(await page.locator('[data-slot="skeleton"]').evaluateAll(els => els.length > 0 && els.every(el => !!el.closest('[aria-hidden="true"]')))).toBe(true);
  } finally { release(); }
  await expect(page.getByRole("heading", { name: "The answer", exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`delayed Games dates do not show false empty or zero-count days at ${width}px`, async ({ page }) => {
    await fixtures(page); await page.setViewportSize({ width, height: 900 });
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    let requested!: () => void; const started = new Promise<void>(resolve => { requested = resolve; });
    await page.route("**/api/games/dates?*", async route => { requested(); await gate; await route.fulfill({ json: { data: releaseDates(new URL(route.request().url()).searchParams.get("season") ?? "2024-25"), error: null } }); });
    await page.goto("/games?season=2024-25&date=2024-12-25"); await started;
    try {
      if (width < 640) await page.getByRole("button", { name: "Calendar", exact: true }).click();
      await expect(page.getByText(/NO GAMES (IN THIS|ON THIS)/)).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Date", exact: true })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Choose a game date" }).locator('[data-slot="skeleton"]').filter({ visible: true })).not.toHaveCount(0);
    } finally { release(); }
    await expect(page.getByRole("group", { name: "Date", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Expand .* game details$/ })).toHaveCount(10);
  });
}

test("existing palette Escape restoration survives closeout changes", async ({ page }) => {
  await fixtures(page); await page.goto("/games?season=2024-25&date=2024-12-25");
  const opener = page.getByRole("button", { name: "Find a page", exact: true });
  await opener.focus(); await page.keyboard.press("Enter");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape"); await expect(palette).toHaveCount(0); await expect(opener).toBeFocused();
});


for (const width of [390, 1440]) {
  test(`Games calendar retry preserves its loaded slate at ${width}px`, async ({ page }, info) => {
    await fixtures(page); await page.setViewportSize({ width, height: 900 });
    let dateRequests = 0;
    let slateRequests = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/games/2024-12-25") slateRequests++;
    });
    await page.route("**/api/games/dates?season=2024-25", async route => {
      dateRequests++;
      if (dateRequests <= 2) {
        await route.fulfill({ status: 503, json: { data: null, error: "Dates unavailable" } });
      } else {
        await gate;
        await route.fulfill({ json: { data: releaseDates("2024-25"), error: null } });
      }
    });
    await page.goto("/games?season=2024-25&date=2024-12-25");
    const games = page.getByRole("button", { name: /^Expand .* game details$/ });
    await expect(games).toHaveCount(10);
    if (width < 640) await page.getByRole("button", { name: "Calendar", exact: true }).click();
    const error = page.getByRole("alert").filter({ hasText: "FAILED TO LOAD DATES" });
    await expect(error).toBeVisible();
    await recordGeometry(info, "calendar-alerts", await page.getByRole("alert").evaluateAll(alerts =>
      alerts.map(el => ({ html: el.outerHTML, parent: el.parentElement?.tagName, inMain: !!el.closest("main") }))));
    await expect(page.getByRole("main").getByRole("alert").filter({ visible: true })).toHaveCount(1);
    expect(slateRequests).toBe(1);
    try {
      await error.getByRole("button", { name: "RETRY DATES", exact: true }).click();
      await expect(error).toHaveCount(0);
      await expect(games).toHaveCount(10);
      await expect(page.getByRole("group", { name: "Date", exact: true })).toHaveCount(0);
      await expect(page.getByText(/NO GAMES (IN THIS|ON THIS)/)).toHaveCount(0);
      expect(slateRequests).toBe(1);
    } finally { release(); }
    await expect(page.getByRole("group", { name: "Date", exact: true })).toBeVisible();
    await expect(games).toHaveCount(10);
    expect(dateRequests).toBe(3);
    expect(slateRequests).toBe(1);
  });
}
