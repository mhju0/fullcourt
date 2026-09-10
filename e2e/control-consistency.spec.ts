import { expect, test } from "@playwright/test";

for (const width of [1280, 768, 390]) {
  test(`Analysis filters stay equal and usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/analysis");
    const filters = page.locator(".fc-filter-grid select");
    await expect(filters).toHaveCount(4, { timeout: 60_000 });
    const boxes = await filters.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    expect(boxes.every((box) => box.height === 44)).toBe(true);
    expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThan(1);
    await filters.first().focus();
    await expect(filters.first()).toBeFocused();
    expect(await filters.first().evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    await page.getByLabel("Team filter", { exact: true }).selectOption("BOS");
    await expect(page.getByRole("button", { name: "CLEAR FILTERS" })).toBeVisible();
    await page.getByRole("button", { name: "CLEAR FILTERS" }).click();
    await expect(page.getByLabel("Team filter", { exact: true })).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`Season result and explanation have a visible boundary at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/season?season=2025-26");
    const result = page.locator(".fc-report-summary");
    await expect(result).toBeVisible({ timeout: 60_000 });
    const interpretation = page.locator(".fc-report-interpretation");
    const boundary = await interpretation.evaluate((element) => {
      const style = getComputedStyle(element);
      return { top: style.borderTopWidth, left: style.borderLeftWidth, background: style.backgroundColor, parentBackground: getComputedStyle(element.parentElement!).backgroundColor };
    });
    expect(width >= 768 ? boundary.left : boundary.top).toBe("1px");
    expect(boundary.background).not.toBe(boundary.parentBackground);
    await expect(page.locator(".fc-report-section")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
