import { expect, test, type Page, type Route } from "@playwright/test";

const method = { knownWinnerGames: 0, correct: 0, accuracy: 0 };
const playoffResponse = (season: string, latestPublishedSeason = "2025-26") => ({
  season,
  latestPublishedSeason,
  rounds: [],
  summary: { fullInsample: method, walkForwardOos: method },
});

const shotCell = {
  cellX: 0,
  cellY: 0,
  zoneBasic: "Restricted Area",
  zoneRange: "Less Than 8 ft.",
  zoneArea: "Center(C)",
  fga: 100,
  fgm: 60,
  fg3a: 0,
  fg3m: 0,
  gbm: { pMake: 0.6, expectedEfg: 0.6, xpps: 1.2 },
  baseline: { pMake: 0.58, expectedEfg: 0.58, xpps: 1.16 },
};
const shotResponse = (season: string, latestPublishedSeason = "2025-26") => ({
  season,
  latestPublishedSeason,
  activeModel: "gbm-v1",
  cells: [shotCell],
  meta: { cellCount: 1, totalFga: 100 },
});
const fulfill = (route: Route, data: unknown) => route.fulfill({ json: { data, error: null } });

async function mockPlayoffs(page: Page) {
  await page.route("**/api/playoffs**", (route) => {
    const season = new URL(route.request().url()).searchParams.get("season");
    if (season === "2023-24") {
      return route.fulfill({ status: 500, json: { data: null, error: "Bracket refresh is temporarily unavailable." } });
    }
    return fulfill(route, playoffResponse(season ?? "2024-25"));
  });
}

async function mockShotQuality(page: Page) {
  await page.route("**/api/shot-quality**", (route) => {
    const season = new URL(route.request().url()).searchParams.get("season");
    if (season === "2023-24") {
      return route.fulfill({ status: 500, json: { data: null, error: "Shot publication is temporarily unavailable." } });
    }
    return fulfill(route, shotResponse(season ?? "2024-25"));
  });
}

test("research defaults come from publications and Playoff Rest URL history survives a failed change", async ({ page }) => {
  await mockPlayoffs(page);
  await page.goto("/playoffs");
  const season = page.getByLabel("SEASON", { exact: true });
  await expect(season).toHaveValue("2024-25");

  await season.selectOption("2023-24");
  await expect(page).toHaveURL(/season=2023-24/);
  await expect(page.getByText("FAILED TO LOAD THE BRACKET")).toBeVisible();
  await expect(page.getByText("NO PUBLISHED BRACKET FOR THIS SEASON")).toHaveCount(0);

  await page.goBack();
  await expect(season).toHaveValue("2024-25");
  await expect(page.getByText("NO PUBLISHED BRACKET FOR THIS SEASON")).toBeVisible();
});

test("October rollover keeps publication defaults and explicit empty seasons return to latest results", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-01T16:00:00Z"));
  await page.route("**/api/playoffs**", (route) => {
    const requested = new URL(route.request().url()).searchParams.get("season");
    return fulfill(route, playoffResponse(requested ?? "2024-25", "2024-25"));
  });
  await page.goto("/playoffs");
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
  await page.goto("/playoffs?season=2025-26");
  await expect(page.getByText("The 2025-26 playoffs have not been published yet.")).toBeVisible();
  await page.getByRole("button", { name: "View latest results · 2024-25" }).click();
  await expect(page).toHaveURL(/season=2024-25/);

  await page.unroute("**/api/playoffs**");
  await page.route("**/api/shot-quality**", (route) => {
    const requested = new URL(route.request().url()).searchParams.get("season");
    const response = shotResponse(requested ?? "2024-25", "2024-25");
    if (requested === "2025-26") response.cells = [];
    return fulfill(route, response);
  });
  await page.goto("/shot-quality");
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
  await page.goto("/shot-quality?season=2025-26");
  await expect(page.getByText("The 2025-26 expected shot value surface has not been published yet.")).toBeVisible();
  await page.getByRole("button", { name: "View latest results · 2024-25" }).click();
  await expect(page).toHaveURL(/season=2024-25/);
});

test("Shot Value restores season, map mode and comparison and copies their context", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockShotQuality(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shot-quality?season=2024-25&mode=diff");
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
  await expect(page.getByRole("button", { name: "MODEL DIFFERENCE" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "EXPECTED eFG%" }).click();
  await page.getByRole("button", { name: "Compare models" }).click();
  await expect(page).toHaveURL(/compare=1/);
  await page.getByRole("button", { name: "Copy this view" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("2024-25 Expected Shot Value");
  expect(copied).toContain("expected effective field-goal percentage");
  expect(copied).toContain("not guaranteed outcomes");
  expect(copied).toContain("season=2024-25");
  expect(copied).toContain("compare=1");

  await page.goBack();
  await expect(page.getByRole("button", { name: "Compare models" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "MODEL DIFFERENCE" })).toHaveAttribute("aria-pressed", "true");
});

test("unsupported Shot Value state recovers honestly and a failed season never relabels stale data", async ({ page }) => {
  await mockShotQuality(page);
  await page.goto("/shot-quality?season=1899-00&mode=heat");
  await expect(page.getByText(/1899-00 is unavailable/)).toBeVisible();
  await expect(page.getByText(/heat is not a supported map view/)).toBeVisible();
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");

  await page.getByLabel("SEASON", { exact: true }).selectOption("2023-24");
  await expect(page.getByText("FAILED TO LOAD SHOT DATA")).toBeVisible();
  await expect(page.getByText(/2024-25 · 1 CELLS/)).toHaveCount(0);
});

test("copy failure exposes selectable canonical share text", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await mockPlayoffs(page);
  await page.goto("/playoffs");
  await page.getByRole("button", { name: "Copy this view" }).click();
  await expect(page.getByText("Copy unavailable. Select the text below.")).toBeVisible();
  await expect(page.getByLabel("Share text")).toHaveValue(/season=2024-25/);
});

test("player result count uses singular wording", async ({ page }) => {
  await page.goto("/shooting?q=jokic");
  await expect(page.getByText(/1 PLAYER IN 2025-26/i)).toBeVisible();
});

test("Games has a route title and each matchup control names teams and date", async ({ page }) => {
  await page.goto("/games?season=2024-25&date=2024-12-25");
  await expect(page).toHaveTitle("Games · FullCourt");
  const controls = page.getByRole("button", { name: /^Expand .* at .* on 2024-12-25 game details$/ });
  await expect(controls.first()).toBeVisible({ timeout: 60_000 });
  expect(await controls.count()).toBeGreaterThan(1);
  await controls.first().focus();
  await page.keyboard.press("Enter");
  const collapse = page.getByRole("button", { name: /^Collapse .* at .* on 2024-12-25 game details$/ });
  await expect(collapse).toBeFocused();
  await page.keyboard.press("Space");
  await expect(controls.first()).toBeFocused();
});
