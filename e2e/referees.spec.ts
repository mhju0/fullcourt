import { test, expect } from "@playwright/test";

/**
 * `/referees` — **published 2026-08-22**, after being deliberately held back since 2026-07-30.
 *
 * The specs that used to assert the in-progress card are gone with it. What replaced them is not
 * a coverage exercise: this page names real officials beside real records, and the assertions
 * below guard the sentences that make that defensible. If the noise floor, the same-official
 * counterexamples or the bias refusal ever stop rendering, the page becomes an accusation and
 * these fail.
 *
 * Two of the old skipped specs asserted copy that no longer exists — "This is style, not bias."
 * and "how much more or less often" — both written for a 2026-08-03 version of the table and
 * never re-run. They are rewritten here against what the finished page actually says, which is
 * the reason a skipped spec is not the same thing as a passing one.
 */
test.describe("Referee Effect — the published page", () => {
  test("renders the foul-style table rather than an in-progress card", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByRole("heading", { name: "What each official calls" })).toBeVisible();
    await expect(page.getByText("IN PROGRESS")).toHaveCount(0);
    const rows = page.getByTestId("referee-style-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(30);
  });

  test("the officials table pins its header against its own scrollport", async ({ page }) => {
    await page.goto("/referees");
    const rows = page.getByTestId("referee-style-row");
    await expect(rows.first()).toBeVisible();

    // ~74 officials run to about three viewports (measured 2026-08-24, UIUX checklist), so
    // the header pins — against the table's own scroll box, never the page scroll, which
    // would slide it under the 96px sticky chrome. Asserted on the mechanism's two halves:
    // the header cell is sticky, and its scroll container is the wrapper, not the page.
    const measured = await rows.first().evaluate((row) => {
      const table = row.closest("table");
      const wrapper = table?.parentElement;
      const th = table?.querySelector("thead th");
      if (!table || !wrapper || !th) return null;
      const wrapStyle = getComputedStyle(wrapper);
      return {
        thPosition: getComputedStyle(th).position,
        wrapperScrolls: wrapStyle.overflowY === "auto" && wrapStyle.maxHeight !== "none",
        tableTallerThanPort: table.scrollHeight > wrapper.clientHeight,
      };
    });
    expect(measured).not.toBeNull();
    expect(measured!.thPosition).toBe("sticky");
    expect(measured!.wrapperScrolls).toBe(true);
    expect(measured!.tableTallerThanPort).toBe(true);
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

  test("refuses the bias reading in the visitor's own words", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText(/nothing here can be read as bias/)).toBeVisible();
    await expect(page.getByText(/None of this is a fairness claim/)).toBeVisible();
  });

  test("no longer announces itself as unfinished in the nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^OTHER/ }).click();
    await expect(page.getByRole("menuitem", { name: /REFEREE EFFECT/ })).toBeVisible();
    await expect(page.getByText("IN PROGRESS")).toHaveCount(0);
  });
});

/**
 * The folklore chapter. Every assertion here exists because dropping the thing it guards would
 * leave a named official beside a losing record with nothing qualifying it.
 */
test.describe("Referee Effect — the folklore chapter", () => {
  test("states the famous record and the noise floor on the same page", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText("THE MOST FEARED REFEREE IN BASKETBALL")).toBeVisible();
    // The record...
    await expect(page.getByText(/PLAYOFF RECORD IN GAMES/)).toBeVisible();
    // ...and the count chance puts beside it, which may never be separated from it.
    await expect(page.getByText("SOMEBODY HAS TO FINISH FIRST")).toBeVisible();
    await expect(page.getByText(/OBSERVED VS EXPECTED BY CHANCE/)).toBeVisible();
  });

  test("shows the same official as a charm as well as a curse", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText(/best thing that ever happened to/)).toBeVisible();
    await expect(page.getByText(/curse and a charm on the same whistle/)).toBeVisible();
  });

  test("publishes the pair nobody named, which is the argument", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText("AND THE PAIR NOBODY EVER NAMED")).toBeVisible();
    await expect(page.getByText(/somebody went looking for the famous one/)).toBeVisible();
  });

  test("kills the make-up call with the offensive-foul sign flip", async ({ page }) => {
    await page.goto("/referees");
    // Published without this tile, the t = 27 above it reads as proof of compensation.
    // `exact` because the late-window paragraph above also contains "below chance, not above".
    await expect(page.getByText("BELOW CHANCE, NOT ABOVE", { exact: true })).toBeVisible();
    await expect(page.getByText(/there is a ball, and it keeps changing hands/)).toBeVisible();
  });

  test("carries the attribution caveat no figure can express", async ({ page }) => {
    await page.goto("/referees");
    await expect(page.getByText(/roughly a third/).first()).toBeVisible();
  });
});
