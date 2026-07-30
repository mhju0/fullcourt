import { expect, test } from "@playwright/test";

/** Client-rendered (ssr: false) over a ~730 KB payload — allow a cold dev compile. */
const READY = { timeout: 45_000 };

async function open(page: import("@playwright/test").Page, name: string) {
  await page.goto("/shooting");
  await page.getByTestId("player-row").first().waitFor(READY);
  await page.getByRole("searchbox", { name: "Search player" }).fill(name);
  await page.getByTestId("player-row").first().click();
}

test.describe("Shooting by Rest", () => {
  test("renders the heading and eyebrow", async ({ page }) => {
    await page.goto("/shooting");
    await expect(page.getByRole("heading", { name: "Shooting by Rest" })).toBeVisible();
    await expect(page.getByText("SHOOTING BY REST · eFG%")).toBeVisible();
  });

  test("opens on the newest season with a volume floor already applied", async ({ page }) => {
    await page.goto("/shooting");
    await page.getByTestId("player-row").first().waitFor(READY);

    await expect(page.locator("#pr-volume")).toHaveValue("300");
    // The floor has to bite, or "best eFG%" is a list of 180-attempt centres.
    const floored = await page.getByTestId("player-row").count();
    await page.selectOption("#pr-volume", "0");
    expect(await page.getByTestId("player-row").count()).toBeGreaterThan(floored);
  });

  test("expands a player into his own seasons, under the same header", async ({ page }) => {
    await open(page, "lebron");

    await expect(page.getByTestId("season-row").first()).toBeVisible();
    await expect(page.getByTestId("career-row")).toHaveCount(1);

    // The whole point of layout A: the seasons are rows of the browse table, so
    // there is exactly one header on the page and nothing can collide with it.
    await expect(page.locator("thead")).toHaveCount(1);
    const headerCells = await page.locator("thead th").count();
    const seasonCells = await page.getByTestId("season-row").first().locator("td").count();
    expect(seasonCells).toBe(headerCells);
  });

  test("the career row equals the seasons printed above it", async ({ page }) => {
    await open(page, "lebron");
    await expect(page.getByTestId("career-row")).toHaveCount(1);

    const sum = await page.evaluate(() => {
      const digits = (el: Element | null) => Number(el?.textContent?.replace(/[^0-9.]/g, "") ?? 0);
      const rows = [...document.querySelectorAll('[data-testid="season-row"]')];
      return {
        games: rows.reduce((a, r) => a + digits(r.children[4]), 0),
        fga: rows.reduce((a, r) => a + digits(r.children[5]), 0),
      };
    });
    const career = await page.getByTestId("career-row").locator("td").allTextContents();
    expect(Number(career[4].replace(/[^0-9]/g, ""))).toBe(sum.games);
    expect(Number(career[5].replace(/[^0-9]/g, ""))).toBe(sum.fga);
  });

  test("finds accented names typed without their accents", async ({ page }) => {
    await page.goto("/shooting");
    await page.getByTestId("player-row").first().waitFor(READY);
    await page.getByRole("searchbox", { name: "Search player" }).fill("jokic");
    await expect(page.getByTestId("player-row").first()).toContainText("Jokić");
  });

  test("sorts by rest effect in both directions", async ({ page }) => {
    await page.goto("/shooting");
    await page.getByTestId("player-row").first().waitFor(READY);

    const header = page.getByRole("columnheader", { name: /Rest effect/ });
    await header.click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    const top = await page.getByTestId("player-row").first().textContent();

    await header.click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(await page.getByTestId("player-row").first().textContent()).not.toBe(top);
  });

  test("career view ranks only players with a career estimate", async ({ page }) => {
    await page.goto("/shooting");
    await page.getByTestId("player-row").first().waitFor(READY);

    await page.selectOption("#pr-season", "career");
    await page.selectOption("#pr-volume", "0");
    // Every listed player carries an effect; nobody is ranked on a number we lack.
    const dashes = await page
      .getByTestId("player-row")
      .locator("td:last-child")
      .filter({ hasText: /^—$/ })
      .count();
    expect(dashes).toBe(0);
  });

  test("a ?player= link opens that player directly", async ({ page }) => {
    await page.goto("/shooting?player=" + encodeURIComponent("Nikola Jokić"));
    await page.getByTestId("career-row").waitFor(READY);
    await expect(page.getByTestId("player-row").first()).toContainText("Jokić");
    await expect(page.getByTestId("season-row").first()).toBeVisible();
  });

  test("expanding a player writes him into the URL so the view can be shared", async ({ page }) => {
    await open(page, "lebron");
    await expect(page).toHaveURL(/player=LeBron\+James|player=LeBron%20James/);
  });

  test("the team filter narrows the table to one franchise's players", async ({ page }) => {
    await page.goto("/shooting");
    await page.getByTestId("player-row").first().waitFor(READY);

    const all = await page.getByTestId("player-row").count();
    await page.selectOption("#pr-team", "OKC");
    const okc = await page.getByTestId("player-row").count();
    expect(okc).toBeGreaterThan(0);
    expect(okc).toBeLessThan(all);
    // Every visible team cell belongs to the franchise — Seattle years included.
    for (const cell of await page.getByTestId("player-row").locator("td:nth-child(3)").allTextContents()) {
      expect(cell).toMatch(/OKC|SEA/);
    }
  });
});
