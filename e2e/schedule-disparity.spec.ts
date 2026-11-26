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
    await expect(page.getByText(/This ranking does not predict wins/)).toBeVisible();
    await expect(page.getByText(/does not predict results/)).toBeVisible();
    await page.getByText("Show full breakdown", { exact: true }).click();
    await expect(page.getByText(/not an estimate of wins caused by the schedule/)).toBeVisible();
  });

  /**
   * The season-scoped "as of" stamp (2026-08-27, docs/UIUX_CHECKLIST.md §5).
   *
   * The discriminating assertion is the last one: this line used to print the date the
   * response was *built* — today — under the same `AS OF` label /analysis wears for a data
   * date. A finished season's data date is months old, so a stamp that reads as today has
   * regressed to the old meaning, whatever it says.
   */
  test("stamps the selected season with its own data date, not today's", async ({ page }) => {
    // A finished season, named: the page now opens on the upcoming one, which is ranked on
    // projected rest before any game is final and so carries no stamp yet.
    await page.goto("/schedule?season=2025-26");

    const status = page.getByText(/GAMES COMPARED/);
    await expect(status).toBeVisible({ timeout: 20_000 });
    await expect(status).toContainText(/AS OF \d{4}-\d{2}-\d{2}/);

    const stamp = (await status.textContent())?.match(/AS OF (\d{4}-\d{2}-\d{2})/)?.[1];
    expect(stamp).toBeTruthy();

    // The season is complete, so its last final game cannot be today. Computed in ET, the timezone `games.date` is stored in.
    const todayEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
      new Date()
    );
    expect(stamp).not.toBe(todayEt);
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

    // The guide explains the breakdown's columns, so it is not on screen until the
    // breakdown is open (D-79).
    const breakdown = page.getByText("Show full breakdown", { exact: true });
    await expect(breakdown).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("WHAT THESE COLUMNS MEAN")).toBeHidden();
    await breakdown.click();

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
    await expect(page.getByText(/does not show a consistent relationship between net edge and beating the line/)).toBeVisible();
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


