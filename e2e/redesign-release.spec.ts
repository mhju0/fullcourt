import { expect, test } from "@playwright/test";

test("mobile Games exposes the complete rest comparison without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games?season=2024-25&date=2024-12-25");
  const edge = page.locator(".fc-game-edge").first();
  await expect(edge).toBeVisible();
  const box = await edge.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(page.locator(".fc-game-header")).toBeHidden();
  await page.getByRole("button", { name: "DEEP DIVE", exact: true }).click();
  const deepBox = await edge.boundingBox();
  expect(deepBox!.x + deepBox!.width).toBeLessThanOrEqual(390);
});

test("mobile shot comparison is optional and keyboard accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shot-quality");
  await expect(page.getByRole("slider", { name: "Inspect location on GBM court", exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Inspect location on BASELINE court", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Compare models", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("slider", { name: "Inspect location on BASELINE court", exact: true })).toBeVisible();
});

test("availability keeps coefficient detail behind a native disclosure", async ({ page }) => {
  await page.goto("/availability");
  const disclosure = page.locator("details").filter({ hasText: "Show coefficient comparison" });
  await expect(disclosure.locator("table")).toBeHidden();
  await disclosure.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(disclosure.locator("table")).toBeVisible();
});

test("reference contents links resolve to semantic sections", async ({ page }) => {
  await page.goto("/behind-the-data/rest-advantage");
  const contents = page.getByRole("navigation", { name: "On this page", exact: true });
  await expect(contents.getByRole("link").first()).toBeVisible();
  const href = await contents.getByRole("link").first().getAttribute("href");
  await expect(page.locator(href!).getByRole("heading", { level: 2 })).toHaveCount(1);
});
