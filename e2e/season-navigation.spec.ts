import { expect, test } from "@playwright/test";

test("season, month and date stay visible and restore from the URL", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games?season=2025-26&date=2026-04-12");
  const season = page.getByLabel("SEASON", { exact: true });
  const month = page.getByRole("group", { name: "Month", exact: true });
  const dates = page.getByRole("group", { name: "Date", exact: true });
  await expect(season).toBeVisible();
  await expect(month).toBeVisible();
  await expect(dates).toBeVisible();
  expect((await season.boundingBox())!.y).toBeLessThan((await month.boundingBox())!.y);
  expect((await month.boundingBox())!.y).toBeLessThan((await dates.boundingBox())!.y);
  await season.selectOption("2024-25");
  await page.getByRole("button", { name: "DEC", exact: true }).click();
  await dates.locator('button').filter({ hasText: /^25/ }).click();
  await expect(page).toHaveURL(/date=2024-12-25/);
  await page.reload();
  await expect(season).toHaveValue("2024-25");
  await expect(page.getByRole("button", { name: "DEC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dates.locator('[aria-current="date"]')).toBeInViewport();
  await season.focus();
  await page.keyboard.press("Tab");
  await expect(month.getByRole("button").first()).toBeFocused();
});

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`Deep Dive keeps every column reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/games?season=2026-27&date=2027-03-22&view=deep");
    await expect(page.getByRole("button", { name: "Expand game details" }).first()).toBeVisible();
    const region = page.getByRole("region", { name: "Matchups table; scroll horizontally for all columns" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1280) {
      expect(await region.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect(page.getByText("GAP SIZE", { exact: true })).toBeInViewport();
    }
    if (width >= 640) {
      const clipped = await page.locator('.fc-game-grid').first().evaluate(el => {
        const edge = el.getBoundingClientRect().right;
        return [...el.children].some(child => child.getBoundingClientRect().right > edge + 1);
      });
      expect(clipped).toBe(false);
      await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect(page.getByText("GAP SIZE", { exact: true })).toBeInViewport();
    }
    await page.getByRole("button", { name: "Expand game details" }).first().click();
    await expect(page.getByRole("button", { name: "Collapse game details" })).toBeVisible();
  });
}

test("season controls share dimensions and typography across studies", async ({ page }) => {
  const styles = [];
  for (const [route, id] of [["/games", "nba-season"], ["/season", "season-report-season"], ["/schedule", "schedule-season"], ["/shooting", "pr-season"], ["/officiating", "officiating-season"], ["/shot-quality", "shot-quality-season"], ["/playoffs", "playoffs-season"]]) {
    await page.goto(route);
    const control = page.locator('.fc-season-selector select').first();
    await expect(control, id).toBeVisible();
    styles.push(await control.evaluate(el => {
      const s = getComputedStyle(el);
      return [s.width, s.height, s.fontSize, s.fontFamily, s.borderRadius];
    }));
  }
  for (const style of styles) expect(style).toEqual(styles[0]);
});
