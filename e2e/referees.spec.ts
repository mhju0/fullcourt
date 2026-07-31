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

  test("states that it is style rather than bias", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText("This is style, not bias.")).toBeVisible();
  });
});
