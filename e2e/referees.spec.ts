import { test, expect } from "@playwright/test";

test.describe("Referee Effect", () => {
  test("renders the foul-style table", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByRole("heading", { name: "What each official calls" })).toBeVisible();
    const rows = page.getByTestId("referee-style-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(30);
  });

  test("sorting a column reorders the table and marks the header", async ({ page }) => {
    await page.goto("/referees");
    const first = () => page.getByTestId("referee-style-row").first();
    const before = await first().innerText();

    const offensive = page.getByRole("columnheader", { name: /Offensive/ });
    await offensive.click();
    await expect(offensive).toHaveAttribute("aria-sort", "descending");
    const after = await first().innerText();
    expect(after).not.toBe(before);

    // Clicking again flips direction rather than re-sorting the same way.
    await offensive.click();
    await expect(offensive).toHaveAttribute("aria-sort", "ascending");
    expect(await first().innerText()).not.toBe(after);
  });

  test("the crew-chief filter narrows to officials who have chiefed", async ({ page }) => {
    await page.goto("/referees");
    const rows = page.getByTestId("referee-style-row");
    const all = await rows.count();

    await page.getByLabel("CREW CHIEFS ONLY").check();
    const chiefs = await rows.count();
    expect(chiefs).toBeGreaterThan(0);
    expect(chiefs).toBeLessThan(all);

    // Every remaining row carries the badge that the filter selects on.
    await expect(rows.first().getByText("CC", { exact: true })).toBeVisible();
  });

  test("leads with a leaderboard naming the most and fewest of each foul type", async ({ page }) => {
    await page.goto("/referees");
    // One card per published foul type, each carrying both extremes.
    await expect(page.getByText("MOST", { exact: true })).toHaveCount(5);
    await expect(page.getByText("FEWEST", { exact: true })).toHaveCount(5);

    // The leaderboard has to agree with the table it sits above: sorting offensive fouls
    // descending must put the same official on top as the card names.
    const lines = (await page.getByTestId("leader-offensive").innerText()).split("\n");
    const mostNamed = lines[lines.indexOf("MOST") + 1];
    expect(mostNamed).toBeTruthy();

    await page.getByRole("columnheader", { name: /Offensive/ }).click();
    const topRow = await page.getByTestId("referee-style-row").first().innerText();
    expect(topRow).toContain(mostNamed);
  });

  test("explains the number in plain terms rather than as a deviation", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText("how much more or less often")).toBeVisible();
  });

  test("states that it is style rather than bias", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText("This is style, not bias.")).toBeVisible();
  });
});
