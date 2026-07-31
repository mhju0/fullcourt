import { expect, test } from "@playwright/test";

test.describe("Playoff Rest page", () => {
  test("renders the terminal heading and eyebrow label", async ({ page }) => {
    await page.goto("/playoffs");

    // Heading + eyebrow render server-side in the page wrapper, independent of
    // PlayoffsContentLazy — no need to wait on lazy/data-dependent content.
    await expect(
      page.getByRole("heading", { name: "The round before decides the round after" })
    ).toBeVisible();

    await expect(page.getByText("PLAYOFF REST", { exact: true }).first()).toBeVisible();
  });

  test("leads with the argument, not the bracket", async ({ page }) => {
    await page.goto("/playoffs");

    // Sections A-D are server-rendered constants, so they are present without any DB round
    // trip. This is what makes the page useful when the API is slow or empty.
    await expect(page.getByText("THE POSTSEASON HAS NO REST")).toBeVisible();
    await expect(page.getByText("THE GRIND TAX")).toBeVisible();
    await expect(page.getByText("WHAT THE MODEL DOES WITH IT")).toBeVisible();
  });
});
