import { expect, test } from "@playwright/test";

test.describe("Games page", () => {
  test("leads with the thesis, and loads the season control and month tabs", async ({ page }) => {
    await page.goto("/games");

    // "Games" — the tab you clicked. This was a claim from 2026-08-11 until the front-door
    // swap on 2026-08-12, which was right while this page WAS the front door and wrong the
    // moment it stopped being one. The claim now opens the description instead.
    await expect(
      page.getByRole("heading", { level: 1, name: "Games" })
    ).toBeVisible();
    await expect(page.getByText(/Rest gap is a model-score difference/)).toBeVisible();

    // The site's headline figure moved to `/` with the front door. It must not come back here:
    // a forty-one-season result among controls that describe one day's slate reads as a
    // property of that slate.
    await expect(page.getByText(/is how often the more-rested team wins/)).toHaveCount(0);

    await expect(page.getByLabel("SEASON", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^OCT$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^DEC$/ })).toBeVisible();
  });

  // Games writes its season and date into the URL once the season's dates arrive. That write
  // used to land on top of a tab press made in the meantime and cancel it: about one press in
  // three, in the first second after load, left the visitor on Games.
  test("a tab pressed while the dates are still loading is not cancelled", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/games/dates*", async (route) => { await gate; await route.continue(); });
    // Hold the destination back so the dates always arrive before it commits.
    await page.route(/\/season\?.*_rsc=/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto("/games");
    await expect(page.getByLabel("SEASON", { exact: true })).not.toHaveValue("");

    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "SEASON REPORT" }).click();
    release();

    await expect(page).toHaveURL(/\/season(?:\?|$)/, { timeout: 20_000 });
  });

  // The page is prerendered, so the HTML a visitor receives was built on an earlier date. On
  // 2026-10-01 the season rolled over under a three-week-old build and every load threw React
  // #418: the season, the selected month and the offseason note were all rendered from "today".
  test("hydrates cleanly when the visitor's date is not the build's date", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.clock.setFixedTime(new Date("2027-01-15T17:00:00Z"));
    await page.goto("/games");
    await expect(page.getByLabel("SEASON", { exact: true })).toBeEnabled();
    expect(errors.filter((e) => /hydrat|#418/i.test(e))).toEqual([]);
  });

  // One failed response used to leave a dead page: no retry, and the same red sentence twice.
  test("a failed load says so once and recovers from TRY AGAIN", async ({ page }) => {
    let failing = true;
    await page.route("**/api/games/dates**", (route) =>
      failing
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ data: null, error: "Something went wrong. Please try again later." }) })
        : route.continue()
    );
    await page.goto("/games?season=2025-26");
    // Scoped to the page: Next's route announcer is an (empty) alert of its own.
    const alerts = page.locator("#main").getByRole("alert");
    await expect(alerts).toHaveCount(1);
    await expect(alerts).toContainText("FAILED TO LOAD GAMES");

    failing = false;
    await page.getByRole("button", { name: "TRY AGAIN" }).click();
    await expect(alerts).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Date" })).toBeVisible();
  });

  // The UPCOMING view toggle died in redesign stage ② (2026-08-29, ADR 0010): one board,
  // one card. Both halves of its retirement are asserted — the old /upcoming links still
  // land here, and the toggle is actually gone rather than left mounted and broken.
  test("/upcoming lands on the one board, and the view toggle is gone", async ({ page }) => {
    await page.goto("/upcoming");
    await expect(page).toHaveURL(/\/games(?:\?|$)/);

    await expect(page.getByRole("button", { name: "Previous day" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Games view" })).toHaveCount(0);
  });

  // D-79: there is no density dial. A desktop always carries the rest-days and fatigue
  // columns; the width decides how much shows, not a mode.
  test("the slate shows every column on a desktop and offers no view toggle", async ({ page }) => {
    await page.goto("/games?season=2024-25&date=2024-12-25&view=skim");
    await expect(page.getByText("FATIGUE (0–10)")).toBeVisible();
    await expect(page.getByText("REST (DAYS)")).toBeVisible();
    await expect(page.getByText("GAP SIZE", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(SKIM|DEEP DIVE)$/ })).toHaveCount(0);
  });

  // Owner review, 2026-10-07: the header sat 3px left of the first four columns, because a
  // row reserves a 3px accent edge the header did not, and GAP SIZE ended over the chevron
  // rather than the badge it names. Each header now starts or ends where its cells do.
  test("each column header lines up with the cells under it", async ({ page }) => {
    await page.goto("/games?season=2024-25&date=2024-12-25");
    await expect(page.getByText("REST (DAYS)")).toBeVisible();
    const edges = await page.evaluate(() => {
      const ink = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
      };
      const heads = [...document.querySelectorAll(".fc-game-header > span")].map(ink);
      const row = document.querySelector(".fc-game-grid")!;
      const cells = [...row.children].map((c) => c.getBoundingClientRect());
      const badge = row.querySelector(".fc-game-chevron > span > *")!.getBoundingClientRect();
      return {
        left: [0, 1, 3, 4].map((i) => heads[i].left - cells[i].left),
        restRight: heads[2].right - cells[2].right,
        gapRight: heads[5].right - badge.right,
      };
    });
    for (const delta of [...edges.left, edges.restRight, edges.gapRight]) {
      expect(Math.abs(delta)).toBeLessThanOrEqual(1);
    }
  });

  // Owner review, 2026-10-07: every game row is the same height. The schedule sentence
  // ("BKN on a back-to-back.") added a line to some rows and PROJECTED added one to others;
  // the sentence now lives in the expansion and PROJECTED shares the figure's line. An
  // upcoming game shows its tip time without an UPCOMING label.
  for (const date of ["2027-01-14", "2026-01-17"]) {
    for (const width of [1280, 390]) {
      test(`every game row is the same height on ${date} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/games?season=${date < "2026-07" ? "2025-26" : "2026-27"}&date=${date}`);
        const rows = page.locator(".fc-game-grid");
        await expect(rows.first()).toBeVisible();
        const heights = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
        expect(heights.length).toBeGreaterThan(1);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
        await expect(page.locator(".fc-game-status").filter({ hasText: "UPCOMING" })).toHaveCount(0);
        await expect(rows.filter({ hasText: /back-to-back/ })).toHaveCount(0);
      });
    }
  }

  // The EDGES AHEAD strip — what survived the UPCOMING view. It exists only when the
  // schedule actually holds future games with an edge to rank, so the test asks the API
  // first rather than failing on an off-season database.
  test("an edge in the strip jumps the board to its date", async ({ page, request }) => {
    // No season param: the route defaults to `defaultNbaSeason()` — the same query the
    // strip itself makes — so this probe matches it by construction and cannot age.
    const res = await request.get("/api/games/upcoming");
    const body = (await res.json()) as { data: { date: string }[] | null };
    test.skip(!body.data || body.data.length === 0, "no upcoming games in this database");

    await page.goto("/games");
    const strip = page.getByText("EDGES AHEAD", { exact: false });
    await expect(strip).toBeVisible({ timeout: 60_000 });

    const display = page.getByTestId("selected-date-display");
    await expect(display).not.toHaveText("PICK A DATE", { timeout: 60_000 });

    await page.getByRole("button", { name: /^Jump to / }).first().click();
    // The jump drives the same reducer the date chips do; the display re-renders with
    // the target date, whatever it is.
    await expect(display).not.toHaveText("PICK A DATE");
  });

  test("previous-day control moves the selected date display backward", async ({ page }) => {
    await page.goto("/games");

    const display = page.getByTestId("selected-date-display");
    await expect(display).not.toHaveText("PICK A DATE", { timeout: 60_000 });

    const before = await display.textContent();
    expect(before).toBeTruthy();

    await page.getByRole("button", { name: "Previous day" }).click();

    const after = await display.textContent();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  test("Christmas 2024 slate shows matchup cards with team abbreviations and fatigue decimals", async ({
    page,
  }) => {
    await page.goto("/games");

    await page.getByLabel("SEASON", { exact: true }).selectOption("2024-25");
    await page.getByRole("button", { name: /^DEC$/ }).click();

    const dec25 = page.getByRole("button", { name: /December 25, 2024/ });
    await expect(dec25).toBeVisible({ timeout: 60_000 });
    const christmasResponse = page.waitForResponse(
      res => res.url().includes("/api/games/2024-12-25") && res.status() === 200
    );
    await dec25.click();
    await christmasResponse;

    // MatchupCard's toggle row is role="button" with an "Expand/Collapse game
    // details" aria-label (src/components/matchup-table.tsx) — there's
    // no combined "TEAM @ TEAM" text node in the current markup.
    const firstCard = page
      .getByRole("button", { name: /^(Expand|Collapse) .* game details$/ })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });

    const abbreviation = firstCard.locator("span").filter({ hasText: /^[A-Z]{3}$/ }).first();
    await expect(abbreviation).toBeVisible();

    const fatigueDecimal = firstCard.locator(".tabular-nums").filter({ hasText: /\d+\.\d/ }).first();
    await expect(fatigueDecimal).toBeVisible();
  });

  // The month tab is derived from the selected date rather than stored beside it, so
  // stepping across a boundary moves the tab by definition. The version this replaced
  // needed a setState-during-render block plus a ref handshake to achieve the same thing.
  test("crossing a month boundary with the arrows moves the month tab", async ({ page }) => {
    await page.goto("/games");

    await page.getByLabel("SEASON", { exact: true }).selectOption("2024-25");
    await page.getByRole("button", { name: /^DEC$/ }).click();

    const display = page.getByTestId("selected-date-display");
    await expect(display).toContainText("DECEMBER", { timeout: 60_000 });

    // Land on the last December day with games, then step past it.
    await page.getByRole("group", { name: "Date", exact: true }).locator('button[aria-label*="December"]').last().click();
    await expect(display).toContainText("DECEMBER");

    const next = page.getByRole("button", { name: "Next day" });
    for (let i = 0; i < 5; i++) {
      await next.click();
      const text = await display.textContent();
      if (text && !text.includes("DECEMBER")) break;
    }

    await expect(display).toContainText("JANUARY");
    await expect(page.getByRole("button", { name: /^JAN$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^DEC$/ })).toHaveAttribute("aria-pressed", "false");
  });

  test("previous day from an early season date can reach a day with no games", async ({ page }) => {
    await page.goto("/games");

    await page.getByLabel("SEASON", { exact: true }).selectOption("2024-25");

    await page.getByRole("button", { name: /^OCT$/ }).click();

    const firstDayWithGames = page.getByRole("group", { name: "Date", exact: true }).locator('button[aria-label*="games"]').first();
    await expect(firstDayWithGames).toBeVisible({ timeout: 60_000 });
    await firstDayWithGames.click();

    const prev = page.getByRole("button", { name: "Previous day" });
    const empty = page.getByText("NO GAMES SCHEDULED");
    for (let i = 0; i < 45; i++) {
      await prev.click();
      try {
        await expect(empty).toBeVisible({ timeout: 1_000 });
        return;
      } catch {
        // still on a day with games — keep stepping back
      }
    }

    throw new Error("Expected to reach a date with no games within 45 previous-day steps");
  });
});

