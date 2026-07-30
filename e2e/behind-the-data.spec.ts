import { expect, test } from "@playwright/test";

test.describe("Behind the Data", () => {
  test("is reached from the status bar, not the tab bar or the OTHER menu", async ({ page }) => {
    await page.goto("/");

    // Reference material, not a product surface: it sits in the quiet top strip beside
    // ABOUT. Asserting all three negatives because each one was a placement that got tried
    // and rejected — a sixth tab breaks the five-link count, and the OTHER menu is for data
    // surfaces.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(
      nav.getByRole("link", { name: "BEHIND THE DATA", exact: true })
    ).toHaveCount(0);

    await nav.getByRole("button", { name: /OTHER/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "BEHIND THE DATA", exact: true })
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    const link = page.getByRole("link", { name: "BEHIND THE DATA", exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/behind-the-data$/);
  });

  test("states the formula, the term weights, and the limits", async ({ page }) => {
    await page.goto("/behind-the-data");

    await expect(page.getByRole("heading", { name: /How this is calculated/i })).toBeVisible();

    // The three sections that carry the page's reason for existing. Asserted by section
    // label so a reword does not fail, but deleting a section does.
    for (const label of ["THE SCORE", "WHAT EACH TERM IS WORTH", "WHAT THIS CANNOT SEE"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // Constants are read from FATIGUE_CONSTANTS, so this doubles as a guard that the
    // export is still wired to the model rather than to hardcoded prose.
    await expect(page.getByText("2.65", { exact: false }).first()).toBeVisible();

    // The ablation table's headline finding: workload dominates and density is negative.
    await expect(page.getByText("The engine", { exact: true })).toBeVisible();
    await expect(page.getByText("Slightly harmful", { exact: true })).toBeVisible();
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
    // The site covers forty seasons; a fixed "2025-26 SEASON" readout in the chrome implied
    // the whole product was scoped to one, and it was not interactive either.
    //
    // Scoped to the header on purpose. The home page still carries an offseason banner
    // ("2025-26 SEASON COMPLETE — SHOWING FINAL SLATE"), which is doing real work: it
    // explains why a completed slate is on screen. A page-wide assertion would have
    // demanded that be deleted too.
    await expect(page.locator("header").getByText(/\d{4}-\d{2} SEASON/)).toHaveCount(0);
  });
});
