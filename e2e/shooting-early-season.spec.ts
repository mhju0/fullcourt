import { expect, test, type Page } from "@playwright/test";
import { S, type PlayerRestPayload } from "../src/lib/player-rest";

async function currentSnapshot(page: Page) {
  const response = await page.request.get("/api/player-rest");
  expect(response.ok()).toBe(true);
  const payload = await response.json() as PlayerRestPayload;
  const year = Number(payload.publication!.season!.slice(0, 4));
  const rows = payload.seasons.filter(row => row[S.YEAR] === year);
  expect(payload.publication!.observedGames).toBeGreaterThan(0);
  expect(payload.publication!.missingGameIds).toEqual([]);
  expect(rows.length).toBeGreaterThan(0);
  return { payload, year, rows };
}

for (const width of [1440, 390]) {
  test(`observed current shooting rows and empty rest arms remain readable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { payload, year, rows } = await currentSnapshot(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/shooting");
    await expect(page.locator("#pr-season")).toHaveValue(String(year));
    await expect(page.locator("#pr-volume")).toHaveValue("0");
    await expect(page.getByTestId("player-row")).toHaveCount(rows.length);
    await expect(page.locator("main")).toContainText(`Observed through ${payload.publication!.through}`);
    await expect(page.locator("main")).toContainText(`${payload.publication!.observedGames}/${payload.publication!.expectedGames} completed games covered`);

    const first = [...rows].sort((a, b) => b[S.FGA] - a[S.FGA])[0];
    const rendered = page.getByTestId("player-row").first();
    await expect(rendered).toContainText(payload.names[first[S.PLAYER]]);
    await expect(rendered).toContainText(`${first[S.GAMES]} games`);
    await expect(rendered).toContainText(`${first[S.FGA].toLocaleString()} att.`);
    await expect(rendered).toContainText(`${(50 * first[S.EFG_NUMERATOR] / first[S.FGA]).toFixed(1)}% eFG`);
    for (const [column, arm] of [[1, S.NO_REST_FGA], [2, S.RESTED_FGA]]) {
      if (first[arm] === 0) await expect(rendered.locator("td").nth(column)).toHaveText("—");
    }
    const expectedMissing = rows.filter(row => !row[S.NO_REST_FGA] || !row[S.RESTED_FGA]).length;
    await expect(page.getByTestId("player-row").locator("td:last-child").filter({ hasText: /^—$/ })).toHaveCount(expectedMissing);
    await rendered.getByRole("button").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("career-row")).toContainText("Observed season");
    await expect(page.locator("main")).toContainText("No cross-provider player identity has been inferred");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    info.annotations.push({ type: "observed", description: `${rows.length} player rows; ${rows.length - expectedMissing} formed rest contrasts; through ${payload.publication!.through}` });
    await page.screenshot({ path: info.outputPath(`shooting-observed-${width}.png`) });
  });
}

test("an explicit volume filter is retained and historical career rows remain available", async ({ page }) => {
  const { payload, year, rows } = await currentSnapshot(page);
  await page.goto(`/shooting?year=${year}&volume=300`);
  await expect(page.locator("#pr-volume")).toHaveValue("300");
  const qualifying = rows.filter(row => row[S.FGA] >= 300);
  await expect(page.getByTestId("player-row")).toHaveCount(qualifying.length);
  if (!qualifying.length) await expect(page.getByRole("status", { name: "" }).filter({ hasText: "No players match these filters" })).toBeVisible();
  await page.goto("/shooting?year=career&volume=0");
  await expect(page.locator("#pr-season")).toHaveValue("career");
  const currentPlayers = new Set(payload.seasonOnlyPlayers ?? []);
  const historicalPlayers = new Set(payload.seasons.filter(row => !currentPlayers.has(row[S.PLAYER])).map(row => row[S.PLAYER]));
  await expect(page.getByTestId("player-row")).toHaveCount(historicalPlayers.size);
  await expect(page.getByTestId("season-data-guide")).toHaveCount(0);
  await page.getByTestId("player-row").first().getByRole("button").click();
  await expect(page.getByTestId("career-row")).toBeVisible();
  await expect(page.getByTestId("season-row").first()).not.toContainText(payload.publication!.season!);
});
