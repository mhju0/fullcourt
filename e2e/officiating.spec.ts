import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import data from "../src/data/officiating.json";

const season = data.seasons[data.seasons.length - 1];
const errorGame = season.games.find((g) => g.missed + g.wrong > 0)!;
const cleanGame = season.games.find((g) => g.missed + g.wrong === 0)!;
const url = (id: string) => `/officiating?season=${season.season}&game=${id}`;

test("legacy route redirects and archive keeps the original table", async ({
  page,
}) => {
  await page.goto("/referees");
  await expect(page).toHaveURL(/\/officiating$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Officiating",
  );
  await page.goto("/behind-the-data/officiating");
  await page.getByRole("heading", { name: "Earlier referee research", exact: true }).click();
  await page
    .getByRole("link", {
      name: /Open referee research archive/,
    })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Referee research archive",
  );
  await expect(page.getByRole("table").first()).toBeVisible();
});

test("shared filters survive reload and browser history", async ({ page }) => {
  await page.goto("/officiating");
  await page.getByLabel("SEASON", { exact: true }).selectOption("2024-25");
  await expect(
    page.getByText("305 identified errors, 399 reviewed games"),
  ).toBeVisible();
  await page.getByLabel("Team", { exact: true }).selectOption("NYK");
  await page.getByRole("button", { name: /^Shooting foul/ }).click();
  await page
    .locator('section[aria-labelledby="review-title"] summary')
    .first()
    .click();
  await expect(page.locator("blockquote").first()).toBeVisible();
  const share = await page
    .getByRole("link", { name: "Link to game ↗" })
    .getAttribute("href");
  expect(share).toContain("season=2024-25");
  expect(share).toContain("team=NYK");
  expect(share).toContain("type=Foul");
  expect(share).toContain("game=");
  await page.reload();
  await expect(page.locator("blockquote").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("blockquote")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("blockquote").first()).toBeVisible();
});

test("clean report retains all assessments and unavailable report offers recovery", async ({
  page,
}) => {
  await page.goto(url(cleanGame.id));
  await expect(
    page.getByText(
      "No errors identified in this report. You can still inspect all assessed plays.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show all assessed plays/ }).click();
  await expect(page.locator("blockquote").first()).toBeVisible();
  await page.route("**/data/officiating/**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto(url(errorGame.id));
  await expect(
    page.getByText("This report could not be loaded."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("empty filter retains the league figures", async ({ page }) => {
  await page.goto("/officiating?team=UNKNOWN");
  await expect(page.getByText("No reports match these filters.")).toBeVisible();
  await expect(
    page.getByText(
      `${season.missed + season.wrong} identified errors, ${season.games.length} reviewed games`,
    ),
  ).toBeVisible();
});

for (const width of [390, 1280])
  test(`populated view at ${width}px is accessible and stable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url(errorGame.id));
    await expect(page.locator("blockquote").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const summary = page.locator(`#review-${errorGame.id} summary`);
    await summary.scrollIntoViewIfNeeded();
    const y = await summary.evaluate((e) => e.getBoundingClientRect().top);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("details[open]")).toHaveCount(0);
    expect(
      Math.abs(
        (await summary.evaluate((e) => e.getBoundingClientRect().top)) - y,
      ),
    ).toBeLessThan(2);
    await page.keyboard.press("Enter");
    await expect(page.locator("blockquote").first()).toBeVisible();
    const result = await new AxeBuilder({ page }).include("main").analyze();
    expect(result.violations).toEqual([]);
  });

for (const historical of [data.seasons[0], data.seasons[2], data.seasons[4]]) {
  test(`archived ${historical.season} report opens with source evidence on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const game = historical.games.find(g => g.missed + g.wrong > 0)!;
    await page.goto(`/officiating?season=${historical.season}&game=${game.id}`);
    await expect(page.getByLabel("SEASON", { exact: true }).locator("option")).toHaveCount(12);
    await expect(page.locator("blockquote").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Source: NBA L2M report ↗" }).first()).toHaveAttribute("href", game.source);
    await page.evaluate(() => window.scrollTo(0, 0));
    const selected = page.locator('[data-active="true"]');
    await selected.scrollIntoViewIfNeeded();
    await expect(selected).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (historical.season === "2014-15") {
      await expect(page.getByText(/Partial season: reports begin/)).toBeVisible();
      await expect(page.getByText("Video unavailable").first()).toBeVisible();
    }
  });
}
