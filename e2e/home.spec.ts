import { expect, test } from "@playwright/test";

test.describe("Home page", () => {
  test("leads with the thesis, and loads the season control and month tabs", async ({ page }) => {
    await page.goto("/");

    // The root's largest type states what the site measures, not the format it shows it in.
    // It read "Games" until 2026-08-11, which named the table rather than the subject.
    await expect(
      page.getByRole("heading", { name: "What the schedule does to a game", exact: true })
    ).toBeVisible();

    // The headline figure is read from rest-split-facts, never typed into the page.
    await expect(page.getByText(/is how often the more-rested team wins/)).toBeVisible();

    await expect(page.getByLabel("Season")).toBeVisible();
    await expect(page.getByRole("button", { name: /^OCT$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^DEC$/ })).toBeVisible();
  });

  // The old /upcoming route was folded into this page as its UPCOMING view. Both halves
  // are asserted: the redirect (so old links still land) and the toggle actually swapping
  // the body (so a broken branch can't pass by leaving the date browser mounted).
  test("absorbs the retired /upcoming route as a view toggle", async ({ page }) => {
    await page.goto("/upcoming");
    await expect(page).toHaveURL(/\/$/);

    const views = page.getByRole("group", { name: "Games view" });
    await expect(page.getByRole("button", { name: "Previous day" })).toBeVisible();

    await views.getByRole("button", { name: "UPCOMING" }).click();
    await expect(page.getByRole("button", { name: "Previous day" })).toBeHidden();

    await views.getByRole("button", { name: "BY DATE" }).click();
    await expect(page.getByRole("button", { name: "Previous day" })).toBeVisible();
  });

  test("previous-day control moves the selected date display backward", async ({ page }) => {
    await page.goto("/");

    const display = page.getByTestId("selected-date-display");
    await expect(display).not.toHaveText("PICK A DATE", { timeout: 60_000 });

    const before = await display.textContent();
    expect(before).toBeTruthy();

    await page.getByRole("button", { name: "Previous day" }).click();

    const after = await display.textContent();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  test("Christmas 2024 slate shows matchup cards with team abbreviations and fatigue decimals", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByLabel("Season").selectOption("2024-25");
    await page.getByRole("button", { name: /^DEC$/ }).click();

    const dec25 = page.getByRole("button", { name: /December 25, 2024/ });
    await expect(dec25).toBeVisible({ timeout: 60_000 });
    await dec25.click();

    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/games/2024-12-25") && res.status() === 200
    );

    // MatchupCard's toggle row is role="button" with an "Expand/Collapse game
    // details" aria-label (src/components/matchup-card.tsx:616-619) — there's
    // no combined "TEAM @ TEAM" text node in the current markup.
    const firstCard = page
      .getByRole("button", { name: /Expand game details|Collapse game details/ })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });

    const abbreviation = firstCard.locator("span").filter({ hasText: /^[A-Z]{3}$/ }).first();
    await expect(abbreviation).toBeVisible();

    const fatigueDecimal = firstCard.locator(".tabular-nums").filter({ hasText: /\d+\.\d/ }).first();
    await expect(fatigueDecimal).toBeVisible();
  });

  // The month tab is derived from the selected date rather than stored beside it, so
  // stepping across a boundary moves the tab by definition. The version this replaced
  // needed a setState-during-render block plus a ref handshake to achieve the same thing.
  test("crossing a month boundary with the arrows moves the month tab", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Season").selectOption("2024-25");
    await page.getByRole("button", { name: /^DEC$/ }).click();

    const display = page.getByTestId("selected-date-display");
    await expect(display).toContainText("DECEMBER", { timeout: 60_000 });

    // Land on the last December day with games, then step past it.
    await page.locator('button[aria-label*="December"]').last().click();
    await expect(display).toContainText("DECEMBER");

    const next = page.getByRole("button", { name: "Next day" });
    for (let i = 0; i < 5; i++) {
      await next.click();
      const text = await display.textContent();
      if (text && !text.includes("DECEMBER")) break;
    }

    await expect(display).toContainText("JANUARY");
    await expect(page.getByRole("button", { name: /^JAN$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^DEC$/ })).toHaveAttribute("aria-pressed", "false");
  });

  test("previous day from an early season date can reach a day with no games", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Season").selectOption("2024-25");

    // One dates request per season, with no `month` param — a month click now resolves
    // from the in-memory day list instead of a round trip. Asserted negatively too, so
    // a regression back to month-scoped fetching fails here rather than passing quietly.
    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/games/dates") &&
        res.url().includes("season=2024-25") &&
        !res.url().includes("month=") &&
        res.status() === 200
    );

    await page.getByRole("button", { name: /^OCT$/ }).click();

    const firstDayWithGames = page.locator('button[aria-label*="games"]').first();
    await expect(firstDayWithGames).toBeVisible({ timeout: 60_000 });
    await firstDayWithGames.click();

    await page.waitForResponse(
      (res) => res.url().includes("/api/games/20") && res.status() === 200
    );

    const prev = page.getByRole("button", { name: "Previous day" });
    const empty = page.getByText("NO GAMES SCHEDULED");
    for (let i = 0; i < 45; i++) {
      await prev.click();
      try {
        await expect(empty).toBeVisible({ timeout: 1_000 });
        return;
      } catch {
        // still on a day with games — keep stepping back
      }
    }

    throw new Error("Expected to reach a date with no games within 45 previous-day steps");
  });
});
