import { expect, test } from "@playwright/test";

test.describe("Behind the Data", () => {
  test("sits in the Reference landmark, not among the six product tabs", async ({ page }) => {
    await page.goto("/");

    // Two landmarks share the nav row. The product tabs keep their asserted six-link count;
    // the reference links are a separate landmark so they read as utility, not product.
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(mainNav.getByRole("link")).toHaveCount(4);
    await expect(
      mainNav.getByRole("link", { name: "BEHIND THE DATA", exact: true })
    ).toHaveCount(0);

    // One link, not two. ABOUT left this landmark on 2026-08-12 when the page it pointed at
    // became `/` — a chrome link to the front door duplicates the wordmark.
    const reference = page.getByRole("navigation", { name: "Reference" });
    await expect(reference.getByRole("link")).toHaveCount(1);
    await expect(reference.getByRole("link", { name: "ABOUT", exact: true })).toHaveCount(0);

    const link = reference.getByRole("link", { name: "BEHIND THE DATA", exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/behind-the-data$/);
  });

  test("every section is its own addressable route", async ({ page }) => {
    await page.goto("/behind-the-data");

    // Real routes rather than client-side tabs, so each method is linkable and crawlable.
    const sections = page.getByRole("navigation", { name: "Reference sections" });
    for (const slug of ["rest-advantage", "schedule-edge", "playoff-predictions", "player-shooting", "shot-value", "availability", "officiating"]) {
      await expect(sections.locator(`a[href="/behind-the-data/${slug}"]`)).toBeVisible();
    }

    await sections.locator('a[href="/behind-the-data/shot-value"]').click();
    await expect(page).toHaveURL(/\/behind-the-data\/shot-value$/);
    await expect(page.getByRole("heading", { name: "Shot value", level: 1 })).toBeVisible();
  });

  test("each product page links into the section that explains it", async ({ page }) => {
    // The reference is most wanted at the moment a number is doubted, which is on the
    // product page — so the door is there too, not only in the nav.
    await page.goto("/schedule");
    await page.getByRole("link", { name: /HOW THIS IS CALCULATED/ }).click();
    await expect(page).toHaveURL(/\/behind-the-data\/schedule-edge$/);
  });

  test("states the formula, the term weights, and the limits", async ({ page }) => {
    await page.goto("/behind-the-data/rest-advantage");

    await expect(page.getByRole("heading", { name: "Rest advantage" })).toBeVisible();

    // The three sections that carry the page's reason for existing. Asserted by section
    // label so a reword does not fail, but deleting a section does.
    for (const id of ["the-score", "what-each-term-is-worth", "what-this-cannot-see"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await page.locator("#the-terms > details > summary").click();
    await page.locator("#what-each-term-is-worth > details > summary").click();

    // Constants are read from FATIGUE_CONSTANTS, so this doubles as a guard that the
    // export is still wired to the model rather than to hardcoded prose.
    await expect(page.getByText("2.65", { exact: false }).first()).toBeVisible();

    // The ablation table's load-bearing pair: travel finds more of the model's calls than any
    // other term, and those games win. Asserted together with the +0.32pp row they explain,
    // because the row on its own reads as an argument for deleting the term.
    await expect(page.getByText("5,994", { exact: true })).toBeVisible();
    await expect(page.getByText("59.14%", { exact: true })).toBeVisible();
    await expect(page.getByText("+0.32pp", { exact: true })).toBeVisible();

    // The count is dropped calls, not all winners. Preserve that distinction alongside the rate.
    await expect(
      page.getByText("5,994 called games", { exact: false })
    ).toBeVisible();
    await expect(page.getByText("including losses, not a count of winning predictions", { exact: false })).toBeVisible();
  });

  test("the market check's one home is the Schedule Edge method page", async ({ page }) => {
    await page.goto("/behind-the-data/schedule-edge");

    // The full evidence — the bucket table and the archive prose — moved here whole from the
    // foot of /schedule on 2026-08-24 (ADR 0009); /schedule keeps a one-paragraph sentry.
    // Asserted on the table's own column header and on the sentence that names it a null, so
    // dropping either the evidence or the claim fails.
    await page.locator("#the-market-check > details > summary").click();
    await expect(page.getByText("Went over")).toBeVisible();
    await expect(page.getByText(/archive does not show a consistent relationship/i)).toBeVisible();
  });

  test("the index collects the measured nulls, each linking to its evidence", async ({ page }) => {
    await page.goto("/behind-the-data");

    // A second index over the same pages, keyed by question. Every row must point at a page
    // that actually publishes the empty result — the list carries no figure of its own.
    const nulls = page.getByTestId("null-results");
    await expect(nulls.getByRole("link")).toHaveCount(4);
    for (const label of [
      "Season win totals",
      "Time zones",
      "Referee folklore",
      "Playoff winner selection",
    ]) {
      await expect(nulls.getByRole("link", { name: new RegExp(label) })).toBeVisible();
    }

    await nulls.getByRole("link", { name: /Season win totals/ }).click();
    await expect(page).toHaveURL(/\/behind-the-data\/schedule-edge#the-market-check$/);
    await expect(page.locator("#the-market-check details")).toHaveAttribute("open", "");
  });
});

test.describe("Status bar", () => {
  test("the wordmark returns to the front door", async ({ page }) => {
    await page.goto("/analysis");
    // Previously inert: the one piece of chrome people reflexively click did nothing. It used
    // to land on the games slate, because `/` was the slate. Since the 2026-08-12 swap `/` is
    // the front door, which is where a wordmark is expected to go.
    await page.getByRole("link", { name: "FullCourt home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rest is a stat");
  });

  test("no longer advertises a single current season in the chrome", async ({ page }) => {
    await page.goto("/");
    // The site covers four decades of seasons; a fixed "2025-26 SEASON" readout in the chrome implied
    // the whole product was scoped to one, and it was not interactive either.
    //
    // Scoped to the header on purpose. The home page still carries an offseason banner
    // ("2025-26 SEASON COMPLETE — SHOWING FINAL SLATE"), which is doing real work: it
    // explains why a completed slate is on screen. A page-wide assertion would have
    // demanded that be deleted too.
    await expect(page.locator("header").getByText(/\d{4}-\d{2} SEASON/)).toHaveCount(0);
  });
});

/**
 * A JSX text node that wraps to the next line loses its leading space, so
 * `<strong>x.</strong> Word…` renders as "x.Word" and `{n} seasons` as "40seasons".
 * It has produced a visible defect twice on these pages, and it is invisible in review
 * because the source looks correct — the space is there, JSX just drops it.
 *
 * This sweeps the rendered prose of every page for the two signatures. Formula blocks are
 * excluded: camelCase identifiers inside them are code, not run-together words.
 *
 * The product pages are in this list because leaving them out cost us: /schedule shipped
 * "Across 31seasons" and "884team-seasons" and went unnoticed, because the sweep that would
 * have caught it on sight only ever visited /behind-the-data. Any page rendering a number
 * beside a word belongs here.
 */
test.describe("Prose spacing", () => {
  const ROUTES = [
    "/behind-the-data",
    "/behind-the-data/rest-advantage",
    "/behind-the-data/schedule-edge",
    "/behind-the-data/playoff-predictions",
    "/behind-the-data/player-shooting",
    "/behind-the-data/shot-value",
    // The three below joined on 2026-08-24 — the sweep predates them, and the window
    // section added to the referees page that day is exactly the seam-heavy prose it exists
    // to catch.
    "/behind-the-data/availability",
    "/behind-the-data/referees",
    "/behind-the-data/time-zones",
    "/behind-the-data/data-and-limits",
    // "/" is the front door (the marketing page, formerly /about); "/games" is the board.
    "/",
    "/games",
    "/season",
    "/schedule",
    "/analysis",
    "/playoffs",
    "/shooting",
    "/shot-quality",
  ];

  for (const route of ROUTES) {
    test(`no run-together words on ${route}`, async ({ page }) => {
      await page.goto(route);

      // Prose only. Formula blocks are <pre> and tables are cells; camelCase inside them is
      // code, not run-together words, so reading <p> and <li> is both simpler and stricter
      // than stripping the code blocks out of a whole-body dump.
      const text = (await page.locator("p, li").allInnerTexts()).join("\n");
      // Whole words, then the seam test — not the seam alone. Matching the seam yielded
      // fragments like "lCourt" for "FullCourt", which no entry in the allow-list below could
      // ever match, so the allow-list was inert until the first camelCase proper noun reached
      // one of these pages. `.,)` stay inside a word because "x.Word" IS the defect.
      const offenders = (text.match(/[A-Za-z0-9.,)]+/g) ?? [])
        .filter((w) => /[a-z.,)][A-Z][a-z]{2,}|\d[a-z]{3,}/.test(w))
        // Legitimately unspaced: proper nouns and metric names the prose uses inline.
        .filter((w) => !/^(NBA|FullCourt|GBM|UTC|eFG|xeFG|ESPN|hoopR)$/.test(w.replace(/^[.,)]+|[.,)]+$/g, "")));

      expect(offenders, `run-together text: ${offenders.join(", ")}`).toEqual([]);
    });

    // The text sweep above only catches a join it can see — a capital or a digit at the seam.
    // `</strong>rather` is the same defect and is invisible to it, because both sides are
    // lowercase. Two of them were shipped and live on these pages until 2026-07-30. The seam
    // itself is checkable even when the words are not: an inline tag is never legitimately
    // followed straight by a letter in this prose, only by punctuation or a space.
    test(`no lost space after an inline tag on ${route}`, async ({ page }) => {
      await page.goto(route);

      const html = await page.content();
      const seams = [...html.matchAll(/<\/(strong|em|code)>[a-zA-Z(]\w*/g)].map((m) => m[0]);

      expect(seams, `lost space: ${seams.join(", ")}`).toEqual([]);
    });
  }
});

const METHOD_ROUTES = ["rest-advantage", "schedule-edge", "playoff-predictions", "player-shooting", "shot-value", "availability", "officiating", "referees", "time-zones", "data-and-limits"];

for (const topic of METHOD_ROUTES) {
  test(`${topic}: mobile topic, technical details and deep links`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/behind-the-data/${topic}`);
    await expect(page.locator(".reference-topics > summary")).toBeInViewport();
    await page.locator(".reference-topics > summary").click();
    await expect(page.locator('.reference-topics [aria-current="page"]')).toBeVisible();
    await page.locator(".reference-topics > summary").click();
    const section = page.locator("#reference-body > section").filter({ has: page.locator(":scope > details") }).last();
    const id = await section.getAttribute("id");
    expect(id).toBeTruthy();
    await page.goto("about:blank");
    await page.goto(`/behind-the-data/${topic}#${id}`);
    await expect(section.locator(":scope > details")).toHaveAttribute("open", "");
    await section.locator(":scope > details > summary").focus();
    await page.keyboard.press("Enter");
    await expect(section.locator(":scope > details")).not.toHaveAttribute("open", "");
    await page.locator(".reference-contents > summary").click();
    await page.getByRole("button", { name: "Expand technical detail", exact: true }).click();
    await expect(page.locator("#reference-body details:not([open])")).toHaveCount(0);
    await page.getByRole("button", { name: "Collapse technical detail", exact: true }).click();
    await expect(page.locator("#reference-body details[open]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.locator(`.reference-contents a[href$="#${id}"]`).click();
    await expect(section.locator(":scope > details")).toHaveAttribute("open", "");
    await page.locator(".reference-contents a").first().click();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/behind-the-data/${topic}#${id}$`));
    await expect(section.locator(":scope > details")).toHaveAttribute("open", "");
    await page.getByRole("link", { name: "← All methods", exact: true }).click();
    await expect(page).toHaveURL(/\/behind-the-data$/);
    await expect(page.getByRole("heading", { name: "Behind the Data", exact: true, level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/behind-the-data/${topic}#${id}$`));
    await expect(page.locator(`#${id} > details`)).toHaveAttribute("open", "");
  });
}

test("technical evidence remains readable without JavaScript", async ({ browser, baseURL, extraHTTPHeaders }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, extraHTTPHeaders });
  try {
    const page = await context.newPage();
    await page.goto("/behind-the-data/rest-advantage");
    await page.locator("#the-terms > details > summary").click();
    await expect(page.locator("#the-terms").getByText("2.65", { exact: false }).first()).toBeVisible();
    await page.locator(".reference-contents > summary").click();
    await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).not.toHaveCount(0);
  } finally { await context.close(); }
});

test("printing reveals evidence and restores the reading state", async ({ page }) => {
  await page.goto("/behind-the-data/rest-advantage");
  await page.waitForFunction(() => document.querySelector(".reference-actions button"));
  await page.evaluate(() => dispatchEvent(new Event("beforeprint")));
  await expect(page.locator("#reference-body details:not([open])")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("5,994", { exact: true })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await expect(page.locator("#reference-body details[open]")).toHaveCount(0);
});
