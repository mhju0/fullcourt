import { describe, expect, it } from "vitest";
import { publishedSeasonTravelLegs } from "@/lib/season-report-travel";
import { travelLegKey, type TravelGameRow } from "@/lib/season-travel";
import { haversineDistance } from "@/lib/haversine";
import { buildSeasonReport, type SeasonReportRow } from "@/lib/season-report";
import { resolvePhysicalVenue } from "@/lib/physical-venue";

const teams = {
  LAL: [1, 34.043, -118.2673], IND: [2, 39.764, -86.1555], OKC: [3, 35.4634, -97.5151],
  MIL: [4, 43.0451, -87.9172], NYK: [5, 40.7505, -73.9934], SAS: [6, 29.427, -98.4375],
  DAL: [7, 32.7905, -96.8103], ORL: [8, 28.5392, -81.3839], NOP: [9, 29.9489, -90.0821], HOU: [10, 29.7508, -95.3621],
} as const;
type Abbr = keyof typeof teams;
const VEGAS = [36.1028, -115.1783] as const;
function fixture(gameId: number, date: string, home: Abbr, away: Abbr, neutral = false): TravelGameRow {
  const h = teams[home], a = teams[away];
  return { gameId, date, homeTeamId: h[0], awayTeamId: a[0], homeAbbr: home, awayAbbr: away,
    homeLat: String(h[1]), homeLon: String(h[2]), awayLat: String(a[1]), awayLon: String(a[2]), homeAltitude: false, awayAltitude: false,
    overtimePeriods: 0, neutralSite: neutral, neutralVenueCity: neutral ? "Las Vegas" : null };
}
const miles = (a: readonly number[], b: readonly number[]) => haversineDistance(a[0], a[1], b[0], b[1]);
const subject = (a: Abbr) => ({ abbreviation: a, latitude: teams[a][1], longitude: teams[a][2], altitude: false });

describe("published Mileage with non-standings context", () => {
  it.each([
    ["2023-12-07", "2023-12-09", "2023-12-12", "LAL", "IND", "NOP", "DAL"],
    ["2024-12-14", "2024-12-17", "2024-12-19", "OKC", "MIL", "HOU", "ORL"],
    ["2025-12-13", "2025-12-16", "2025-12-18", "NYK", "SAS", "ORL", "IND"],
  ] as const)("keeps the %s → %s Cup final → %s next regular route in Vegas", (before, cupDate, after, host, visitor, semiOpponent, nextHost) => {
    const semi = fixture(1, before, host, semiOpponent, true);
    const cup = fixture(2, cupDate, host, visitor, true);
    const next = fixture(3, after, nextHost, host);
    const resolved = resolvePhysicalVenue({ date: cupDate, homeTeam: subject(host), awayTeam: subject(visitor) });
    expect(resolved.neutralSite).toBe(true);
    expect([resolved.venue.latitude, resolved.venue.longitude]).toEqual(VEGAS);
    const allocated = publishedSeasonTravelLegs([next, cup, semi], new Set([1, 3]));
    expect(allocated.has(travelLegKey(2, teams[host][0]))).toBe(false);
    expect(allocated.get(travelLegKey(3, teams[host][0])))
      .toBeCloseTo(miles(VEGAS, teams[nextHost].slice(1)), 7);
    expect(allocated.get(travelLegKey(1, teams[host][0])))
      .toBeCloseTo(miles(teams[host].slice(1), VEGAS), 7);
  });

  it("folds both inbound and outbound legs into the next target without adding a report game", () => {
    const before = fixture(1, "2023-12-05", "LAL", "DAL");
    const cup = fixture(2, "2023-12-09", "LAL", "IND", true);
    const next = fixture(3, "2023-12-12", "DAL", "LAL");
    const trailing = fixture(4, "2024-04-21", "IND", "LAL");
    const allocated = publishedSeasonTravelLegs([before, cup, next, trailing], new Set([1, 3]));
    const expected = miles(teams.LAL.slice(1), VEGAS) + miles(VEGAS, teams.DAL.slice(1));
    expect(allocated.get(travelLegKey(3, teams.LAL[0]))).toBeCloseTo(expected, 7);
    expect(allocated.size).toBe(4);
    const rows: SeasonReportRow[] = [before, next].map(g => ({ gameId: g.gameId, date: g.date, status: "final", homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, homeScore: 100, awayScore: 90, neutralSite: false,
      home: { fatigueScore: "1", travelLegMiles: allocated.get(travelLegKey(g.gameId, g.homeTeamId))!, isBackToBack: false, isThreeInFour: false, hasTimeZoneDisplacement: false },
      away: { fatigueScore: "4", travelLegMiles: allocated.get(travelLegKey(g.gameId, g.awayTeamId))!, isBackToBack: false, isThreeInFour: false, hasTimeZoneDisplacement: false } }));
    const report = buildSeasonReport("2023-24", rows);
    expect(report.scheduledGames).toBe(2);
    expect(report.completedGames).toBe(2);
    expect(report.teams.find(t => t.teamId === teams.LAL[0])!.travelMiles).toBe(Math.round(expected));
    const unchangedWorth = buildSeasonReport("2023-24", rows.map(r => ({ ...r, home: { ...r.home!, travelLegMiles: 0 }, away: { ...r.away!, travelLegMiles: 0 } })));
    expect(report.teams.map(t => [t.teamId, t.scheduleValueWins])).toEqual(unchangedWorth.teams.map(t => [t.teamId, t.scheduleValueWins]));
  });
});
