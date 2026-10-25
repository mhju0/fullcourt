import { expect, test, type Locator } from "@playwright/test";

async function pressFeedback(control: Locator, reduced: boolean) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  const page = control.page();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect.poll(() => control.evaluate((el) => getComputedStyle(el).transform)).toBe(
    reduced ? "none" : "matrix(0.97, 0, 0, 0.97, 0, 0)",
  );
  expect(await control.evaluate((el) => getComputedStyle(el).scale)).toBe("none");
  const transition = await control.evaluate((el) => {
    const css = getComputedStyle(el);
    return { properties: css.transitionProperty, durations: css.transitionDuration };
  });
  expect(transition.durations).toBe(reduced ? "0s" : "0.09s, 0.12s, 0.12s, 0.12s");
  if (!reduced) expect(transition.properties).toBe("transform, box-shadow, background-color, border-color");
  await page.mouse.up();
}

for (const width of [390, 1440]) {
  for (const reduced of [false, true]) {
    test.describe(`${width}px ${reduced ? "reduced" : "normal"} motion`, () => {
      test.use({ viewport: { width, height: 900 } });
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => innerWidth)).toBe(width);
        await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
        expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(reduced);
      });

      test("Analysis charts are inspected on the chart, with a fixed readout", async ({ page }) => {
        await page.goto("/analysis");
        await expect(page.getByRole("heading", { name: "Model Results" })).toBeVisible({ timeout: 60_000 });
        // Gap size, eras, and home court by season. None keeps a floating tooltip or Recharts' own keyboard layer.
        await expect(page.locator(".recharts-wrapper")).toHaveCount(3);
        await expect(page.locator(".recharts-tooltip-wrapper")).toHaveCount(0);
        await expect(page.getByRole("application")).toHaveCount(0);

        const era = page.locator('[aria-describedby="era-chart-help"]');
        const eraReadout = page.getByTestId("era-readout");
        await era.scrollIntoViewIfNeeded();
        const eraGrid = await era.locator(".recharts-cartesian-grid").boundingBox();
        await page.mouse.click(eraGrid!.x + 2, eraGrid!.y + eraGrid!.height / 2);
        await expect(eraReadout).toContainText("1985-86 to");
        await era.focus();
        await page.keyboard.press("End");
        await expect(eraReadout).not.toContainText("1985-86 to");
        await page.keyboard.press("Home");
        await expect(eraReadout).toContainText("1985-86 to");

        const gap = page.locator(".recharts-wrapper").first();
        await gap.scrollIntoViewIfNeeded();
        const gapGrid = await gap.locator(".recharts-cartesian-grid").boundingBox();
        for (const [fraction, label] of [[0.15, "Small"], [0.5, "Medium"], [0.85, "Large"]] as const) {
          await page.mouse.click(gapGrid!.x + gapGrid!.width * fraction, gapGrid!.y + gapGrid!.height / 2);
          await expect(page.getByText(/gap selected ·/)).toContainText(label);
        }
      });

      test("Games arrows and date chips share reduced-motion-safe press feedback", async ({ page }) => {
        await page.goto("/games?season=2025-26&date=2026-04-12");
        const previous = page.getByRole("button", { name: "Previous day", exact: true });
        const next = page.getByRole("button", { name: "Next day", exact: true });
        await expect(previous).toBeEnabled({ timeout: 60_000 });
        await pressFeedback(previous, reduced);
        await expect(next).toBeEnabled();
        await pressFeedback(next, reduced);
        if (width >= 640) {
          const chip = page.getByRole("group", { name: "Date", exact: true }).getByRole("button").first();
          await pressFeedback(chip, reduced);
          await expect(chip).toHaveAttribute("aria-current", "date");
        }
        const before = await page.getByTestId("selected-date-display").textContent();
        await previous.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("selected-date-display")).not.toHaveText(before!);
      });

      test("Analysis drill preserves the gap range and uses the requested scroll behavior", async ({ page }) => {
        await page.goto("/analysis");
        await expect(page.getByLabel("Rest gap filter")).toBeVisible({ timeout: 60_000 });
        await page.evaluate(() => {
          const original = Element.prototype.scrollIntoView;
          Element.prototype.scrollIntoView = function (options) {
            if (this.querySelector('[aria-label="Rest gap filter"]')) {
              this.setAttribute("data-scroll-behavior", typeof options === "object" ? options.behavior ?? "auto" : "auto");
              this.setAttribute("data-scroll-block", typeof options === "object" ? options.block ?? "start" : "start");
            }
            original.call(this, options);
          };
        });
        await page.locator(".recharts-wrapper").first().locator(".recharts-bar-rectangle path").first().click();
        await page.getByRole("button", { name: "Browse selected games", exact: true }).click();
        await expect(page.getByLabel("Rest gap filter")).toHaveValue("small");
        await expect(page.getByLabel("Rested team filter")).toHaveValue("home");
        await expect(page.locator("[data-scroll-behavior]")).toHaveAttribute("data-scroll-behavior", reduced ? "instant" : "smooth");
        await expect(page.locator("[data-scroll-behavior]")).toHaveAttribute("data-scroll-block", "start");
        await expect(page.getByLabel("Rest gap filter")).toBeInViewport();
      });

      test("Games fatigue fills have no width transition", async ({ page }) => {
        await page.goto("/games?season=2025-26&date=2026-04-12");
        const fills = page.locator('[aria-hidden="true"][style*="height: 4px"] > div');
        await expect(fills.first()).toBeAttached({ timeout: 60_000 });
        for (const fill of await fills.all()) {
          expect(await fill.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
          expect(await fill.evaluate((el) => el.style.width)).toMatch(/^\d+(\.\d+)?%$/);
          expect(await fill.evaluate((el) => el.style.background)).toMatch(/var\(--term-(red|blue|neutral)\)/);
        }
        const record = page.getByRole("button", { name: /^Expand .* game details$/ }).first();
        await record.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: /^Collapse .* game details$/ }).first()).toHaveAttribute("aria-expanded", "true");
      });

      test("Schedule guide retains native disclosure and honors reduced motion", async ({ page }) => {
        await page.goto("/schedule?season=2025-26");
        await page.getByText("Show full breakdown", { exact: true }).click();
        const summary = page.locator("summary").filter({ hasText: "WHAT THESE COLUMNS MEAN" });
        await expect(summary).toBeVisible({ timeout: 60_000 });
        const arrow = summary.locator("svg");
        expect(await arrow.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(reduced ? "none" : "transform, translate, scale, rotate");
        if (!reduced) expect(await arrow.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0.2s");
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(summary.locator("..")).toHaveAttribute("open", "");
        await expect.poll(() => arrow.evaluate((el) => getComputedStyle(el).rotate)).toBe("180deg");
        await expect(page.getByText(/positive is always favorable/i)).toBeVisible();
        await summary.click();
        await expect(summary.locator("..")).not.toHaveAttribute("open", "");
      });
    });
  }
}
