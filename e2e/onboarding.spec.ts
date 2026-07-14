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
    await expect(
      guide.getByRole("link", { name: "Today's Games" })
    ).toBeVisible();
    await expect(guide.getByRole("link", { name: "Analysis" })).toBeVisible();
    await expect(guide.getByRole("link", { name: "Picks" })).toBeVisible();
    await expect(guide.getByRole("link", { name: "Playoffs" })).toBeVisible();
    await expect(
      guide.getByRole("link", { name: "Shot Quality" })
    ).toBeVisible();
    await expect(
      guide.getByText(
        "Browse any regular-season slate and compare each team's fatigue and rest advantage.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "Explore the historical backtest, threshold results, season trends, and individual games.",
      ),
    ).toBeVisible();
    await expect(
      guide.getByText(
        "Find scheduled matchups with a larger modeled rest edge. This is not betting advice.",
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
