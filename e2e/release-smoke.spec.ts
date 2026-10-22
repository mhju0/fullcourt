import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const errors = new WeakMap<Page, string[]>();

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([]);
}

test.beforeEach(async ({ page }, info) => {
  await page.clock.setFixedTime(new Date("2026-09-15T17:00:00Z"));
  const unexpected: string[] = [];
  errors.set(page, unexpected);
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  page.on("pageerror", error => unexpected.push(error.message));
  page.on("response", response => {
    if (response.url().includes("/api/") && response.status() >= 400) unexpected.push(`${response.status()} ${response.url()}`);
  });
  info.annotations.push({ type: "fixture", description: "Synthetic API data; built application; no database or provider access" });
  const response = await page.goto("/games?season=2024-25&date=2024-12-25");
  info.annotations.push({ type: "runtime", description: response!.headers()["x-fullcourt-fixture-runtime"] });
  await expect(page.getByRole("button", { name: /^Expand .* game details$/ })).toHaveCount(1);
  await expect(page.getByLabel("SEASON", { exact: true })).toHaveValue("2024-25");
  expect(unexpected).toEqual([]);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test("Games filters, URL state and opened matchup work with keyboard", async ({ page }, info) => {
  const row = page.getByRole("button", { name: /^Expand .* game details$/ });
  await expect(row).toContainText("110");
  await row.focus();
  await page.keyboard.press("Enter");
  const opened = page.getByRole("button", { name: /^Collapse .* game details$/ });
  await expect(opened).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/game=20241225/);
  await expect(page.getByText("AWAY · BKN", { exact: true })).toBeVisible();
  await expectAccessible(page);
  const screenshot = info.outputPath("games-opened.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach("Opened matchup", { path: screenshot, contentType: "image/png" });
  await page.keyboard.press("Space");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(row).toBeFocused();
  const season = page.getByLabel("SEASON", { exact: true });
  await season.selectOption("2023-24");
  await expect(page).toHaveURL(/season=2023-24/);
  await expect(page).not.toHaveURL(/game=/);
  if (info.project.name.startsWith("phone")) await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "JAN", exact: true }).click();
  await expect(page).toHaveURL(/date=2024-01-02/);
  await expect(page.getByTestId("selected-date-display")).toContainText("JANUARY 2, 2024");
  await expect(page.getByRole("button", { name: /^Expand .* game details$/ })).toHaveCount(1);
});

test("opened command palette is accessible and Escape returns opener focus", async ({ page }, info) => {
  const opener = page.getByRole("button", { name: "Find a page", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  const input = palette.getByPlaceholder("Jump to a surface…");
  await expect(input).toBeFocused();
  await expectAccessible(page);
  const screenshot = info.outputPath("palette-opened.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach("Opened palette", { path: screenshot, contentType: "image/png" });
  await input.fill("zzzz-no-surface");
  await expect(palette.getByText("No surface matches.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(opener).toBeFocused();
});

test("palette shortcut returns focus and keyboard selection navigates", async ({ page }) => {
  const season = page.getByLabel("SEASON", { exact: true });
  await season.focus();
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Jump to a surface…");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(season).toBeFocused();
  await page.keyboard.press("Control+k");
  await input.fill("how it was built");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/how-it-was-built$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("calendar selects a date and preserves keyboard focus", async ({ page }, info) => {
  const phone = info.project.name.startsWith("phone");
  const toggle = page.getByRole("button", { name: "Calendar", exact: true });
  if (phone) {
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
  const calendar = page.locator("#games-calendar");
  await expect(calendar).toBeVisible();
  await expectAccessible(page);
  const day = calendar.getByRole("button", { name: /December 26, 2024/i }).filter({ visible: true });
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/date=2024-12-26/);
  if (phone) {
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
  } else await expect(day).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("rapid palette reopening keeps input focus and navigation does not refocus the old page", async ({ page }) => {
  const opener = page.getByRole("button", { name: "Find a page", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const input = page.getByPlaceholder("Jump to a surface…");
  await expect(input).toBeFocused();
  await input.evaluate(element => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
  await expect(input).toBeFocused();
  await page.waitForTimeout(100);
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(input).toBeFocused();
  await input.fill("how it was built");
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-keyshortcuts]')!;
    const focus = button.focus.bind(button);
    button.focus = options => { button.dataset.paletteRestore = "called"; focus(options); };
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/how-it-was-built$/);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(opener).not.toHaveAttribute("data-palette-restore", "called");
});

test("Games press feedback honors reduced motion", async ({ page }, info) => {
  const reduced = info.project.name === "phone-reduced";
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(reduced);
  const previous = page.getByRole("button", { name: "Previous day", exact: true });
  await expect(previous).toBeEnabled();
  await previous.scrollIntoViewIfNeeded();
  const box = await previous.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect.poll(() => previous.evaluate(el => getComputedStyle(el).transform)).toBe(reduced ? "none" : "matrix(0.97, 0, 0, 0.97, 0, 0)");
  if (reduced) expect(await previous.evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0s");
  await page.mouse.up();
});
