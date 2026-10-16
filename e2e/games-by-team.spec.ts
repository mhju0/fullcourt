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
    expect(headers.map((h) => h.split("\n")[0].trim())).toEqual(["G", "DATE", "TIME", "OPPONENT", "REST ADVANTAGE"]);
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

  test("a phone shows date, opponent and gap, with no weekday, time or game number", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/games/team?season=2024-25&team=HOU");
    const first = page.getByTestId("team-game-row").first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    await expect(first.locator("td").nth(0)).toBeHidden();
    await expect(first.locator("td").nth(2)).toBeHidden();
    await expect(first.locator("td").nth(1)).toHaveText(/^Oct \d+/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const table = await page.locator("table.fc-table").evaluate((t) => t.scrollWidth <= t.parentElement!.clientWidth);
    expect(table).toBe(true);
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
