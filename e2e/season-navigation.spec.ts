import { expect, test } from "@playwright/test";

// D-78: a phone shows one week; the month buttons and the month grid sit behind Calendar.
test("a phone picks a date from the week strip or the calendar, and restores it from the URL", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games?season=2025-26&date=2026-04-12");
  const season = page.getByLabel("SEASON", { exact: true });
  const week = page.getByRole("group", { name: "Week", exact: true });
  const calendar = page.getByRole("button", { name: "Calendar", exact: true });
  await expect(season).toBeVisible();
  await expect(week.getByRole("button")).toHaveCount(7);
  await expect(week.locator('[aria-current="date"]')).toHaveAccessibleName(/April 12, 2026/);
  await expect(page.getByRole("group", { name: "Month", exact: true })).toBeHidden();
  expect((await season.boundingBox())!.y).toBeLessThan((await week.boundingBox())!.y);
  // Nothing in the controls scrolls sideways any more.
  expect(await week.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  await season.selectOption("2024-25");
  await expect(calendar).toHaveAttribute("aria-expanded", "false");
  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "DEC", exact: true }).click();
  const dates = page.getByRole("group", { name: "Date", exact: true });
  await dates.getByRole("button", { name: /December 25, 2024/ }).click();
  await expect(page).toHaveURL(/date=2024-12-25/);
  // A pick closes the panel and hands focus back to the button that opened it.
  await expect(calendar).toHaveAttribute("aria-expanded", "false");
  await expect(calendar).toBeFocused();
  await expect(week.locator('[aria-current="date"]')).toHaveAccessibleName(/Wednesday, December 25, 2024, 5 games/);

  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page).toHaveURL(/date=2025-01-01/);
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(page).toHaveURL(/date=2024-12-25/);

  await page.reload();
  await expect(season).toHaveValue("2024-25");
  await expect(week.locator('[aria-current="date"]')).toHaveAccessibleName(/December 25, 2024/);
});

test("from the sm breakpoint every month and date shows at once, with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/games?season=2024-25&date=2024-12-25");
  const month = page.getByRole("group", { name: "Month", exact: true });
  const dates = page.getByRole("group", { name: "Date", exact: true });
  await expect(dates.locator('[aria-current="date"]')).toBeVisible({ timeout: 60_000 });
  for (const group of [month, dates]) {
    expect(await group.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await expect(dates.getByRole("button").last()).toBeInViewport();
  await expect(page.getByRole("group", { name: "Week", exact: true })).toBeHidden();
  const season = page.getByLabel("SEASON", { exact: true });
  await season.focus();
  await page.keyboard.press("Tab");
  await expect(month.getByRole("button").first()).toBeFocused();
});

test("the selected date stays on screen after a desktop-to-phone resize without moving focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/games?season=2025-26&date=2026-04-12");
  const season = page.getByLabel("SEASON", { exact: true });
  const selectedDate = page.getByRole("group", { name: "Date", exact: true }).locator('[aria-current="date"]');
  await expect(selectedDate).toBeVisible({ timeout: 60_000 });
  await season.focus();

  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page.getByRole("group", { name: "Week", exact: true }).locator('[aria-current="date"]')).toBeInViewport();
  await expect(season).toBeFocused();
});

// D-79: one frame at every width. The summary line sits above the matchups and Edges Ahead
// follows them; nothing moves into a side rail.
for (const width of [1280, 1024, 820]) {
  test(`the slate summary is above the matchups and Edges Ahead below at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/games?season=2024-25&date=2024-12-25");
    const main = await page.getByTestId("games-main").boundingBox();
    const aside = await page.getByRole("complementary", { name: "Upcoming edges" }).boundingBox();
    expect(aside!.y).toBeGreaterThanOrEqual(main!.y + main!.height);
    await expect(page.getByTestId("slate-summary-line")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`the matchup table keeps every column reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/games?season=2026-27&date=2027-03-22");
    await expect(page.getByRole("button", { name: /^Expand .* game details$/ }).first()).toBeVisible();
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
    await page.getByRole("button", { name: /^Expand .* game details$/ }).first().click();
    await expect(page.getByRole("button", { name: /^Collapse .* game details$/ })).toBeVisible();
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
