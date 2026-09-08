import { expect, test, type Locator } from "@playwright/test";

async function expectFocusIndicator(control: Locator) {
  await expect(control).toBeFocused();
  const indicator = await control.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      visible: el.matches(":focus-visible"),
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      color: style.outlineColor,
    };
  });
  expect(indicator.visible).toBe(true);
  expect(indicator.style).toBe("solid");
  expect(indicator.width).toBeGreaterThanOrEqual(2);
  expect(indicator.color).not.toBe("rgba(0, 0, 0, 0)");
}

for (const route of ["/", "/games"]) {
  test(`keyboard indicators survive component resets on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toBeVisible();
    await page.keyboard.press("Tab");

    const explore = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "EXPLORE" });
    await explore.focus();
    await expectFocusIndicator(explore);

    const search = page.getByRole("button", { name: "JUMP TO PAGE", exact: true });
    await search.focus();
    await expectFocusIndicator(search);
    await page.keyboard.press("Enter");
    const input = page.getByPlaceholder("Jump to a surface…");
    await expectFocusIndicator(input);
    await input.fill("zzzz-no-surface");
    await expect(page.getByText("No surface matches.", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
}

for (const width of [360, 768]) {
  test(`mobile navigation and palette targets hold at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/games", { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const search = page.getByRole("button", { name: "JUMP TO PAGE" });
    await search.focus();
    await expectFocusIndicator(search);
    await page.keyboard.press("Enter");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    const input = palette.getByPlaceholder("Jump to a surface…");
    await expectFocusIndicator(input);
    await expect(input).toHaveCSS("font-size", "16px");
    await expect(palette.getByRole("option")).toHaveCount(12);
    for (const option of await palette.getByRole("option").all()) {
      const box = await option.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await input.fill("behind");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/behind-the-data$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  for (const route of ["/games", "/shooting", "/referees", "/shot-quality", "/behind-the-data"]) {
    test(`controls have touch targets on ${route} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("h1")).toBeVisible();
      const small = await page.locator(
        'main button, main select, main input[type="search"], ' +
        'main label:has(input[type="checkbox"]), header a, nav a, footer a',
      ).evaluateAll((elements) => elements.flatMap((el) => {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) return [];
        return box.width < 44 || box.height < 44
          ? [{ label: el.getAttribute("aria-label") ?? el.textContent?.slice(0, 60), width: box.width, height: box.height }]
          : [];
      }));
      expect(small).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (route === "/games") {
        const previous = await page.getByRole("button", { name: "Previous day" }).boundingBox();
        const next = await page.getByRole("button", { name: "Next day", exact: true }).boundingBox();
        expect(Math.abs(previous!.y - next!.y)).toBeLessThanOrEqual(1);
      }
    });
  }
}
