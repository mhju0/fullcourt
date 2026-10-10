import { describe, expect, it } from "vitest";
import { calculateFatigue } from "@/lib/fatigue";
import { rowToRecentGame } from "@/lib/fatigue-recent-games";
import { haversineDistance } from "@/lib/haversine";
import { seasonTravelLegs, travelLegKey, type TravelGameRow } from "@/lib/season-travel";

const BOS = { id: 1, abbr: "BOS", lat: "42.3662", lon: "-71.0621" };
const NYK = { id: 2, abbr: "NYK", lat: "40.7505", lon: "-73.9934" };
const DEN = { id: 3, abbr: "DEN", lat: "39.7487", lon: "-105.0077" };
const LAL = { id: 4, abbr: "LAL", lat: "34.0430", lon: "-118.2673" };

type Club = typeof BOS;

function fixture(gameId: number, date: string, home: Club, away: Club): TravelGameRow {
  return {
    gameId,
    date,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeAbbr: home.abbr,
    awayAbbr: away.abbr,
    homeLat: home.lat,
    homeLon: home.lon,
    homeAltitude: false,
    awayLat: away.lat,
    awayLon: away.lon,
    awayAltitude: false,
    overtimePeriods: 0,
    neutralSite: false,
    neutralVenueCity: null,
  };
}

const miles = (a: Club, b: Club) =>
  haversineDistance(Number(a.lat), Number(a.lon), Number(b.lat), Number(b.lon));

// Boston: home, at New York, at Denver, home.
const SEASON = [
  fixture(1, "2026-11-01", BOS, LAL),
  fixture(2, "2026-11-03", NYK, BOS),
  fixture(3, "2026-11-05", DEN, BOS),
  fixture(4, "2026-11-07", BOS, NYK),
];

describe("seasonTravelLegs", () => {
  it("charges each flight once, to the game it arrives at", () => {
    const legs = seasonTravelLegs(SEASON);

    expect(legs.get(travelLegKey(1, BOS.id))).toBe(0);
    expect(legs.get(travelLegKey(2, BOS.id))).toBeCloseTo(miles(BOS, NYK), 6);
    // Road game to road game: no flight home in between.
    expect(legs.get(travelLegKey(3, BOS.id))).toBeCloseTo(miles(NYK, DEN), 6);
    expect(legs.get(travelLegKey(4, BOS.id))).toBeCloseTo(miles(DEN, BOS), 6);
  });

  it("starts a visiting team's season with the flight from its own arena", () => {
    const legs = seasonTravelLegs(SEASON);
    expect(legs.get(travelLegKey(1, LAL.id))).toBeCloseTo(miles(LAL, BOS), 6);
  });

  it("adds up to the 7-day figure the fatigue model stores for the last game", () => {
    // The stored figure is a rolling window, so summing it across games counts one flight
    // several times. The legs here are the same flights counted once: over a stretch that fits
    // inside one window the two totals have to agree.
    const legs = seasonTravelLegs(SEASON);
    const total = SEASON.reduce((sum, g) => sum + legs.get(travelLegKey(g.gameId, BOS.id))!, 0);

    const stored = calculateFatigue({
      gameDate: "2026-11-07",
      recentGames: SEASON.slice(0, 3).map((g) => rowToRecentGame(g, BOS.id)),
      isVisitingAltitude: false,
      teamHomeLat: Number(BOS.lat),
      teamHomeLon: Number(BOS.lon),
      currentVenueLat: Number(BOS.lat),
      currentVenueLon: Number(BOS.lon),
      currentGameIsHome: true,
      currentTipOffUtc: null,
    }).travelDistanceMiles;

    expect(Math.round(total)).toBe(stored);
  });

  it("treats a neutral-site game as a road game for both teams", () => {
    const paris: TravelGameRow = {
      ...fixture(9, "2027-01-14", BOS, NYK),
      neutralSite: true,
      neutralVenueCity: "Paris",
    };
    const legs = seasonTravelLegs([paris]);
    expect(legs.get(travelLegKey(9, BOS.id))!).toBeGreaterThan(3000);
    expect(legs.get(travelLegKey(9, NYK.id))!).toBeGreaterThan(3000);
  });
});
