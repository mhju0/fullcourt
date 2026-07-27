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
    // Each guide row's link wraps both the label and its description, so the accessible
    // name is label + description — "GAMES" as a link name would match two rows. Assert
    // the label span's exact text instead.
    await expect(guide.getByText("GAMES", { exact: true })).toBeVisible();
    await expect(guide.getByText("SCHEDULE EDGE", { exact: true })).toBeVisible();
    await expect(guide.getByText("MODEL RESULTS", { exact: true })).toBeVisible();
    await expect(guide.getByText("PLAYOFF PREDICTIONS", { exact: true })).toBeVisible();
    await expect(guide.getByText("SHOT VALUE", { exact: true })).toBeVisible();
    await expect(
      guide.getByText(
        "Browse any season's games, past or current, and compare each team's fatigue and rest advantage.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "See which teams a season's schedule favored, in days of rest against their opponents.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "Check how the rest model scored against history — threshold win rates, season trends, and individual games.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "Compare series win probabilities from FullCourt's separate playoff model.",
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
