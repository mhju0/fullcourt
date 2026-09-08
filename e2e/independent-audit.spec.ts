import { expect, test } from "@playwright/test";

test("schedule facts distinguish four nights and altitude carryover", async ({ request, page }) => {
  const response = await request.get("/api/games/2026-04-12");
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  const detroit = data.find((game: { awayTeam: { abbreviation: string } }) => game.awayTeam.abbreviation === "DET");
  expect(detroit.awayFatigue.is3In4).toBe(false);
  const prior = await Promise.all(["2026-04-09", "2026-04-10", "2026-04-11"].map(async date => {
    const result = await request.get(`/api/games/${date}`);
    expect(result.ok()).toBeTruthy();
    return (await result.json()).data;
  }));
  let denseTeams = 0;
  for (const game of data) {
    for (const side of ["home", "away"] as const) {
      const teamId = game[`${side}Team`].id;
      const count = 1 + prior.flat().filter(g => g.homeTeam.id === teamId || g.awayTeam.id === teamId).length;
      const dense = count >= 3;
      if (dense) denseTeams++;
      expect(game[`${side}Fatigue`].is3In4, `team ${teamId}: ${count} games in four nights`).toBe(dense);
    }
  }
  expect(denseTeams).toBeGreaterThan(0);
  const oklahoma = data.find((game: { homeTeam: { abbreviation: string } }) => game.homeTeam.abbreviation === "OKC");
  expect(oklahoma.homeFatigue.altitudePenalty).toBe(true);
  expect(oklahoma.homeFatigue.altitudeArenaLabel).toBeNull();
  await page.goto("/games?season=2025-26&date=2026-04-12");
  await expect(page.getByText(/OKC.*after an altitude trip/)).toBeVisible();
  await expect(page.getByText(/DET 3rd game in 4 nights/)).toHaveCount(0);
});

test("mobile games keep season, month and date visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games?season=2025-26&date=2026-04-12");
  const first = page.getByRole("button", { name: "Expand game details" }).first();
  await expect(first).toBeInViewport({ ratio: 1 });
  const row = await first.boundingBox();
  const dock = await page.getByRole("navigation", { name: "Bottom navigation" }).boundingBox();
  expect(row!.y + row!.height).toBeLessThanOrEqual(dock!.y);
  await expect(page.getByLabel("SEASON", { exact: true })).toBeVisible();
  const april = page.getByRole("button", { name: "APR", exact: true });
  await expect(april).toHaveAttribute("aria-pressed", "true");
  await expect(april).toBeInViewport();
  await page.getByRole("button", { name: "MAR", exact: true }).click();
  await expect(page.getByRole("button", { name: "MAR", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("mobile shooting exposes a player before optional definitions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shooting");
  const first = page.getByTestId("player-row").first();
  await expect(first).toBeInViewport({ ratio: 1 });
  const row = await first.boundingBox();
  const dock = await page.getByRole("navigation", { name: "Bottom navigation" }).boundingBox();
  expect(row!.y + row!.height).toBeLessThanOrEqual(dock!.y);
  await page.getByRole("searchbox", { name: "Search player" }).fill("LeBron");
  await page.getByTestId("player-row").first().click();
  await expect(page.getByTestId("career-row")).toBeVisible();
  await page.getByText("Rest definitions and uncertainty", { exact: true }).click();
  await expect(page.getByText(/not a 95% significance threshold/)).toBeVisible();
});

test("homepage example opens the matching game and builder walkthrough is reachable", async ({ page }) => {
  await page.goto("/");
  const example = page.getByRole("link", { name: "Inspect this matchup" });
  await expect(example).toBeVisible();
  await example.click();
  await expect(page.getByRole("button", { name: "Collapse game details" })).toBeVisible();
  await page.getByRole("navigation", { name: "Footer", exact: true }).getByRole("link", { name: "How it was built" }).click();
  await expect(page.getByRole("heading", { name: "Three implementation decisions" })).toBeVisible();
});

test("rare officiating categories stay accessible and shareable", async ({ page }) => {
  await page.goto("/officiating");
  await expect(page.getByRole("button", { name: /^Turnover: Palming/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^All \d+ call types/ }).click();
  await page.getByRole("button", { name: /^Turnover: Palming/ }).click();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("button", { name: /Turnover: Palming/ })).toHaveAttribute("aria-pressed", "true");
});
