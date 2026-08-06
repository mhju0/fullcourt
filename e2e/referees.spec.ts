import { test, expect } from "@playwright/test";

/**
 * `/referees` is deliberately held back — see the docstring in `src/app/referees/page.tsx`.
 *
 * The table specs below are kept and skipped rather than deleted, so restoring the page is two
 * edits and no rewriting: swap the card for `<RefereeEffectContent style={data} timing={timing} />`
 * — which renders the same table inside the finished copy — and turn `test.describe.skip` back
 * into `test.describe`.
 */
test.describe("Referee Effect — held back", () => {
  test("shows an in-progress card rather than the table", async ({ page }) => {
    await page.goto("/referees");
    await expect(
      page.getByRole("heading", { name: "What each official calls" })
    ).toBeVisible();
    await expect(page.getByText("IN PROGRESS").first()).toBeVisible();
    // The guard that matters: the data must not reach the page while it is held back.
    await expect(page.getByTestId("referee-style-row")).toHaveCount(0);
  });

  test("says the data exists, so the state reads as unfinished rather than broken", async ({
    page,
  }) => {
    await page.goto("/referees");
    await expect(page.getByText(/data behind this is collected/)).toBeVisible();
  });

  test("is still labelled as unfinished in the nav guide", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "GUIDE" }).click();
    const guide = page.getByRole("navigation", { name: "FullCourt page guide" });
    await expect(
      guide.getByRole("link", { name: /^REFEREE EFFECT Still being built\./ })
    ).toBeVisible();
  });
});

// ─── Restore with the page ────────────────────────────────────────
// Every assertion below passed against the real table on 2026-08-03. They are skipped, not
// removed, because the component and dataset they exercise are untouched.
test.describe.skip("Referee Effect — the published table", () => {
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


  test("explains the number in plain terms rather than as a deviation", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText(/how much more or less often/)).toBeVisible();
  });

  test("states that it is style rather than bias", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText("This is style, not bias.")).toBeVisible();
  });
});
