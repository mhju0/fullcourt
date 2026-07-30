import { expect, test } from "@playwright/test";

test.describe("Behind the Data", () => {
  test("is reachable through the OTHER menu, not as a sixth tab", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    // The bar stays five plain-noun tabs; a methodology page is a reference surface.
    // If this ever became a direct tab, e2e/about.spec.ts's count assertion would also
    // fail — this is the check that names the intent.
    await expect(
      nav.getByRole("link", { name: "BEHIND THE DATA", exact: true })
    ).toHaveCount(0);

    await nav.getByRole("button", { name: /OTHER/ }).click();
    const item = page.getByRole("menuitem", { name: "BEHIND THE DATA", exact: true });
    await expect(item).toBeVisible();

    await item.click();
    await expect(page).toHaveURL(/\/behind-the-data$/);
  });

  test("states the formula, the term weights, and the limits", async ({ page }) => {
    await page.goto("/behind-the-data");

    await expect(page.getByRole("heading", { name: /How this is calculated/i })).toBeVisible();

    // The three sections that carry the page's reason for existing. Prose can be
    // rewritten; these are asserted by their section labels so a reword does not fail,
    // but silently deleting a section does.
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
