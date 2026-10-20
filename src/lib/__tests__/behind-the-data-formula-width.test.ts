import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AvailabilityPage from "@/app/behind-the-data/availability/page";
import DataAndLimitsPage from "@/app/behind-the-data/data-and-limits/page";
import OfficiatingPage from "@/app/behind-the-data/officiating/page";
import PlayerShootingPage from "@/app/behind-the-data/player-shooting/page";
import PlayoffPredictionsPage from "@/app/behind-the-data/playoff-predictions/page";
import RefereesPage from "@/app/behind-the-data/referees/page";
import RestAdvantagePage from "@/app/behind-the-data/rest-advantage/page";
import ScheduleEdgePage from "@/app/behind-the-data/schedule-edge/page";
import ShotValuePage from "@/app/behind-the-data/shot-value/page";
import TimeZonesPage from "@/app/behind-the-data/time-zones/page";

/**
 * The widest formula line that fits a 375px phone without sideways scrolling: the Formula
 * block leaves about 274px for 12px Geist Mono, whose 7.2px advance fits 38 characters. A
 * wider line still scrolls, but the right-hand half of the arithmetic then starts off-screen.
 */
const MAX_FORMULA_CHARS = 38;

const PAGES = {
  "rest-advantage": RestAdvantagePage,
  "schedule-edge": ScheduleEdgePage,
  "playoff-predictions": PlayoffPredictionsPage,
  "player-shooting": PlayerShootingPage,
  "shot-value": ShotValuePage,
  availability: AvailabilityPage,
  officiating: OfficiatingPage,
  referees: RefereesPage,
  "time-zones": TimeZonesPage,
  "data-and-limits": DataAndLimitsPage,
};

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("Behind the Data formulas fit a phone", () => {
  for (const [slug, Page] of Object.entries(PAGES)) {
    it(`keeps every formula line on ${slug} within ${MAX_FORMULA_CHARS} characters`, () => {
      const html = renderToStaticMarkup(Page());
      const lines = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].flatMap((m) => decode(m[1]).split("\n"));
      const wide = lines.filter((line) => [...line].length > MAX_FORMULA_CHARS);
      expect(wide).toEqual([]);
    });
  }
});
