import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AnalysisResponse } from '../src/types';
import { buildSeasonReport } from '../src/lib/season-report';

type Season = AnalysisResponse['seasonWinRates'][number];
const completed: Season[] = Array.from({ length: 10 }, (_, index) => ({
  season: `${2015 + index}-${String(2016 + index).slice(-2)}`,
  homeGames: 1000, homeWins: index < 5 ? 700 : 550,
  homeBaselinePct: index < 5 ? 70 : 55,
  games: 500, restedTeamWins: index < 5 ? 360 : 300,
  winPct: index < 5 ? 72 : 60, isComplete: true,
  latestEvidenceDate: `${2016 + index}-04-15`,
}));
function partial(games = 0): Season {
  const restedTeamWins = games === 100 ? 60 : Math.floor(games * .6);
  return { season: '2025-26', homeGames: 200, homeWins: 100, homeBaselinePct: 50,
    games, restedTeamWins, winPct: games ? Math.round(restedTeamWins/games*1000)/10 : 0,
    isComplete: false, latestEvidenceDate: '2025-11-01' };
}
function evidence(rows: Season[]): AnalysisResponse {
  return {
    latestEvidenceDate: '2025-11-01',
    totalGames: 5000, overallWins: 3300, overallWinRate: 66,
    thresholds: [],
    homeAwayBreakdown: {
      homeTeamMoreRested: { games: 5000, restedTeamWins: 3300, winPct: 66 },
      awayTeamMoreRested: { games: 0, restedTeamWins: 0, winPct: 0 },
    },
    venueBaseline: { games: 10000, homeWins: 6250, homeWinPct: 62.5, roadWinPct: 37.5 },
    seasonWinRates: rows,
  };
}
async function mockStudy(page: Page, rows = [...completed, partial()]) {
  await page.route('**/api/analysis*', route => route.fulfill({ json: { data: evidence(rows), error: null } }));
  await page.goto('/home-court');
  await expect(page.getByRole('heading', { name: 'Home win rate by season', exact: true })).toBeVisible();
}

test('study excludes an ongoing season from endpoint summaries and exposes exact season lookup', async ({ page }) => {
  await mockStudy(page);
  const finding = page.getByRole('region', { name: 'Home teams win less often than they used to.' });
  await expect(finding).toContainText('70.0%');
  await expect(finding).toContainText('55.0%');
  await expect(finding).toContainText('2024-25');
  await expect(finding).not.toContainText('2025-26');
  await expect(page.getByRole('combobox', { name: 'Inspect season' })).toHaveValue('2025-26');
  const inspection = page.locator('[aria-live="polite"]');
  await expect(inspection).toContainText('Season to date');
  await expect(inspection).toContainText('50.0%');
  await expect(inspection.getByText('Too early', { exact: true })).toHaveCount(2);
  await expect(inspection.getByText('0.0%', { exact: true })).toHaveCount(0);
  await page.locator('summary').filter({ hasText: 'View season data' }).click();
  const table = page.getByRole('region', { name: 'Home-court season data' });
  await expect(table.getByRole('row')).toHaveCount(12);
  await expect(table.getByRole('row').nth(1)).toContainText('2025-26');
  await expect(table.getByRole('row').nth(1)).toContainText('100 / 200');
  await expect(table.getByRole('link', { name: '2024-25', exact: true })).toHaveAttribute('href', '/season?season=2024-25');
});

for (const games of [99, 100]) {
  test(`rested-home display gate at ${games} games`, async ({ page }) => {
    await mockStudy(page, [...completed, partial(games)]);
    const inspection = page.locator('[aria-live="polite"]');
    if (games === 99) {
      await expect(inspection.getByText('Too early', { exact: true })).toHaveCount(2);
      await expect(inspection).not.toContainText('59.6%');
    } else {
      await expect(inspection).toContainText('60.0%');
      await expect(inspection).toContainText('+10.0 pp');
      await expect(inspection.getByText('Too early', { exact: true })).toHaveCount(0);
    }
  });
}

test('season report shows its home baseline without historical API or rested-home games', async ({ page }) => {
  const report = { ...buildSeasonReport('2025-26', []), basis: 'played', scheduledGames: 1230,
    completedGames: 10, latestFinalDate: '2025-10-24', seasonComplete: false,
    homeRate: { games: 10, homeWins: 7, winPct: 70 } };
  await page.route('**/api/season-report?*', route => route.fulfill({ json: { data: report, error: null } }));
  await page.route('**/api/analysis*', route => route.fulfill({ status: 503, json: { data: null, error: 'Unavailable' } }));
  await page.goto('/season?season=2025-26');
  const result = page.getByRole('region', { name: 'Home court and rest' });
  await expect(result).toContainText('70.0%');
  await expect(result).toContainText('7 wins / 10 eligible games');
  await expect(result).toContainText('SEASON TO DATE');
  await expect(result.getByText('Too early', { exact: true })).toHaveCount(2);
  await expect(result.getByRole('link', { name: 'See home-court history' })).toHaveAttribute('href', '/home-court');
});

test('study handles stale response shape without rendering a false zero', async ({ page }) => {
  const old = evidence(completed);
  const legacy = { ...old, seasonWinRates: old.seasonWinRates.map(({ season, games, restedTeamWins, winPct, homeBaselinePct }) => ({ season, games, restedTeamWins, winPct, homeBaselinePct })) };
  await page.route('**/api/analysis*', route => route.fulfill({ json: { data: legacy, error: null } }));
  await page.goto('/home-court');
  await expect(page.getByRole('status')).toContainText('unavailable');
  await expect(page.locator('body')).not.toContainText('NaN');
});

test('mobile chart and expanded table stay within the page and support keyboard inspection', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockStudy(page);
  const select = page.getByRole('combobox', { name: 'Inspect season' });
  const chart = page.getByTestId('home-court-chart');
  await chart.scrollIntoViewIfNeeded();
  const firstPoint = await chart.locator('g[aria-hidden="true"] > circle').first().boundingBox();
  expect(firstPoint).not.toBeNull();
  await page.mouse.click(firstPoint!.x + firstPoint!.width / 2, firstPoint!.y + firstPoint!.height / 2);
  await expect(select).toHaveValue('2015-16');
  const chartButton = chart.getByRole('button');
  await chartButton.focus();
  await page.keyboard.press('End');
  await expect(select).toHaveValue('2025-26');
  await page.keyboard.press('ArrowLeft');
  await expect(select).toHaveValue('2024-25');
  await select.selectOption('2015-16');
  await expect(page.locator('[aria-live="polite"]')).toContainText('70.0%');
  await select.focus();
  await expect(select).toBeFocused();
  await page.locator('summary').filter({ hasText: 'View season data' }).focus();
  await page.keyboard.press('Enter');
  const table = page.getByRole('region', { name: 'Home-court season data' });
  await expect(table).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await table.focus();
  await page.keyboard.press('ArrowRight');
  expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('home-court-mobile.png'), fullPage: true });
});
