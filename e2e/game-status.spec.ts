import { expect, test } from "@playwright/test";
import { releaseGame } from "./fixtures/release-data";

// Synthetic API fixtures exercise presentation, never historical status or provider correctness.
for (const status of ["postponed", "cancelled"] as const) {
  for (const hours of [0, 3, 12]) {
    for (const width of [390, 1280]) {
      test(`${status} stays explicit at tip+${hours}h, ${width}px`, async ({ page }) => {
        const date = "2026-10-20";
        const game = {...releaseGame(date),status,homeScore:null,awayScore:null,homeFatigue:null,awayFatigue:null,restAdvantage:null};
        await page.setViewportSize({width,height:844});
        await page.clock.setFixedTime(new Date(Date.parse(game.tipOffUtc!) + hours*3_600_000));
        await page.route("**/api/**", async route => {
          const path = new URL(route.request().url()).pathname;
          let data: unknown = [];
          if (path === "/api/games/dates") data=[{date,gameCount:1}];
          else if (path === "/api/analysis") data={thresholds:[]};
          else if (path === `/api/games/${date}`) data=[game];
          else if (path === "/api/games/team") data=[{
            id:game.id,date,tipOffEt:game.tipOffEt,tipOffUtc:game.tipOffUtc,status,isHome:true,neutralCity:null,
            opponent:game.awayTeam,teamScore:null,opponentScore:null,restAdvantage:null,projectedFatigue:false,
          }];
          await route.fulfill({json:{data,error:null}});
        });
        await page.goto(`/games?season=2026-27&date=${date}`);
        const row = page.getByRole("button",{name:new RegExp(`Expand .*${status}.* game details`)});
        await expect(row).toBeVisible();
        await expect(row).toContainText(status.toUpperCase());
        await expect(row).not.toContainText(/LIVE|PENDING|0–0/);
        await row.click();
        await expect(page.getByRole("button",{name:new RegExp(`Collapse .*${status}.* game details`)})).toBeVisible();
        await page.goto("/games/team?season=2026-27&team=BOS");
        const teamRow=page.getByTestId("team-game-row");
        await expect(teamRow).toContainText(status.toUpperCase());
        await expect(teamRow).not.toContainText(/LIVE|PENDING|0–0/);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      });
    }
  }
}
