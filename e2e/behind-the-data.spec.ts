import { expect, test } from "@playwright/test";

test.describe("Behind the Data", () => {
  test("sits in the Reference landmark, not among the six product tabs", async ({ page }) => {
    await page.goto("/");

    // Two landmarks share the nav row. The product tabs keep their asserted six-link count;
    // the reference links are a separate landmark so they read as utility, not product.
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(mainNav.getByRole("link")).toHaveCount(6);
    await expect(
      mainNav.getByRole("link", { name: "BEHIND THE DATA", exact: true })
    ).toHaveCount(0);

    const reference = page.getByRole("navigation", { name: "Reference" });
    await expect(reference.getByRole("link", { name: "ABOUT", exact: true })).toBeVisible();

    const link = reference.getByRole("link", { name: "BEHIND THE DATA", exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/behind-the-data$/);
  });

  test("every section is its own addressable route", async ({ page }) => {
    await page.goto("/behind-the-data");

    // Real routes rather than client-side tabs, so each method is linkable and crawlable.
    const sections = page.getByRole("navigation", { name: "Reference sections" });
    for (const label of [
      "REST ADVANTAGE",
      "SCHEDULE EDGE",
      "PLAYOFF REST",
      "PLAYER SHOOTING",
      "SHOT VALUE",
      "DATA & LIMITS",
    ]) {
      await expect(sections.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    await sections.getByRole("link", { name: "SHOT VALUE", exact: true }).click();
    await expect(page).toHaveURL(/\/behind-the-data\/shot-value$/);
    await expect(page.getByRole("heading", { name: "Shot value" })).toBeVisible();
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
    for (const label of ["THE SCORE", "WHAT EACH TERM IS WORTH", "WHAT THIS CANNOT SEE"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // Constants are read from FATIGUE_CONSTANTS, so this doubles as a guard that the
    // export is still wired to the model rather than to hardcoded prose.
    await expect(page.getByText("2.65", { exact: false }).first()).toBeVisible();

    // The ablation table's load-bearing pair: travel finds more of the model's calls than any
    // other term, and those games win. Asserted together with the +0.32pp row they explain,
    // because the row on its own reads as an argument for deleting the term.
    await expect(page.getByText("5,994", { exact: true })).toBeVisible();
    await expect(page.getByText("59.14%", { exact: true })).toBeVisible();
    await expect(page.getByText("+0.32pp", { exact: true })).toBeVisible();

    // The sentence that stops that row being read as "travel makes the model worse". Without
    // it the table's most important number is also its most misleading one.
    await expect(
      page.getByText("giving up 5,994 winning predictions", { exact: false })
    ).toBeVisible();
  });
});

test.describe("Status bar", () => {
  test("the wordmark returns to the home slate", async ({ page }) => {
    await page.goto("/analysis");
    // Previously inert: the one piece of chrome people reflexively click did nothing.
    await page.getByRole("link", { name: "FullCourt home" }).click();
    await expect(page).toHaveURL(/\/$/);
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
    "/behind-the-data/data-and-limits",
    "/",
    "/season",
    "/schedule",
    "/analysis",
    "/playoffs",
    "/shooting",
    "/shot-quality",
    "/about",
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
