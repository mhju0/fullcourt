import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AvailabilityPage from "@/app/behind-the-data/availability/page";
import PlayoffPredictionsPage from "@/app/behind-the-data/playoff-predictions/page";
import RestAdvantagePage from "@/app/behind-the-data/rest-advantage/page";
import ScheduleEdgePage from "@/app/behind-the-data/schedule-edge/page";
import benchmark from "@/data/win-total-benchmark.json";
import { AVAILABILITY_SCHEDULE_HOLDS_UP } from "@/lib/availability-facts";
import { PLAYOFF_ROUND_SPLIT } from "@/lib/playoff-rest-facts";
import { RESTED_AT_HOME, RESTED_ON_ROAD, RESTED_ON_ROAD_BY_ERA } from "@/lib/rest-split-facts";
import { signedNumber } from "@/lib/signed-number";

/**
 * The method-table rules of D-144: a table whose data has wins writes the rate first with
 * `W / G` beneath it (D-143), and a clear better/worse comparison takes the D-140 pair.
 */

const NBSP = " ";
const count = (wins: number, games: number) =>
  `${wins.toLocaleString()}${NBSP}/${NBSP}${games.toLocaleString()}`;

/** Every coloured figure on the page, as [colour, text]. */
function coloured(html: string): [string, string][] {
  return [...html.matchAll(/color:var\(--term-(better|worse)-text\)[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
}

describe("Rest Advantage method tables", () => {
  const html = renderToStaticMarkup(RestAdvantagePage());

  it("writes wins over games under every rate", () => {
    const rows = [
      RESTED_AT_HOME,
      RESTED_ON_ROAD,
      ...RESTED_ON_ROAD.ranges,
      ...RESTED_ON_ROAD_BY_ERA,
    ];
    for (const row of rows) expect(html).toContain(count(row.wins, row.games));
  });

  it("colours each gap by its sign", () => {
    const gaps = coloured(html).filter(([, text]) => /^[+−]\d/.test(text));
    expect(gaps.length).toBeGreaterThanOrEqual(2 + RESTED_ON_ROAD_BY_ERA.length);
    for (const [tone, text] of gaps) expect(tone).toBe(text.startsWith("+") ? "better" : "worse");
  });
});

describe("Schedule Edge market check", () => {
  it("writes overs over team-seasons under every share", () => {
    const html = renderToStaticMarkup(ScheduleEdgePage());
    for (const b of benchmark.buckets) expect(html).toContain(count(b.overs, b.n));
  });
});

describe("Playoff Predictions comparisons", () => {
  const html = renderToStaticMarkup(PlayoffPredictionsPage());

  it("colours the model's round accuracy against the home-court rule", () => {
    const figures = coloured(html);
    for (const slice of [PLAYOFF_ROUND_SPLIT.roundsTwoPlus, PLAYOFF_ROUND_SPLIT.roundOne]) {
      const tone = slice.model > slice.baseline ? "better" : "worse";
      expect(figures).toContainEqual([tone, slice.model.toFixed(1)]);
    }
  });

  it("no longer paints a verdict blue", () => {
    expect(html).not.toMatch(/term-blue-text[^>]*>[^<]*BETTER/);
    expect(coloured(html).some(([tone, text]) => tone === "better" && text.endsWith("% BETTER"))).toBe(true);
  });
});

describe("Availability schedule terms", () => {
  it("prints the shrink as a negative change", () => {
    const html = renderToStaticMarkup(AvailabilityPage());
    for (const t of Object.values(AVAILABILITY_SCHEDULE_HOLDS_UP)) {
      expect(html).toContain(`>${signedNumber(-t.shiftPct, 1)}<`);
    }
  });
});
