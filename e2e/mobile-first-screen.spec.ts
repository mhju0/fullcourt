import { expect, test } from "@playwright/test";

for (const [width, height] of [[375, 812], [402, 874], [420, 912], [440, 956]]) {
  test(`default Shooting shows a complete first player above the dock at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
    await page.goto("/shooting", { waitUntil: "networkidle" });
    const row = page.getByTestId("player-row").first();
    await row.waitFor({ state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    const first = await row.boundingBox();
    const dock = await page.getByRole("navigation", { name: "Bottom navigation", exact: true }).boundingBox();
    expect(first).not.toBeNull();
    expect(dock).not.toBeNull();
    expect(first!.y + first!.height).toBeLessThanOrEqual(dock!.y);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
