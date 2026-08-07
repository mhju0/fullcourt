import { expect, test } from "@playwright/test";
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_STORAGE_VALUE,
} from "../src/lib/onboarding";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("First-visit guide", () => {
  test("introduces every primary page on a new browser", async ({ page }) => {
    await page.goto("/");

    const guide = page.getByRole("dialog", { name: "Welcome to FullCourt" });
    await expect(guide).toBeVisible();
    // Each guide row's link wraps both the label and its description, so the accessible name
    // is "LABEL <description>". A bare { name: "GAMES" } would match two rows, since the
    // MODEL RESULTS description also ends in "individual games." — hence the start anchor.
    // Keep getByRole rather than getByText: the rows must stay links, not just text.
    await expect(guide.getByRole("link", { name: /^GAMES\b/ })).toBeVisible();
    await expect(guide.getByRole("link", { name: /^SCHEDULE EDGE\b/ })).toBeVisible();
    await expect(guide.getByRole("link", { name: /^MODEL RESULTS\b/ })).toBeVisible();
    await expect(guide.getByRole("link", { name: /^PLAYOFF REST\b/ })).toBeVisible();
    await expect(guide.getByRole("link", { name: /^SHOT VALUE\b/ })).toBeVisible();
    await expect(
      guide.getByText(
        "Compare each team's fatigue and rest advantage — by date across any season, or ranked by edge for the games ahead.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "See which teams a season's schedule favored, counted in games with a real rest edge and priced in wins.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "Check how the rest model scored against history — threshold win rates, season trends, and individual games.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "See what surviving a long series costs a team in the round that follows.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "Map expected shooting efficiency by court location and model version.",
      ),
    ).toBeVisible();
  });

  test("remembers dismissal and keeps a GUIDE control for reopening", async ({
    page,
  }) => {
    await page.goto("/");

    const guide = page.getByRole("dialog", { name: "Welcome to FullCourt" });
    await expect(guide).toBeVisible();
    await guide.getByRole("button", { name: "Start Exploring" }).click();
    await expect(guide).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          ONBOARDING_STORAGE_KEY,
        ),
      )
      .toBe(ONBOARDING_STORAGE_VALUE);

    await page.reload();
    await expect(guide).toBeHidden();

    const reopen = page.getByRole("button", { name: "GUIDE", exact: true });
    await reopen.click();
    await expect(guide).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
    await expect(reopen).toBeFocused();
  });
});
