import { describe, expect, it } from "vitest";
import corrections from "@/data/fixture-venue-corrections.json";
import { resolvePhysicalVenue, type VenueTeam } from "@/lib/physical-venue";
import { haversineDistance } from "@/lib/haversine";

const team = (abbreviation: string): VenueTeam => ({ abbreviation, latitude: 0, longitude: 0, altitude: false });
const resolve = (date: string, home: string, away: string) =>
  resolvePhysicalVenue({ date, homeTeam: team(home), awayTeam: team(away) });

describe("primary-adjudicated historical fixture venues", () => {
  it("requires every Atlanta mixed-season home to use a physical fixture override", () => {
    const rows = corrections.fixtures.filter(row => row.homeAbbr === "ATL"
      && row.date >= "1997-07-01" && row.date < "1999-07-01");
    expect(rows).toHaveLength(73);
    expect(rows.filter(row => row.arena.includes("Georgia Dome"))).toHaveLength(44);
    for (const row of rows) {
      const venue = resolve(row.date, row.homeAbbr, row.awayAbbr);
      expect(venue.venueSource).toBe("fixture-correction");
      expect(venue.homeBase).toEqual({ latitude: 33.7573, longitude: -84.3963 });
      expect(venue.homeCourt).toBe(true);
    }
    expect(() => resolve("1998-01-01", "ATL", "BOS")).toThrow("missing its physical venue correction");
  });

  it("keeps the relocated 1992 playoff games home-designated at the actual buildings", () => {
    const vegas = resolve("1992-05-03", "LAL", "POR");
    const anaheim = resolve("1992-05-03", "LAC", "UTA");
    expect(vegas.venue).toEqual({ latitude: 36.104925, longitude: -115.14425, altitude: false });
    expect(anaheim.venue.latitude).toBeCloseTo(33.80228943, 7);
    for (const venue of [vegas, anaheim]) {
      expect(venue.venueSource).toBe("fixture-correction");
      expect(venue.homeCourt).toBe(true);
      expect(venue.neutralSite).toBe(false);
    }
  });

  it("resolves Hamilton, Maple Leaf Gardens, Spectrum and MECCA exceptions", () => {
    expect(resolve("1996-12-26", "TOR", "BKN").venue.latitude).toBeCloseTo(43.25914, 4);
    expect(resolve("1999-02-09", "TOR", "MIL").venueSource).toBe("fixture-correction");
    expect(resolve("2009-03-13", "PHI", "CHI").venue.latitude).toBeCloseTo(39.90428, 4);
    expect(resolve("2017-10-26", "MIL", "BOS").venue.latitude).toBeCloseTo(43.04223, 4);
  });

  it("has exact zero-distance shared LA endpoints, then distinct Intuit and Lakers homes", () => {
    const a = resolve("2024-01-01", "LAL", "LAC");
    const b = resolve("2024-01-02", "LAC", "LAL");
    expect(haversineDistance(a.venue.latitude, a.venue.longitude, b.venue.latitude, b.venue.longitude)).toBe(0);
    const later = resolve("2024-11-01", "LAC", "LAL");
    expect(haversineDistance(later.venue.latitude, later.venue.longitude, later.awayBase.latitude, later.awayBase.longitude)).toBeGreaterThan(5);
  });
});
