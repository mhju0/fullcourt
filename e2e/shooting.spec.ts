import { expect, test } from "@playwright/test";

/** Client-rendered (ssr: false) over a ~730 KB payload — allow a cold dev compile. */
const READY = { timeout: 45_000 };

async function open(page: import("@playwright/test").Page, name: string) {
  await page.goto("/shooting?year=2025");
  await page.getByTestId("player-row").first().waitFor(READY);
  await page.getByRole("searchbox", { name: "Search player" }).fill(name);
  await page.getByTestId("player-row").first().click();
}

test.describe("Player Shooting by Rest", () => {
  /**
   * The iOS input-zoom floor. Mobile Safari zooms the page when a focused control's font
   * is under 16px and does not zoom back out on blur — this page and /analysis measured
   * worst (docs/ROADMAP.md, 2026-08-04). The fix is raising the control to the threshold
   * at phone widths, never `user-scalable=no`: that is what ESPN, NBA.com, Naver and KBL
   * all ship, and it disables pinch-zoom for everyone to solve a styling problem.
   *
   * Asserted on this page because it carries both control kinds; termSelectClass covers
   * every select that shares the mechanism. The desktop half keeps secondary filters aligned with the season selector.
   */
  test("season and secondary controls share 16px text across viewports", async ({ page }) => {
    const fontOf = (sel: string) =>
      page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize);

    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/shooting?year=2025");
    await expect(page.getByLabel("Search player")).toBeVisible({ timeout: 30_000 });
    expect(await fontOf("select")).toBe("16px");
    expect(await fontOf("input[type=search]")).toBe("16px");

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await fontOf("#pr-season")).toBe("16px");
    expect(await fontOf("#pr-team")).toBe("16px");
    expect(await fontOf("input[type=search]")).toBe("16px");
  });

  test("renders the heading and eyebrow", async ({ page }) => {
    await page.goto("/shooting?year=2025");
    await expect(page.getByRole("heading", { name: "Player Shooting by Rest" })).toBeVisible();
    await expect(page.getByText("PLAYERS · eFG% BY REST")).toBeVisible();
  });

  /**
   * The filters are controlled by the URL. When they read only Next's search params, which
   * catch up with a pushState in a later transition, a changed select snapped back to its old
   * value for a few hundred milliseconds and the table kept the old rows. Read in the same
   * tick as the change, so a lagging re-render cannot pass by being waited for.
   */
  test("a changed filter shows its new value and rows in the same tick", async ({ page }) => {
    await page.goto("/shooting?year=2025");
    await page.getByTestId("player-row").first().waitFor(READY);

    const result = await page.evaluate(() => {
      const rows = () => document.querySelectorAll("[data-testid=player-row]").length;
      const select = document.querySelector<HTMLSelectElement>("#pr-volume")!;
      const before = rows();
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "0");
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { value: select.value, before, after: rows() };
    });
    expect(result.value).toBe("0");
    expect(result.after).toBeGreaterThan(result.before);
  });

  test("an explicitly selected published season has a volume floor already applied", async ({ page }) => {
    await page.goto("/shooting?year=2025");
    await page.getByTestId("player-row").first().waitFor(READY);

    await expect(page.locator("#pr-volume")).toHaveValue("300");
    // The floor has to bite, or "best eFG%" is a list of 180-attempt centres.
    const floored = await page.getByTestId("player-row").count();
    await page.getByText(/^Advanced filters \(/).click();
    await page.selectOption("#pr-volume", "0");
    expect(await page.getByTestId("player-row").count()).toBeGreaterThan(floored);
  });

  test("expands a player into his own seasons, under the same header", async ({ page }) => {
    await open(page, "lebron");

    await expect(page.getByTestId("season-row").first()).toBeVisible();
    await expect(page.getByTestId("career-row")).toHaveCount(1);

    // Expanded records share the browse table header and its column geometry.
    await expect(page.locator("thead")).toHaveCount(1);
    const headerCells = await page.locator("thead th:not([colspan])").count();
    const seasonCells = await page.getByTestId("season-row").first().locator("td").count();
    expect(seasonCells).toBe(headerCells);
  });

  test("the career row equals the seasons printed above it", async ({ page }) => {
    await open(page, "lebron");
    await expect(page.getByTestId("career-row")).toHaveCount(1);

    const sum = await page.getByTestId("season-row").evaluateAll(rows => {
      const attempts = (row: Element, column: number) => Number(row.children[column].textContent?.replace(/[^0-9]/g, "") ?? 0);
      return [3, 5].map(column => rows.reduce((total, row) => total + attempts(row, column), 0));
    });
    const career = page.getByTestId("career-row");
    for (const [index, column] of [4, 6].entries()) {
      const attempts = await career.locator(`td:nth-child(${column})`).textContent();
      expect(Number(attempts!.replace(/[^0-9]/g, ""))).toBe(sum[index]);
    }
  });

  test("finds accented names typed without their accents", async ({ page }) => {
    await page.goto("/shooting?year=2025");
    await page.getByTestId("player-row").first().waitFor(READY);
    await page.getByRole("searchbox", { name: "Search player" }).fill("jokic");
    await expect(page.getByTestId("player-row").first()).toContainText("Jokić");
  });

  test("sorts by rest effect in both directions", async ({ page }) => {
    await page.goto("/shooting?year=2025");
    await page.getByTestId("player-row").first().waitFor(READY);

    // The difference is the default sort (D-141), so the first press flips it.
    const header = page.getByRole("columnheader", { name: /^With rest/ });
    await expect(header).toHaveAttribute("aria-sort", "descending");
    const top = await page.getByTestId("player-row").first().textContent();

    await header.click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(await page.getByTestId("player-row").first().textContent()).not.toBe(top);
  });

  test("career view includes observed totals without requiring a model estimate", async ({ page }) => {
    await page.goto("/shooting?year=career&volume=0");
    await page.getByTestId("player-row").first().waitFor(READY);
    await page.getByRole("searchbox", { name: "Search player" }).fill("Sarunas Marciulionis");
    await expect(page.getByTestId("player-row")).toHaveCount(1);
    await page.getByTestId("player-row").getByRole("button").click();
    await expect(page.getByTestId("career-row")).toBeVisible();
    await expect(page.locator("main")).toContainText("No career estimate is available");
    await expect(page.locator("main")).toContainText("150 attempts in each rest arm");
  });

  test("a ?player= link opens that player directly", async ({ page }) => {
    await page.goto("/shooting?year=2025&player=" + encodeURIComponent("Nikola Jokić"));
    await page.getByTestId("career-row").waitFor(READY);
    await expect(page.getByTestId("player-row").first()).toContainText("Jokić");
    await expect(page.getByTestId("season-row").first()).toBeVisible();
  });

  test("expanding a player writes him into the URL so the view can be shared", async ({ page }) => {
    await open(page, "lebron");
    await expect(page).toHaveURL(/player=LeBron\+James|player=LeBron%20James/);
  });

  test("the team filter narrows the table to one franchise's players", async ({ page }) => {
    await page.goto("/shooting?year=2025");
    await page.getByTestId("player-row").first().waitFor(READY);

    const all = await page.getByTestId("player-row").count();
    await page.getByText(/^Advanced filters \(/).click();
    await page.selectOption("#pr-team", "OKC");
    const okc = await page.getByTestId("player-row").count();
    expect(okc).toBeGreaterThan(0);
    expect(okc).toBeLessThan(all);
    // Every visible team cell belongs to the franchise (the SEA arm matters only in pre-2008 seasons).
    for (const cell of await page.getByTestId("player-row").locator("td:first-child small:first-of-type").allTextContents()) {
      expect(cell).toMatch(/OKC|SEA/);
    }
  });
});

 test("compact mobile rows preserve samples and keyboard expansion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shooting?year=2025");
  const row = page.getByTestId("player-row").first();
  await row.waitFor(READY);
  await expect(page.locator("thead th:not([colspan])")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  // D-141: every shaded difference sits on a white plate, and a group under 50 shots keeps it grey.
  const cells = await page.getByTestId("player-row").evaluateAll(rows => rows.map(row => {
    const shade = row.children[1].querySelector("[data-shade]");
    const shots = [3, 5].map(column => Number(row.children[column].textContent!.replaceAll(",", "")));
    return { shade: shade?.getAttribute("data-shade") ?? null, plate: shade ? getComputedStyle(shade.firstElementChild!).backgroundColor : null, shots };
  }));
  expect(cells.some(cell => cell.shade !== null && cell.shade !== "0")).toBe(true);
  for (const cell of cells) {
    if (cell.shade === null) continue;
    expect(cell.plate).toBe("rgb(255, 255, 255)");
    expect(Math.abs(Number(cell.shade))).toBeLessThanOrEqual(6);
    if (Math.min(...cell.shots) < 50) expect(cell.shade).toBe("0");
  }
  for (const column of [1, 2, 3, 4, 5, 6]) {
    await expect(row.locator(`td:nth-child(${column})`)).toBeVisible();
  }
  for (const column of [4, 6]) await expect(row.locator(`td:nth-child(${column})`)).toHaveText(/^[\d,]+$/);
  const control = row.getByRole("button");
  await expect(control).toHaveAccessibleName(/^Expand .+ shooting details$/);
  await expect(control.locator("svg")).toBeVisible();
  const target = (await control.boundingBox())!;
  expect(target.height).toBeGreaterThanOrEqual(44);
  expect(target.width).toBeGreaterThanOrEqual(44);
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-expanded", "true");
  await expect(control).toHaveAccessibleName(/^Collapse .+ shooting details$/);
  await expect(page.getByTestId("season-row").first()).toBeVisible();
  await page.keyboard.press("Space");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("searchbox").fill("zzzzzzzz");
  await expect(page.getByRole("status").filter({ hasText: "No players match these filters" })).toBeVisible();
 });