test("schedule owns workload and opens each season on the latest measured day", async ({ page }) => {
  await page.goto("/schedule?season=2025-26");
  await page.locator("summary", { hasText: "Show travel and workload" }).click();
  await expect(page.getByTestId("schedule-tax-row")).toHaveCount(30);
  const chart = page.getByRole("region", { name: "League average fatigue by day" });
  const date = page.getByTestId("fatigue-day-readout").locator("time");
  await expect(date).toHaveAttribute("datetime", "2026-04-12");
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(date).toHaveAttribute("datetime", "2025-10-21");
  await expect(page.getByRole("button", { name: "Previous game day" })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(date).toHaveAttribute("datetime", "2025-10-22");
  await page.keyboard.press("End");
  await expect(date).toHaveAttribute("datetime", "2026-04-12");
  await expect(page.getByRole("button", { name: "Next game day" })).toBeDisabled();
  await expect(page.locator("[data-fatigue-date='2025-12-24']")).toHaveCount(0);
  await expect(page.locator("[data-gap='2025-12-23/2025-12-25']")).toHaveAttribute("stroke-dasharray", "4 4");
  const breakButton = chart.getByRole("button", { name: "All-Star Break" });
  await breakButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#daily-fatigue-break")).toHaveText("All-Star Break · Feb 13–Feb 18, 2026 ET");

  await page.locator("#schedule-disparity-season").selectOption("2019-20");
  await expect(page.getByText(/Team rankings are unavailable/)).toBeVisible();
  await expect(page.locator("summary", { hasText: "Show travel and workload" })).toHaveCount(0);
  await expect(date).toHaveAttribute("datetime", "2020-03-11");
  await expect(breakButton).toHaveCount(1);
});

test("verified historical All-Star gaps use their season's actual league calendar", async ({ page }) => {
  await page.goto("/schedule?season=1985-86");
  const selector = page.locator("#schedule-disparity-season");
  const chart = page.getByRole("region", { name: "League average fatigue by day" });
  const breakButton = chart.getByRole("button", { name: "All-Star Break" });
  for (const [season, before, after, detail] of [
    ["1985-86", "1986-02-06", "1986-02-11", "Feb 7–Feb 10, 1986"],
    ["2007-08", "2008-02-14", "2008-02-19", "Feb 15–Feb 18, 2008"],
    ["2020-21", "2021-03-04", "2021-03-10", "Mar 5–Mar 9, 2021"],
    ["2024-25", "2025-02-13", "2025-02-19", "Feb 14–Feb 18, 2025"],
  ]) {
    await selector.selectOption(season);
    await expect(chart.locator(`[data-gap="${before}/${after}"]`)).toHaveAttribute("stroke-dasharray", "4 4");
    await breakButton.click();
    await expect(page.locator("#daily-fatigue-break")).toHaveText(`All-Star Break · ${detail} ET`);
  }
  await selector.selectOption("1998-99");
  await expect(page.getByTestId("fatigue-day-readout").locator("time")).toHaveAttribute("datetime", /^1999-/);
  await expect(breakButton).toHaveCount(0);
});

// D-78: a table wider than its box has to say so. On a phone the breakdown drops the two
// columns the chart above already draws, fades its far edge while columns are hidden, and
// prints a hint; on a tablet it fits outright.
test("the full breakdown shows that it scrolls on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/schedule");
  await page.getByText("Show full breakdown", { exact: true }).click();
  const table = page.locator(".fc-schedule-breakdown");
  await expect(table.getByRole("columnheader", { name: "Team" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "#" })).toBeHidden();
  await expect(table.getByRole("columnheader", { name: "Edge games", exact: true })).toBeHidden();
  await expect(table).toHaveAttribute("data-more-end", "");
  expect(await table.evaluate((el) => getComputedStyle(el).maskImage)).toContain("linear-gradient");
  const hint = table.locator("+ .fc-scroll-hint");
  await expect(hint).toBeVisible();

  await table.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect(table).not.toHaveAttribute("data-more-end", "");
  expect(await table.evaluate((el) => getComputedStyle(el).maskImage)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("the full breakdown fits a tablet without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/schedule");
  await page.getByText("Show full breakdown", { exact: true }).click();
  const table = page.locator(".fc-schedule-breakdown");
  await expect(table.getByRole("columnheader", { name: "Team" })).toBeVisible();
  expect(await table.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(table.locator("+ .fc-scroll-hint")).toBeHidden();
});

test.describe("daily fatigue on touch screens", () => {
  test.use({ viewport: { width: 320, height: 760 }, hasTouch: true, isMobile: true });

  test("swipe stays within the season, and only measured days have tap targets", async ({ page }, info) => {
    await page.clock.setFixedTime(new Date("2026-11-26T12:00:00Z"));
    const points = [
      { date: "2026-10-20", games: 3, avgFatigue: 0 },
      { date: "2026-11-02", games: 9, avgFatigue: 4.13 },
      { date: "2026-11-04", games: 7, avgFatigue: 3.9 },
      { date: "2026-11-25", games: 9, avgFatigue: 3.65 },
    ];
    await page.route("**/api/schedule-disparity?*", route => route.fulfill({ json: { data: null, error: null } }));
    await page.route("**/api/season-report?*", route => {
      const season = new URL(route.request().url()).searchParams.get("season");
      const days = season === "2026-27" ? points : season === "1985-86" ? [
        { date: "1986-02-06", games: 10, avgFatigue: 4 },
        { date: "1986-02-12", games: 2, avgFatigue: 4 },
      ] : [];
      return route.fulfill({ json: { data: {
        teams: [], days, availableFinalGames: days.reduce((total, day) => total + day.games, 0),
      }, error: null } });
    });
    await page.goto("/schedule");
    const chart = page.getByRole("region", { name: "League average fatigue by day" });
    const readout = page.getByTestId("fatigue-day-readout");
    await expect(readout).toContainText("Nov 25, 2026 ET");
    await expect(readout).toContainText("3.6 mean fatigue");
    await expect(readout).toContainText("9 completed games");
    await expect(chart.locator("[data-fatigue-date]")).toHaveCount(4);
    await expect(chart.getByRole("button", { name: "All-Star Break" })).toHaveCount(0);
    await expect(chart.locator("[data-gap='2026-11-02/2026-11-04']")).toHaveAttribute("stroke-dasharray", "4 4");
    const spread = await chart.locator("[data-gap='2026-11-02/2026-11-04']").evaluate(line =>
      Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")));
    expect(spread).toBe(48);

    await chart.scrollIntoViewIfNeeded();
    const box = (await chart.boundingBox())!;
    const before = await chart.evaluate(el => el.scrollLeft);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 25, y: box.y + 88 }] });
    for (const delta of [35, 70, 105, 140]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 25 + delta, y: box.y + 88 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => chart.evaluate(el => el.scrollLeft)).toBeLessThan(before);
    await expect(readout).toContainText("Nov 25, 2026 ET");
    await page.getByRole("button", { name: "First game day" }).tap();
    await expect.poll(() => chart.evaluate(el => el.scrollLeft)).toBe(0);
    await expect(readout).toContainText("0.0 mean fatigue");
    await chart.locator("[data-fatigue-date='2026-11-04']").tap();
    await expect(readout).toContainText("Nov 4, 2026 ET");
    await page.getByRole("button", { name: "Latest game day" }).tap();
    await expect.poll(() => chart.evaluate(el => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThanOrEqual(1);
    await expect(page.locator("#schedule-disparity-season")).toHaveValue("2026-27");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("daily-fatigue-phone.png") });

    await page.locator("#schedule-disparity-season").selectOption("1985-86");
    await expect(readout).toContainText("Feb 12, 1986 ET");
    await expect(chart.locator("[data-gap='1986-02-06/1986-02-12']")).toHaveAttribute("stroke-dasharray", "4 4");
    await expect(chart.getByRole("button", { name: "All-Star Break" })).toHaveCount(0);

    await page.locator("#schedule-disparity-season").selectOption("1998-99");
    await expect(chart).toHaveCount(0);
    await expect(page.getByText("No completed games yet. The timeline fills in as the season is played.")).toBeVisible();
  });
});
