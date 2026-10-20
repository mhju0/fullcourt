import { expect, test } from "@playwright/test";
import type { AnalysisResponse } from "../src/types";
import { signedNumber } from "../src/lib/signed-number";
import { gapRangeByKey } from "../src/lib/rest-advantage-evidence";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.describe("Rest-focused front door", () => {
  test("keeps the main finding and the routes into its evidence", async ({ page }) => {
    await page.goto("/");
    const home = page.getByTestId("home-findings");
    await expect(home.getByRole("heading", { level: 1, name: "Rest is a stat" })).toBeVisible();
    await expect(home.getByRole("link", { name: "Find a game" })).toHaveAttribute("href", "/games");
    await expect(home.getByRole("link", { name: "Read the model results" })).toHaveAttribute("href", "/analysis");
    await expect(home.getByRole("link", { name: "Compare team schedules" })).toHaveAttribute("href", "/schedule");
    await expect(home.getByRole("link", { name: "Look up a player" })).toHaveAttribute("href", "/shooting");
    await expect(home).toContainText("not a causal estimate");
    await expect(home.getByRole("heading", { name: "What the score is made of" })).toHaveCount(0);
    await expect(home.getByRole("link", { name: "Officiating", exact: true })).toHaveCount(0);
  });

  test("headline rates and samples use the same full completed-season history", async ({ page, request }) => {
    const baselineResponse = await request.get("/api/analysis");
    expect(baselineResponse.ok()).toBe(true);
    const { data: baseline }: { data: AnalysisResponse } = await baselineResponse.json();
    const minGap = gapRangeByKey("large").min;
    const largeGapResponse = await request.get(`/api/analysis?seasonMinRA=${minGap}`);
    expect(largeGapResponse.ok()).toBe(true);
    const { data: large }: { data: AnalysisResponse } = await largeGapResponse.json();
    const seasons = baseline.seasonWinRates.filter((row) => row.isComplete && row.homeGames > 0)
      .sort((a, b) => a.season.localeCompare(b.season));
    const selected = new Set(seasons.map((row) => row.season));
    const largeSeasons = large.seasonWinRates.filter((row) => selected.has(row.season));
    const games = largeSeasons.reduce((sum, row) => sum + row.games, 0);
    const wins = largeSeasons.reduce((sum, row) => sum + row.restedTeamWins, 0);
    const homeGames = seasons.reduce((sum, row) => sum + row.homeGames, 0);
    const homeWins = seasons.reduce((sum, row) => sum + row.homeWins, 0);
    const winPct = wins / games * 100;
    const baselinePct = homeWins / homeGames * 100;
    const latestDate = seasons.map((row) => row.latestEvidenceDate).sort().at(-1);
    await page.goto("/");
    const home = page.getByTestId("home-findings");
    await expect(home.getByTestId("home-evidence-period")).toHaveText(`All completed regular seasons · ${seasons[0].season} to ${seasons.at(-1)!.season}`);
    await expect(home).toContainText(`${games.toLocaleString()} games with a large rest gap (${minGap}+ fatigue-score points)`);
    await expect(home).toContainText(`${winPct.toFixed(1)}%`);
    await expect(home).toContainText(`${baselinePct.toFixed(1)}%`);
    await expect(home).toContainText(`Baseline: ${homeGames.toLocaleString()} games`);
    await expect(home.getByTestId("home-rest-edge")).toHaveText(`${signedNumber(winPct - baselinePct, 1)}\u00a0pp`);
    await expect(home).toContainText(`Rest evidence through ${latestDate}`);
    await expect(home).toContainText("The difference uses unrounded rates");
  });

  test("the hero entrance stays brief and lower content needs no scroll trigger", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const motion = await page.getByTestId("home-findings").evaluate((root) => [...root.querySelectorAll("*")].filter((el) => getComputedStyle(el).animationName !== "none").map((el) => ({
      tag: el.tagName,
      duration: parseFloat(getComputedStyle(el).animationDuration),
      delay: parseFloat(getComputedStyle(el).animationDelay),
    })));
    // The hero entrance, plus the two finding bars drawing once (ADR 0010, amended 2026-10-03).
    expect(motion.map((m) => m.tag)).toEqual(["HEADER", "SPAN", "SPAN"]);
    for (const m of motion) expect(m.duration + m.delay).toBeLessThanOrEqual(.6);
    const hidden = await page.getByTestId("home-findings").locator("section, aside").evaluateAll((els) => els.some((el) => getComputedStyle(el).opacity !== "1"));
    expect(hidden).toBe(false);
  });

  test("reduced motion leaves every finding visible without an entrance", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const root = page.getByTestId("home-findings");
    const animations = await root.evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(animations).toBe(0);
    await expect(root.getByRole("heading", { name: "Rest is a stat" })).toBeVisible();
  });

  test("research and the author introduction have their own working destinations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-findings").getByRole("link", { name: "Explore the research" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole("heading", { name: "Explore", level: 1 })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: /Officiating/ })).toHaveAttribute("href", "/officiating");
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "About FullCourt" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Created by Michael Ju" })).toBeVisible();
    await expect(page.locator("footer")).not.toContainText("RENDERED:");
  });

  test("the primary action opens Games", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Find a game", exact: true }).click();
    await expect(page).toHaveURL(/\/games(?:\?|$)/);
    await expect(page.getByRole("heading", { level: 1, name: "Games" })).toBeVisible();
    expect(await page.locator("#main").evaluate((main) => getComputedStyle(main).containerType)).toBe("normal");
  });

  test.describe("classic scrollbar width", () => {
    for (const width of [390, 1440]) {
      for (const gutter of ["auto", "stable"]) {
        test(`full-bleed home fits the available width with ${gutter} scrollbar gutter at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto("/");
          // A styled scrollbar is a classic one, so overlay-scrollbar hosts (macOS) measure it too.
          await page.addStyleTag({ content: `html { scrollbar-gutter: ${gutter}; } html::-webkit-scrollbar { width: 15px; }` });
          const geometry = await page.getByTestId("home-findings").evaluate((home) => {
            const rect = home.getBoundingClientRect();
            const documentRoot = document.documentElement;
            let queryAncestor = home.parentElement;
            while (queryAncestor && getComputedStyle(queryAncestor).containerType === "normal") {
              queryAncestor = queryAncestor.parentElement;
            }
            const main = document.querySelector("#main")!;
            return {
              viewportWidth: innerWidth,
              availableWidth: documentRoot.clientWidth,
              scrollWidth: documentRoot.scrollWidth,
              homeLeft: rect.left,
              homeRight: rect.right,
              homeWidth: rect.width,
              mainWidth: main.getBoundingClientRect().width,
              mainContainerType: getComputedStyle(main).containerType,
              queryAncestorId: queryAncestor?.id,
            };
          });
          expect(geometry.availableWidth).toBeLessThan(geometry.viewportWidth);
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.availableWidth);
          expect(geometry.homeLeft).toBeCloseTo(0, 1);
          expect(geometry.homeRight).toBeCloseTo(geometry.availableWidth, 1);
          expect(geometry.homeWidth).toBeCloseTo(geometry.mainWidth, 1);
          expect(geometry.mainContainerType).toBe("inline-size");
          expect(geometry.queryAncestorId).toBe("main");
        });
      }
    }
  });

  for (const width of [1280, 390, 375]) {
    test(`findings fit at ${width}px without sideways scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      expect(fits).toBe(true);
      const outside = await page.getByTestId("home-findings").locator("h1, h2, p, a, dt, dd").evaluateAll((els) => els.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map((el) => el.textContent));
      expect(outside).toEqual([]);
    });
  }
});