test("shooting filter and player links restore the same view", async ({ page }) => {
  await page.goto("/shooting?year=2024&volume=0&q=jokic&certain=1&sort=effect&dir=asc");
  await expect(page.locator("#pr-season")).toHaveValue("2024");
  await expect(page.locator("#pr-volume")).toHaveValue("0");
  await expect(page.getByLabel("Show gaps exceeding one observed standard error")).toBeChecked();
  await page.locator("summary").filter({ hasText: /^Advanced filters/ }).click();
  await page.getByLabel("Show gaps exceeding one observed standard error").uncheck();
  await page.getByTestId("player-row").first().click();
  await page.reload();
  await expect(page.locator("#pr-season")).toHaveValue("2024");
  await expect(page.getByRole("searchbox")).toHaveValue("jokic");
  await expect(page.locator("tr.fc-open")).toHaveCount(1);
  await page.getByLabel("SEASON", { exact: true }).selectOption("2023");
  await page.goBack();
  await expect(page.locator("#pr-season")).toHaveValue("2024");
});

for (const width of [320, 390, 430, 1440]) {
  test(`six single-line columns scroll internally at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, "lebron");
    await expect(page.locator("thead tr")).toHaveCount(2);
    expect(await page.locator("thead tr").first().locator("th").allTextContents()).toEqual(
      ["Player", "With rest ↓eFG pts", "No rest", "2+ days rest"]);
    // The sub-headings carry their group for assistive tech; the leaf header per column.
    // In DOM order these are already column order: Player and With rest from the first row, then the four below.
    const headers = page.locator("thead th:not([colspan])");
    expect(await page.locator("thead tr").nth(1).locator("th").evaluateAll(nodes => nodes.map(node => node.querySelector("button")!.textContent))).toEqual([
      "No rest eFG%", "No rest Shots", "2+ days rest eFG%", "2+ days rest Shots",
    ]);
    await page.getByRole("columnheader", { name: "No rest eFG%", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: /^No rest eFG%/ })).toHaveAttribute("aria-sort", "descending");
    await expect(page).toHaveURL(/sort=noRestEfg/);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const sizes = await page.getByRole("columnheader").filter({ has: page.locator("button") }).evaluateAll(nodes => nodes.map(node => {
      const button = node.querySelector("button")!;
      return { nowrap: getComputedStyle(button).whiteSpace, fontSize: getComputedStyle(button).fontSize, textTransform: getComputedStyle(button).textTransform, fits: button.scrollWidth <= button.clientWidth + 1 };
    }));
    expect(sizes.every(size => size.nowrap === "nowrap" && size.fontSize === "12px" && size.textTransform === "none" && size.fits), JSON.stringify(sizes)).toBe(true);
    const scroll = page.locator(".fc-rest-table");
    await expect(scroll).toHaveCSS("mask-image", "none");
    expect(await scroll.evaluate(node => node.scrollLeft)).toBe(0);
    const firstCountVisible = await page.getByTestId("player-row").first().locator("td").nth(1).evaluate(cell => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const text = range.getBoundingClientRect();
      const wrapper = cell.closest(".fc-rest-table")!;
      const viewport = wrapper.getBoundingClientRect();
      return text.left >= viewport.left && text.right <= viewport.left + wrapper.clientWidth;
    });
    expect(firstCountVisible).toBe(true);
    const pinned = page.getByTestId("player-row").first().locator("td").first();
    const before = (await pinned.boundingBox())!;
    if (width <= 430) expect(before.width).toBeLessThanOrEqual(160);
    await scroll.focus();
    await page.keyboard.press("ArrowRight");
    if (width < 1140) {
      await expect.poll(() => scroll.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      await scroll.evaluate(node => { node.scrollLeft = 300; });
      await page.getByRole("searchbox").focus();
      await expect(scroll).toHaveCSS("mask-image", "none");
      await scroll.evaluate(node => { node.scrollLeft = node.scrollWidth; });
      expect(Math.abs((await pinned.boundingBox())!.x - before.x)).toBeLessThan(1);
    }
    for (const id of ["player-row", "season-row", "career-row"]) {
      const row = page.getByTestId(id).first();
      await expect(row.locator("td")).toHaveCount(6);
      const backgrounds = await row.locator("td").evaluateAll(nodes => [nodes[0], nodes[2]].map(node => getComputedStyle(node).backgroundColor));
      // The pinned cell matches the row; the With rest cell carries its own shade.
      expect(backgrounds[0]).toBe(backgrounds[1]);
      const edges = await row.locator("td").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().right)));
      const headerEdges = await headers.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().right)));
      expect(edges).toEqual(headerEdges);
    }
    await page.getByText("Rest definitions and uncertainty", { exact: true }).click();
    await expect(page.locator("main")).not.toContainText(/2–29|30 or more|30\+|longer absences/);
  });
}

test("attempt columns sort independently and retain zero attempts without rates", async ({ page }) => {
  await page.goto("/shooting?year=2025&volume=0&sort=restedFga&dir=asc");
  await page.getByTestId("player-row").first().waitFor(READY);
  const row = page.getByTestId("player-row").first();
  await expect(row.locator("td").nth(5)).toHaveText("0");
  await expect(row.locator("td").nth(4)).toHaveText("—");
  await expect(row.locator("td").nth(1)).toHaveText("—");
  await row.getByRole("button").click();
  await expect(page.getByTestId("career-row").locator("td").nth(5)).toHaveText(/^[\d,]+$/);
  for (const [label, key, column] of [["No rest Shots", "noRestFga", 3], ["2+ days rest Shots", "restedFga", 5]] as const) {
    const header = page.getByRole("columnheader", { name: new RegExp(`^${label.replace("+", "\\+")}`) });
    await header.click();
    await expect(page).toHaveURL(new RegExp(`sort=${key}`));
    await page.reload();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    const descending = await page.getByTestId("player-row").evaluateAll((nodes, col) => nodes.map(node => Number(node.children[col].textContent!.replaceAll(",", ""))), column);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    await header.click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    const ascending = await page.getByTestId("player-row").evaluateAll((nodes, col) => nodes.map(node => Number(node.children[col].textContent!.replaceAll(",", ""))), column);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
  }
});
