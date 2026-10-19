import { describe, expect, it } from "vitest";
import { BUBBLE_CAMPUS } from "@/lib/bubble-venue";
import { scoreGameFatigue, type FatigueTeam } from "@/lib/fatigue";
import { rowToRecentGame, type PriorGameRow } from "@/lib/fatigue-recent-games";
import { resolvePhysicalVenue } from "@/lib/physical-venue";
import { eraCoordinates } from "@/lib/team-era-coordinates";

const DEN: FatigueTeam = { id: 1, abbreviation: "DEN", latitude: "39.7487", longitude: "-105.0077", altitudeFlag: true };
const POR: FatigueTeam = { id: 2, abbreviation: "POR", latitude: "45.5316", longitude: "-122.6668", altitudeFlag: false };
const MEM: FatigueTeam = { id: 3, abbreviation: "MEM", latitude: "35.1382", longitude: "-90.0506", altitudeFlag: false };
const LAL: FatigueTeam = { id: 4, abbreviation: "LAL", latitude: "34.043", longitude: "-118.2673", altitudeFlag: false };
const venueTeam = (t: FatigueTeam) => ({ abbreviation: t.abbreviation, latitude: Number(t.latitude), longitude: Number(t.longitude), altitude: t.altitudeFlag });
const row = (date: string, h: FatigueTeam, a: FatigueTeam): PriorGameRow => ({ date, homeTeamId: h.id, awayTeamId: a.id, homeAbbr: h.abbreviation, awayAbbr: a.abbreviation, homeLat: h.latitude, homeLon: h.longitude, homeAltitude: h.altitudeFlag, awayLat: a.latitude, awayLon: a.longitude, awayAltitude: a.altitudeFlag, overtimePeriods: 0 });

describe("bounded Disney campus geometry", () => {
  it("uses neutral campus venue and operating bases even when the provider calls Denver home", () => {
    const resolved = resolvePhysicalVenue({ date: "2020-08-01", homeTeam: venueTeam(DEN), awayTeam: venueTeam(POR) });
    expect(resolved.venueSource).toBe("bubble-campus");
    expect(resolved.venue).toEqual(BUBBLE_CAMPUS);
    expect(resolved.neutralSite).toBe(true);
    expect(resolved.homeCourt).toBe(false);
    expect(resolved.homeBase).toEqual(resolved.awayBase);
    const scores = scoreGameFatigue({ game: { date: "2020-08-01" }, homeTeam: DEN, awayTeam: POR, homeRecentGames: [], awayRecentGames: [] });
    for (const side of [scores.home, scores.away]) {
      expect(side.score).toBe(0);
      expect(side.travelDistanceMiles).toBe(0);
      expect(side.features.zonesCrossed).toBe(0);
      expect(side.altitudeMultiplier).toBe(1);
      expect(side.roadTripConsecutiveAway).toBe(1);
    }
  });

  it("retains road-streak workload while same-campus and nominal-side changes add no travel", () => {
    const recent = [rowToRecentGame(row("2020-08-01", DEN, POR), POR.id), rowToRecentGame(row("2020-08-03", POR, DEN), POR.id)];
    const result = scoreGameFatigue({ game: { date: "2020-08-05" }, homeTeam: POR, awayTeam: DEN, homeRecentGames: recent, awayRecentGames: [] }).home;
    expect(result.travelDistanceMiles).toBe(0);
    expect(result.features.zonesCrossed).toBe(0);
    expect(result.roadTripConsecutiveAway).toBe(3);
    expect(result.roadSegmentLoadScore).toBeGreaterThan(0);
    expect(result.features.homeStandLength).toBe(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("keeps the play-in and next Portland playoff fixture in the same campus", () => {
    const playIn = rowToRecentGame(row("2020-08-15", POR, MEM), POR.id);
    const result = scoreGameFatigue({ game: { date: "2020-08-18" }, homeTeam: LAL, awayTeam: POR, homeRecentGames: [], awayRecentGames: [playIn] }).away;
    expect(playIn.isHome).toBe(false);
    expect(result.travelDistanceMiles).toBe(0);
    expect(result.daysSinceLastGame).toBe(3);
    expect(result.features.zonesCrossed).toBe(0);
  });

  it("limits the modeled base to participants and the approved inclusive date window", () => {
    for (const d of ["2020-07-30", "2020-10-11"]) expect(eraCoordinates("POR", d, 45.5, -122.6)).toEqual({ latitude: BUBBLE_CAMPUS.latitude, longitude: BUBBLE_CAMPUS.longitude });
    for (const d of ["2020-07-29", "2020-10-12"]) expect(eraCoordinates("POR", d, 45.5, -122.6)).toEqual({ latitude: 45.5, longitude: -122.6 });
    expect(eraCoordinates("DET", "2020-08-01", 42.3, -83.1)).toEqual({ latitude: 42.3, longitude: -83.1 });
  });
});
