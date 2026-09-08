import { expect, test } from "@playwright/test";

test.describe("Rest-focused front door", () => {
  test("keeps the main finding and the routes into its evidence", async ({ page }) => {
    await page.goto("/");
    const home = page.getByTestId("home-findings");
    await expect(home.getByRole("heading", { level: 1, name: "Rest is a stat" })).toBeVisible();
    await expect(home.getByRole("link", { name: "Find a game" })).toHaveAttribute("href", "/games");
    await expect(home.getByRole("link", { name: "Read the model results" })).toHaveAttribute("href", "/analysis");
    await expect(home.getByRole("link", { name: "Compare team schedules" })).toHaveAttribute("href", "/schedule");
    await expect(home.getByRole("link", { name: "Look up a player" })).toHaveAttribute("href", "/shooting");
    await expect(home).toContainText("not a causal estimate");
    await expect(home.getByRole("heading", { name: "What the score is made of" })).toHaveCount(0);
    await expect(home.getByRole("link", { name: "Officiating", exact: true })).toHaveCount(0);
  });

  test("headline rates and samples agree with Model Results", async ({ page, request }) => {
    const response = await request.get("/api/analysis");
    expect(response.ok()).toBe(true);
    const { data } = await response.json();
    const widest = data.thresholds.find((row: { threshold: number }) => row.threshold === 7);
    await page.goto("/");
    const home = page.getByTestId("home-findings");
    await expect(home).toContainText(`${widest.games.toLocaleString()} games`);
    await expect(home).toContainText(`${widest.winPct.toFixed(1)}%`);
    await expect(home).toContainText(`${data.venueBaseline.homeWinPct.toFixed(1)}%`);
    await expect(home).toContainText(`Baseline: ${data.venueBaseline.games.toLocaleString()} games`);
  });

  test("the hero entrance stays brief and lower content needs no scroll trigger", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const motion = await page.getByTestId("home-findings").evaluate((root) => [...root.querySelectorAll("*")].filter((el) => getComputedStyle(el).animationName !== "none").map((el) => ({
      tag: el.tagName,
      duration: parseFloat(getComputedStyle(el).animationDuration),
      delay: parseFloat(getComputedStyle(el).animationDelay),
    })));
    expect(motion).toHaveLength(1);
    expect(motion[0].tag).toBe("HEADER");
    expect(motion[0].duration + motion[0].delay).toBeLessThanOrEqual(.6);
    const hidden = await page.getByTestId("home-findings").locator("section, aside").evaluateAll((els) => els.some((el) => getComputedStyle(el).opacity !== "1"));
    expect(hidden).toBe(false);
  });

  test("reduced motion leaves every finding visible without an entrance", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const root = page.getByTestId("home-findings");
    const animations = await root.evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(animations).toBe(0);
    await expect(root.getByRole("heading", { name: "Rest is a stat" })).toBeVisible();
  });

  test("research and the author introduction have their own working destinations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-findings").getByRole("link", { name: "Explore the research" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole("heading", { name: "Explore", level: 1 })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: /Officiating/ })).toHaveAttribute("href", "/officiating");
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "About FullCourt" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Created by Michael Ju" })).toBeVisible();
    await expect(page.locator("footer")).not.toContainText("RENDERED:");
  });

  test("the primary action opens Games", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Find a game", exact: true }).click();
    await expect(page).toHaveURL(/\/games(?:\?|$)/);
    await expect(page.getByRole("heading", { level: 1, name: "Games" })).toBeVisible();
  });

  for (const width of [1280, 390, 375]) {
    test(`findings fit at ${width}px without sideways scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      expect(fits).toBe(true);
      const outside = await page.getByTestId("home-findings").locator("h1, h2, p, a, dt, dd").evaluateAll((els) => els.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map((el) => el.textContent));
      expect(outside).toEqual([]);
    });
  }
});
