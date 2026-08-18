import { describe, expect, it } from "vitest";
import {
  neutralizeIfUnplayed,
  rowToRecentGame,
  type PriorGameRow,
} from "@/lib/fatigue-recent-games";

/**
 * The projection basis. `fetchRecentGamesForTeam` itself needs a database, but the rule that
 * makes projection honest — which inputs survive an unplayed prior game and which do not — is
 * pure and is pinned here.
 */

const BOS = { lat: "42.3662", lon: "-71.0621" };
const DEN = { lat: "39.7487", lon: "-105.0077" };

function row(over: Partial<PriorGameRow & { status: string }> = {}): PriorGameRow & {
  status: string;
} {
  return {
    date: "2027-01-14",
    homeTeamId: 1,
    awayTeamId: 2,
    homeAbbr: "DEN",
    awayAbbr: "BOS",
    homeLat: DEN.lat,
    homeLon: DEN.lon,
    homeAltitude: true,
    awayLat: BOS.lat,
    awayLon: BOS.lon,
    awayAltitude: false,
    overtimePeriods: 2,
    tipOffUtc: new Date("2027-01-15T02:00:00Z"),
    homeScore: 130,
    awayScore: 92,
    neutralSite: false,
    neutralVenueCity: null,
    status: "final",
    ...over,
  };
}

describe("neutralizeIfUnplayed", () => {
  it("leaves a played game completely alone", () => {
    const played = row({ status: "final" });
    expect(neutralizeIfUnplayed(played)).toBe(played);
  });

  it("drops overtime and both scores from a scheduled game", () => {
    const out = neutralizeIfUnplayed(row({ status: "scheduled" }));
    expect(out.overtimePeriods).toBe(0);
    expect(out.homeScore).toBeNull();
    expect(out.awayScore).toBeNull();
  });

  it("drops a live game's partial score, which is not a final margin", () => {
    // The case column defaults would not have covered: a live row carries a real score, and
    // reading it as a blowout would discount fatigue off a game that is not over.
    const out = neutralizeIfUnplayed(row({ status: "live", homeScore: 61, awayScore: 44 }));
    expect(out.homeScore).toBeNull();
    expect(out.awayScore).toBeNull();
    expect(out.overtimePeriods).toBe(0);
  });

  it("keeps every schedule-derived field, which is what makes projection possible", () => {
    const out = neutralizeIfUnplayed(row({ status: "scheduled" }));
    expect(out.date).toBe("2027-01-14");
    expect(out.homeTeamId).toBe(1);
    expect(out.awayTeamId).toBe(2);
    expect(out.homeAltitude).toBe(true);
    expect(out.tipOffUtc).toEqual(new Date("2027-01-15T02:00:00Z"));
    expect(out.neutralSite).toBe(false);
  });
});

describe("a projected prior game, read as the model reads it", () => {
  it("reports no overtime and no point margin, and keeps venue and travel intact", () => {
    const projected = rowToRecentGame(neutralizeIfUnplayed(row({ status: "scheduled" })), 2);
    expect(projected.overtimePeriods).toBe(0);
    expect(projected.pointMargin).toBeNull();

    // The away team's own coordinates, the opponent's, and the venue's altitude all survive —
    // these are the inputs the travel and altitude terms run on.
    expect(projected.isHome).toBe(false);
    expect(projected.venueAltitude).toBe(true);
    expect(projected.teamLat).toBeCloseTo(42.3662, 4);
    expect(projected.opponentLat).toBeCloseTo(39.7487, 4);
  });

  it("differs from the same game played, in exactly two fields", () => {
    const played = rowToRecentGame(row({ status: "final" }), 2);
    const projected = rowToRecentGame(neutralizeIfUnplayed(row({ status: "scheduled" })), 2);

    expect(played.overtimePeriods).toBe(2);
    expect(played.pointMargin).toBe(38);

    const withoutResults = (g: typeof played) => {
      const copy = { ...g };
      delete (copy as Partial<typeof played>).overtimePeriods;
      delete (copy as Partial<typeof played>).pointMargin;
      return copy;
    };
    expect(withoutResults(projected)).toEqual(withoutResults(played));
  });
});