// D-78, D-79: the three slate measures are one line above the matchups; Edges Ahead stays
// after the list; a phone gets the compact row with no view toggle and no gap-size badge.
test("mobile reads the slate summary before the matchups and has no view toggle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games?season=2024-25&date=2024-12-25&view=deep");
  const line = page.getByTestId("slate-summary-line");
  await expect(line).toContainText("GAMES");
  const lineBox = await line.boundingBox();
  const heading = await page.getByText("MATCHUPS", { exact: true }).boundingBox();
  expect(lineBox!.y + lineBox!.height).toBeLessThanOrEqual(heading!.y);
  const main = await page.getByTestId("games-main").boundingBox();
  const summary = await page.getByRole("complementary", { name: "Upcoming edges" }).boundingBox();
  expect(summary!.y).toBeGreaterThanOrEqual(main!.y + main!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: /^(SKIM|DEEP DIVE)$/ })).toHaveCount(0);
  await expect(page.locator(".fc-game-extra").first()).toBeHidden();
  await expect(page.locator(".fc-game-chevron").first().getByText(/GAP|NEUTRAL/)).toBeHidden();
});

for (const available of [false, true]) {
  test(`off-season defaults to completed games; upcoming schedule available=${available}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-07T12:00:00Z"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/games/dates?season=2026-27", route => route.fulfill({ json: {
      data: available ? [{ date: "2026-10-20", gameCount: 1 }] : [], error: null,
    } }));
    await page.goto("/games");
    await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2025-26");
    await expect(page.getByTestId("selected-date-display")).toContainText("APRIL 12, 2026");
    const seasonNotice = page.getByText("2025-26 complete · final games", { exact: true }).filter({ visible: true });
    await expect(seasonNotice).toBeVisible();
    const noticeBox = await seasonNotice.boundingBox();
    const matchupsBox = await page.getByText("MATCHUPS", { exact: true }).boundingBox();
    expect(noticeBox!.y).toBeLessThan(matchupsBox!.y);
    const upcoming = page.getByRole("button", { name: "View 2026-27 →" });
    if (available) {
      await expect(upcoming).toBeVisible();
      await upcoming.click();
      await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2026-27");
    } else {
      await expect(upcoming).toHaveCount(0);
    }
  });
}


test("shared Games links restore season, date and browser history", async ({ page }) => {
  // Pinned outside October: in October a past season opens on its own opening night
  // (pickDefaultGamesDate), and the "2024" expectation below is the last-date rule.
  await page.clock.setFixedTime(new Date("2026-09-15T17:00:00Z"));
  await page.goto("/games?season=2024-25&date=2024-12-25&view=deep");
  const display = page.getByTestId("selected-date-display");
  await expect(display).toContainText("DECEMBER 25, 2024");
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/date=2024-12-24/);
  await expect(page.getByText("NO GAMES SCHEDULED")).toBeVisible();
  await page.reload();
  await expect(display).toContainText("DECEMBER 24, 2024");
  await expect(page.getByText("NO GAMES SCHEDULED")).toBeVisible();
  await page.goBack();
  await expect(display).toContainText("DECEMBER 25, 2024");
  await expect(page.getByRole("button", { name: /^Expand .* game details$/ }).first()).toBeVisible();
  await page.goForward();
  await expect(display).toContainText("DECEMBER 24, 2024");
    await page.getByLabel("SEASON", { exact: true }).selectOption("2023-24");
  await expect(page).toHaveURL(/season=2023-24/);
  await expect(display).toContainText("2024");
  await page.goBack();
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
  await expect(display).toContainText("DECEMBER 24, 2024");
});

test("date-only links infer the season; invalid dates fall back safely", async ({ page }) => {
  await page.goto("/games?date=2023-12-25");
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2023-24");
  await expect(page.getByTestId("selected-date-display")).toContainText("DECEMBER 25, 2023");
  await page.goto("/games?season=2024-25&date=2024-02-30");
  await expect(page.getByTestId("selected-date-display")).not.toHaveText("PICK A DATE");
  await expect(page).not.toHaveURL(/date=2024-02-30/);
});

test("expanded game links survive reload and changing dates clears the expansion", async ({ page }) => {
  await page.goto("/games?season=2024-25&date=2024-12-25");
  const first = page.getByRole("button", { name: /^Expand .* game details$/ }).first();
  await first.click();
  await expect(page).toHaveURL(/game=\d+/);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Collapse .* game details$/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).not.toHaveURL(/game=/);
});

// D-81: no in-game score is stored. A row reads LIVE from its tip time, FINAL over "Pending"
// once three hours have passed, and the score when the writer stores it. The slate is served
// as unplayed here whatever the database holds, so these keep working after opening night.
test.describe("game status from the clock", () => {
  const unplayed = async (page: import("@playwright/test").Page) => {
    await page.route("**/api/games/2026-10-20", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { data: Record<string, unknown>[] };
      body.data = body.data.map((g) => ({ ...g, status: "scheduled", homeScore: null, awayScore: null }));
      await route.fulfill({ response: res, json: body });
    });
  };
  // Rows come in tip-off order: BOS at DET 3:00 PM, PHI at NYK 7:00 PM, OKC at SAS 9:30 PM.
  const status = (page: import("@playwright/test").Page, row: number) =>
    page.locator(".fc-game-grid").nth(row).locator(".fc-game-status");

  for (const width of [1280, 390]) {
    test(`an evening slate shows each phase at one row height at ${width}px`, async ({ page }) => {
      // 7:30 PM ET on opening night: the 3 PM game is over, the 7 PM game is being played,
      // the 9:30 PM game has not tipped.
      await page.clock.setFixedTime(new Date("2026-10-20T23:30:00Z"));
      await page.setViewportSize({ width, height: 900 });
      await unplayed(page);
      await page.goto("/games?season=2026-27&date=2026-10-20");

      const rows = page.locator(".fc-game-grid");
      await expect(rows).toHaveCount(3);
      await expect(status(page, 0)).toHaveText(/FINAL\s*Pending/);
      await expect(status(page, 1)).toHaveText(/LIVE\s*7:00 PM ET/);
      await expect(status(page, 2)).toHaveText("9:30 PM ET");

      const heights = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("before the first tip every row shows only its tip time", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-20T15:00:00Z"));
    await unplayed(page);
    await page.goto("/games?season=2026-27&date=2026-10-20");
    await expect(page.locator(".fc-game-grid")).toHaveCount(3);
    await expect(page.locator(".fc-game-status").filter({ hasText: /LIVE|FINAL/ })).toHaveCount(0);
  });

  test("the board stays on the game day past midnight ET and moves on at 6 AM", async ({ page }) => {
    // 12:30 AM ET on Oct 21: the 9:30 PM game is still being played.
    await page.clock.setFixedTime(new Date("2026-10-21T04:30:00Z"));
    await unplayed(page);
    await page.goto("/games");
    await expect(page).toHaveURL(/date=2026-10-20/);
    await expect(status(page, 2)).toHaveText(/FINAL\s*Pending|LIVE/);

    await page.clock.setFixedTime(new Date("2026-10-21T10:30:00Z"));
    await page.goto("/games");
    await expect(page).toHaveURL(/date=2026-10-21/);
  });
});
