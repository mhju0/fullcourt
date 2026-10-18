import { expect, test } from "@playwright/test";

// The BY TEAM view: one team's season, with the rest gap turned to that team's side.
test.describe("Games by team", () => {
  test("the view tabs switch between the slate and a team's season, keeping the season", async ({ page }) => {
    await page.goto("/games?season=2024-25");
    const tabs = page.getByRole("navigation", { name: "Games view" });
    await expect(tabs.getByRole("link", { name: "BY DATE" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "BY TEAM" }).click();
    await expect(page).toHaveURL(/\/games\/team\?season=2024-25/);
    await expect(page.getByRole("heading", { level: 1, name: "Games" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "BY TEAM" })).toHaveAttribute("aria-current", "page");
    // The GAMES tab stays lit: this is the same page seen another way.
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "GAMES" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Choose a team", { exact: true }).last()).toBeVisible();
  });

  test("lists the season in columns, with the gap signed from the team's side as the board has it", async ({ page }) => {
    await page.goto("/games/team?season=2024-25");
    await page.getByLabel("TEAM", { exact: true }).selectOption("HOU");
    await expect(page).toHaveURL(/team=HOU/);
    const rows = page.getByTestId("team-game-row");
    await expect(rows).toHaveCount(82, { timeout: 60_000 });
    const headers = await page.locator("table.fc-table th").allInnerTexts();
    expect(headers.map((h) => h.split("\n")[0].trim())).toEqual(["#", "DATE", "OPPONENT", "GAME", "REST GAP"]);
    await expect(page.getByText("Tip-off times are Eastern Time (ET). RA = rest advantage, in fatigue-score points.")).toBeVisible();
    expect(await page.locator("table.fc-table thead th").evaluateAll(nodes => nodes.every(node => getComputedStyle(node).whiteSpace === "nowrap"))).toBe(true);
    await expect(rows.first()).toContainText("Charlotte Hornets");

    // Take the first game with a real gap and read the same game off the board's API.
    const schedule = (await (await page.request.get("/api/games/team?season=2024-25&team=HOU")).json()).data as {
      id: number; date: string; isHome: boolean; restAdvantage: { advantageTeam: string } | null
    }[];
    const index = schedule.findIndex((g) => g.restAdvantage && g.restAdvantage.advantageTeam !== "neutral");
    const game = schedule[index];
    const board = (await (await page.request.get(`/api/games/${game.date}`)).json()).data as {
      id: number; homeTeam: { abbreviation: string }; restAdvantage: { advantageTeam: string }
    }[];
    const same = board.find((g) => g.id === game.id)!;
    const houIsHome = same.homeTeam.abbreviation === "HOU";
    expect(houIsHome).toBe(game.isHome);
    const houRested = same.restAdvantage.advantageTeam === (houIsHome ? "home" : "away");
    const cell = rows.nth(index).locator("td").last();
    await expect(cell).toContainText(houRested ? /^\+\d/ : /^−\d/);
  });

  test("a phone keeps the Game column beside date, opponent and gap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/games/team?season=2024-25&team=HOU");
    const first = page.getByTestId("team-game-row").first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    await expect(first.locator("td").nth(0)).toBeHidden();
    await expect(first.locator("td").nth(1)).toHaveText(/^Oct \d+$/, { useInnerText: true });
    await expect(first.locator("td").nth(2)).toBeVisible();
    await expect(first.locator("td").nth(3)).toBeVisible();
    await expect(first.locator("td").nth(3)).toHaveText(/^[WL] \d+–\d+$/);
    await expect(first.getByTestId("team-game-link")).toHaveAccessibleName(/Charlotte Hornets/);
    await expect(first.getByTestId("team-game-link")).toHaveText("CHA", { useInnerText: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const table = await page.locator("table.fc-table").evaluate((t) => t.scrollWidth <= t.parentElement!.clientWidth);
    expect(table).toBe(true);
  });

  test("a row opens its game on the board, expanded, and Back returns to the team's season", async ({ page }) => {
    await page.goto("/games/team?season=2024-25&team=HOU");
    const rows = page.getByTestId("team-game-row");
    await expect(rows).toHaveCount(82, { timeout: 60_000 });
    const row = rows.nth(20);
    const href = await row.getByTestId("team-game-link").getAttribute("href");
    const [, date, id] = href!.match(/date=(\d{4}-\d{2}-\d{2})&game=(\d+)#game-\2$/)!;
    // A click on the date, away from the link, still follows it: the whole row is the target.
    await row.locator("td").nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/games\\?season=2024-25&date=${date}&game=${id}#game-${id}$`));
    const open = page.locator('[aria-expanded="true"]');
    await expect(open).toHaveCount(1, { timeout: 60_000 });
    await expect(open).toBeInViewport();
    await page.goBack();
    await expect(page).toHaveURL(/\/games\/team\?/);
    expect(new URL(page.url()).searchParams.get("team")).toBe("HOU");
    await expect(rows).toHaveCount(82);
  });

  test("the columns share the width instead of OPPONENT taking it all", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/games/team?season=2024-25&team=HOU");
    const first = page.getByTestId("team-game-row").first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    const widths = await first.locator("td").evaluateAll((tds) => tds.map((td) => td.getBoundingClientRect().width));
    const total = widths.reduce((sum, w) => sum + w, 0);
    // OPPONENT took 892 of 1232px when every other column shrank to its content.
    expect(widths[2] / total).toBeLessThan(0.45);
    for (const w of [widths[1], widths[3], widths[4]]) expect(w / total).toBeGreaterThan(0.12);
  });

  test("a season still short of its two NBA Cup games shows them as TBD rows numbered into the season", async ({ page }) => {
    await page.goto("/games/team?season=2026-27&team=HOU");
    await expect(page.getByTestId("team-game-row")).toHaveCount(80, { timeout: 60_000 });
    const cup = page.getByTestId("cup-placeholder-row");
    await expect(cup).toHaveCount(2);
    await expect(cup.first()).toContainText("NBA CUP GAME · TBD");
    await expect(cup.first()).toContainText("Early Dec");
    // The last real game is game 82, not 80.
    await expect(page.getByTestId("team-game-row").last().locator("td").first()).toHaveText("82");
  });
});

// The day arrows sit on the DATE label's line, clear of its rule, and stay put as the date changes.
test("the desktop day arrows sit above the date rule and do not move", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/games?season=2024-25&date=2025-01-15");
  const next = page.getByRole("button", { name: "Next day" });
  await expect(page.getByTestId("selected-date-display")).toContainText("JANUARY 15, 2025", { timeout: 60_000 });
  const row = next.locator("xpath=../..");
  const ruleTop = await row.evaluate((el) => el.getBoundingClientRect().bottom - parseFloat(getComputedStyle(el).borderBottomWidth));
  const before = (await next.boundingBox())!;
  expect(before.y + before.height).toBeLessThanOrEqual(ruleTop - 4);
  await next.click();
  await expect(page.getByTestId("selected-date-display")).toContainText("JANUARY 16, 2025");
  const after = (await next.boundingBox())!;
  expect([after.x, after.y]).toEqual([before.x, before.y]);
});
