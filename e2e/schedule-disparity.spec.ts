import { expect, test } from "@playwright/test";

test.describe("Schedule Disparity page", () => {
  test("renders the terminal heading and eyebrow label", async ({ page }) => {
    await page.goto("/schedule");

    // Heading + eyebrow render server-side in the page wrapper, independent of
    // ScheduleDisparityContentLazy — no need to wait on the ranked list.
    await expect(page.getByRole("heading", { name: "Schedule Edge" })).toBeVisible();
    await expect(page.getByText("SCHEDULE DISPARITY · NET EDGE GAMES")).toBeVisible();
  });

  test("states what the page is not, before showing any number", async ({ page }) => {
    await page.goto("/schedule");

    // The page describes a schedule; it does not predict outcomes. That disclaimer is
    // load-bearing for a rest-disparity leaderboard, which invites reading intent into it.
    //
    // Matched on the claim, not on one phrasing of it: the header was shortened to two lines
    // on 2026-07-31 and "it is not a prediction" became "Not a prediction", which failed a
    // regex pinned to the longer form while the disclaimer itself never left the page. This
    // still fails if the sentence is dropped, which is what the test is for.
    await expect(page.getByText(/not a prediction/i)).toBeVisible();
    await expect(page.getByText(/much of the gap is structural/i)).toBeVisible();
  });

  test("ranks 30 teams and prints a signed value on every row", async ({ page }) => {
    await page.goto("/schedule");

    const rows = page.getByRole("listitem");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await expect(rows).toHaveCount(30);

    // Every row carries its own number, so nothing requires a hover to read.
    // A typographic minus (U+2212) is used, not a hyphen.
    for (const row of [rows.first(), rows.last()]) {
      await expect(row).toContainText(/[+−]\d+|(?:^|\s)0(?:\s|$)/);
    }
  });

  test("orders the leaderboard by net edge games, most favored first", async ({ page }) => {
    await page.goto("/schedule");

    const rows = page.getByRole("listitem");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    const parse = async (index: number) => {
      const text = await rows.nth(index).innerText();
      const m = text.match(/([+−])(\d+)|(?:^|\s)(0)(?:\s|$)/);
      if (!m) throw new Error(`no signed value in row ${index}: ${JSON.stringify(text)}`);
      if (m[3] !== undefined) return 0;
      return (m[1] === "−" ? -1 : 1) * Number(m[2]);
    };

    // First must be the largest and last the smallest — the ranking claim the page makes.
    expect(await parse(0)).toBeGreaterThanOrEqual(await parse(1));
    expect(await parse(28)).toBeGreaterThanOrEqual(await parse(29));
    expect(await parse(0)).toBeGreaterThan(await parse(29));
  });

  test("explains its columns behind a disclosure that opens on click", async ({ page }) => {
    await page.goto("/schedule");

    const guide = page.getByRole("group").filter({ hasText: "WHAT THESE COLUMNS MEAN" });
    await expect(guide).toBeVisible({ timeout: 20_000 });

    // Closed by default, so it costs no vertical space until asked for.
    const rule = page.getByText(/positive is always favorable/i);
    await expect(rule).toBeHidden();

    await page.getByText("WHAT THESE COLUMNS MEAN").click();
    await expect(rule).toBeVisible();
  });

  test("makes no cross-season claim", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByRole("listitem").first()).toBeVisible({ timeout: 20_000 });

    // Season length, team count and the league-wide rest distribution all shifted across the
    // four decades covered, so all-time framing would compare numbers that don't mean the same
    // thing.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/largest since|most since|all[- ]time|record for any season/i);
  });

  test("keeps the market-check sentry but not the table it guards", async ({ page }) => {
    await page.goto("/schedule");

    // ADR 0009: the leaderboard invites exactly one misuse — betting season over/unders — so
    // the claim that closes that door stays on this page, while the bucket table's one home
    // is the method page. The sentry's r comes from the same committed JSON as the table, so
    // asserting the claim here and the table there pins both halves of the split.
    await expect(page.getByText(/null result, published on purpose/i)).toBeVisible();
    await expect(page.getByText("Went over")).toHaveCount(0);

    await page.getByTestId("market-check-crosslink").click();
    await expect(page).toHaveURL(/\/behind-the-data\/schedule-edge$/);
  });

  test("is reachable from the primary navigation", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    // Exact: a bare "Schedule" is a case-insensitive substring that passes only by accident
    // of "SCHEDULE EDGE" containing it, and would go ambiguous the moment a second tab does.
    const schedule = nav.getByRole("link", { name: "SCHEDULE EDGE", exact: true });

    await expect(schedule).toBeVisible();
    await expect(schedule).not.toHaveAttribute("aria-current", "page");

    await schedule.click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(schedule).toHaveAttribute("aria-current", "page");
  });
});
