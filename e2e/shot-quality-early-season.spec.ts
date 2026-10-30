import { expect, test } from "@playwright/test";
import type { ShotQualityResponse } from "../src/types";

const raw: ShotQualityResponse = {
  season: "2026-27", latestPublishedSeason: "2026-27", previousPublishedSeason: "2025-26", activeModel: "gbm-v1",
  cells: [{ cellX: 0, cellY: 0, zoneBasic: "Restricted Area", zoneRange: "Less Than 8 ft.", zoneArea: "Center(C)", fga: 2, fgm: 0, fg3a: 0, fg3m: 0, gbm: null, baseline: null }],
  meta: { cellCount: 1, totalFga: 2, publication: {
    source: "nba-stats-snapshot", generatedAt: "2026-10-22T12:00:00Z", checkedAt: null, updateStatus: "failed",
    firstGameDate: "2026-10-21", lastGameDate: "2026-10-21", gameCount: 1, sourceShotCount: 2, droppedShotCount: 0,
    models: { "gbm-v1": { ready: false, coveredCells: 0, totalCells: 1, trainingPeriod: null }, "baseline-zone-v1": { ready: false, coveredCells: 0, totalCells: 1, trainingPeriod: null } },
  } },
};

test("early raw shot locations render with model estimates unavailable and no GP gate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/shot-quality*", route => route.fulfill({ json: { data: raw, error: null } }));
  await page.route("**/api/season-readiness*", route => route.abort());
  await page.goto("/shot-quality?season=2026-27");
  await expect(page.getByText("Actual shot attempts", { exact: true })).toBeVisible();
  await expect(page.getByText("Model estimates are awaiting publication.", { exact: false })).toBeVisible();
  await expect(page.getByText("The latest update failed", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Last update check", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Snapshot generated Oct 22, 2026, 8:00 AM ET.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "EXPECTED eFG%", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "MODEL DIFFERENCE", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "2 attempts" })).toBeVisible();
  await expect(page.locator("#shot-quality-season")).toHaveValue("2026-27");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Explore opens the current shot season and its existing guide without refresh-status text", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T17:00:00Z"));
  const requests: string[] = [];
  const empty: ShotQualityResponse = { ...raw, latestPublishedSeason: "2025-26", cells: [], meta: {
    ...raw.meta, cellCount: 0, totalFga: 0, publication: { ...raw.meta.publication!, checkedAt: "2026-10-29T16:54:50.509Z" },
  } };
  await page.route("**/api/shot-quality*", route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    return route.fulfill({ json: { data: url.searchParams.get("season") === "2026-27" ? empty : { ...raw, season: "2025-26" }, error: null } });
  });
  await page.goto("/explore");
  await page.getByRole("link", { name: /Expected Shot Value/ }).click();
  await expect(page).toHaveURL(/\/shot-quality$/);
  await expect(page.locator("#shot-quality-season")).toHaveValue("2026-27");
  await expect(page.getByTestId("season-data-guide")).toBeVisible();
  await expect(page.getByRole("link", { name: /View published results.*2025-26/ })).toHaveAttribute("href", "/shot-quality?season=2025-26");
  await expect(page.getByText(/Last update check|The latest update failed|latest published shot grid/)).toHaveCount(0);
  expect(requests).toContain("/api/shot-quality?season=2026-27");
  expect(requests).not.toContain("/api/shot-quality");
  for (const mode of ["actual", "value", "diff"]) {
    await page.goto(`/shot-quality?mode=${mode}`);
    await expect(page.locator("#shot-quality-season")).toHaveValue("2026-27");
    await expect(page.getByTestId("season-data-guide")).toBeVisible();
    await expect(page.getByText(/Last update check|The latest update failed/)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`mode=${mode}`));
  }
});

test("historical map modes survive browser history", async ({ page }) => {
  const model = { pMake: .5, expectedEfg: .5, xpps: 1 };
  const historical: ShotQualityResponse = { ...raw, season: "2025-26", latestPublishedSeason: "2025-26",
    cells: raw.cells.map(cell => ({ ...cell, baseline: model, gbm: model })), meta: { cellCount: 1, totalFga: 2 } };
  await page.route("**/api/shot-quality*", route => route.fulfill({ json: { data: historical, error: null } }));
  await page.goto("/shot-quality?season=2025-26&mode=actual");
  const modes = page.getByRole("group", { name: "Map view", exact: true });
  await expect(page.getByText("Actual shot attempts", { exact: true })).toBeVisible();
  await modes.getByRole("button", { name: "EXPECTED eFG%", exact: true }).click();
  await expect(page).toHaveURL(/season=2025-26.*mode=value/);
  await expect(page.getByRole("group", { name: "Shot value model", exact: true })).toBeVisible();
  await modes.getByRole("button", { name: "MODEL DIFFERENCE", exact: true }).click();
  await expect(page).toHaveURL(/season=2025-26.*mode=diff/);
  await expect(page.getByRole("group", { name: /MODEL DIFFERENCE: half-court/ })).toBeVisible();
  await page.goBack();
  await expect(modes.getByRole("button", { name: "EXPECTED eFG%", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(modes.getByRole("button", { name: "SHOT ATTEMPTS", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#shot-quality-season")).toHaveValue("2025-26");
  await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
});

test("model choice shares URL and browser history while retaining the inspected cell", async ({ page }) => {
  const model = { pMake: .5, expectedEfg: .5, xpps: 1 };
  const response: ShotQualityResponse = { ...raw, season: "2025-26", latestPublishedSeason: "2025-26", cells: [
    { ...raw.cells[0], fga: 100, baseline: model, gbm: model },
    { ...raw.cells[0], cellX: 5, cellY: 5, fga: 100, baseline: model, gbm: null },
  ], meta: { cellCount: 2, totalFga: 200 } };
  await page.route("**/api/shot-quality*", route => route.fulfill({ json: { data: response, error: null } }));
  await page.goto("/shot-quality?season=2025-26");
  const court = page.getByRole("group", { name: /half-court expected-shot-value map/ });
  const panel = page.getByRole("status").filter({ hasText: "attempts at this location" });
  await court.focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel).toContainText("5.5 ft across, 5.5 ft upcourt");
  const controls = page.getByRole("group", { name: "Shot value model", exact: true });
  await controls.getByRole("button", { name: "Location model", exact: true }).click();
  await expect(page).toHaveURL(/model=gbm-v1/);
  await expect(panel).toContainText("5.5 ft across, 5.5 ft upcourt");
  await expect(panel).toContainText("Unavailable");
  await page.goBack();
  await expect(controls.getByRole("button", { name: "Zone average", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText("5.5 ft across, 5.5 ft upcourt");
});
