import { expect, test } from "@playwright/test";

test("mobile player identity has room and does not overlap its team", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shooting");
  const row = page.getByTestId("player-row").first();
  await expect(row).toBeVisible({ timeout: 45000 });
  const name = await row.locator("td").nth(1).boundingBox();
  const split = await row.locator("td").nth(7).boundingBox();
  expect(name!.width).toBeGreaterThanOrEqual(120);
  expect(name!.x + name!.width).toBeLessThanOrEqual(split!.x + 1);
  await expect(row.getByRole("button").locator("small")).toBeVisible();
});

for (const route of ["games", "playoffs"]) {
  test(`${route} details change immediately under reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${route}`);
    const control = page.getByRole("button", { name: route === "games" ? /^Expand .* game details$/ : "Expand series details" }).first();
    await expect(control).toBeVisible({ timeout: 45000 });
    await control.click();
    await expect(page.getByRole("button", { name: route === "games" ? /^Collapse .* game details$/ : "Collapse series details" }).first()).toHaveAttribute("aria-expanded", "true");
    const moving = await page.evaluate(() => document.getAnimations().filter((a) =>
      a.playState === "running" && a instanceof CSSTransition &&
      ["grid-template-rows", "rotate", "transform", "translate"].includes(a.transitionProperty)
    ).length);
    expect(moving).toBe(0);
  });
}

test("method sections expose headings and mobile descriptors stay inside their cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/behind-the-data/time-zones");
  const headings = page.locator("main h2");
  expect(await headings.count()).toBeGreaterThan(3);
  const clipped = await page.locator("main section[id]").evaluateAll((sections) => sections.some((section) =>
    [...section.querySelectorAll("h2, h2 ~ span")].some((e) => e.getBoundingClientRect().right > section.getBoundingClientRect().right + 1)
  ));
  expect(clipped).toBe(false);
});

test("shot locations can be inspected by keyboard and pointer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shot-quality");
  const slider = page.getByRole("slider", { name: "Inspect location on GBM court", exact: true });
  await expect(slider).toBeVisible({ timeout: 45000 });
  const before = await slider.getAttribute("aria-valuetext");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).not.toHaveAttribute("aria-valuetext", before!);
  const court = page.getByRole("img", { name: /^GBM: half-court/ });
  await court.click({ position: { x: 100, y: 100 } });
  await expect(slider).not.toHaveValue("1");
  await expect(page.getByRole("status").first()).toContainText("attempts");
});

test("keyboard navigation and palette selection skip cross-fades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      document.documentElement.dataset.auditTransition = "started";
      return original(...args);
    };
  });
  await page.goto("/games");
  await expect(page.getByTestId("selected-date-display")).not.toHaveText("PICK A DATE");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "SEASON REPORT" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/season(?:\?|$)/);
  await expect(page.locator("html")).not.toHaveAttribute("data-audit-transition", "started");
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByPlaceholder("Jump to a surface…");
  await input.fill("officiating");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/officiating$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-audit-transition", "started");
});
