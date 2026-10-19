import { describe, expect, it } from "vitest";
import { calculateFatigue, scoreGameFatigue, type FatigueTeam, type RecentGame } from "@/lib/fatigue";
import { rowToRecentGame, type PriorGameRow } from "@/lib/fatigue-recent-games";
import { haversineDistance } from "@/lib/haversine";
import { resolvePhysicalVenue, type VenueTeam } from "@/lib/physical-venue";
import { seasonTravelLegs, travelLegKey } from "@/lib/season-travel";

const SEA: VenueTeam = { abbreviation: "OKC", latitude: 35.4634, longitude: -97.5151, altitude: false };
const UTA: VenueTeam = { abbreviation: "UTA", latitude: 40.7683, longitude: -111.9011, altitude: true };
const TOR: VenueTeam = { abbreviation: "TOR", latitude: 43.6435, longitude: -79.3791, altitude: false };
const BOS: VenueTeam = { abbreviation: "BOS", latitude: 42.3662, longitude: -71.0621, altitude: false };
const fatigueTeam = (team: VenueTeam, id: number): FatigueTeam => ({
  id, abbreviation: team.abbreviation, latitude: String(team.latitude), longitude: String(team.longitude), altitudeFlag: team.altitude,
});
const prior = (date: string, home: VenueTeam, away: VenueTeam): PriorGameRow => ({
  date, homeTeamId: 1, awayTeamId: 2,
  homeAbbr: home.abbreviation, awayAbbr: away.abbreviation,
  homeLat: String(home.latitude), homeLon: String(home.longitude), homeAltitude: home.altitude,
  awayLat: String(away.latitude), awayLon: String(away.longitude), awayAltitude: away.altitude,
  overtimePeriods: 0,
});
const recent = (over: Partial<RecentGame> = {}): RecentGame => ({
  date: "2026-11-01", isHome: true, teamLat: BOS.latitude, teamLon: BOS.longitude,
  opponentLat: UTA.latitude, opponentLon: UTA.longitude, overtimePeriods: 0, ...over,
});
const oneSide = (history: RecentGame[], isHome: boolean, lat = BOS.latitude, lon = BOS.longitude) => calculateFatigue({
  gameDate: "2026-11-03", recentGames: history, currentGameIsHome: isHome,
  teamHomeLat: BOS.latitude, teamHomeLon: BOS.longitude,
  currentVenueLat: lat, currentVenueLon: lon, isVisitingAltitude: false,
});

describe("shared physical venue resolution", () => {
  it("preserves ordinary home coordinates and classification", () => {
    const venue = resolvePhysicalVenue({ date: "2026-11-01", homeTeam: BOS, awayTeam: UTA });
    expect(venue.venue).toEqual({ latitude: BOS.latitude, longitude: BOS.longitude, altitude: false });
    expect(venue.homeCourt).toBe(true);
    expect(venue.neutralSite).toBe(false);
  });

  it("keeps an unknown neutral city neutral while identifying its coordinate fallback", () => {
    const venue = resolvePhysicalVenue({ date: "2026-11-01", homeTeam: BOS, awayTeam: UTA, neutralSite: true, neutralVenueCity: "Unknown future city" });
    expect(venue.homeCourt).toBe(false);
    expect(venue.neutralSite).toBe(true);
    expect(venue.venueSource).toBe("unknown-neutral-fallback");
    const row = rowToRecentGame({ ...prior("2026-11-01", BOS, UTA), neutralSite: true, neutralVenueCity: "Unknown future city" }, 1);
    expect(row.isHome).toBe(false);
    expect(scoreGameFatigue({ game: { date: row.date, neutralSite: true, neutralVenueCity: "Unknown future city" }, homeTeam: fatigueTeam(BOS, 1), awayTeam: fatigueTeam(UTA, 2), homeRecentGames: [], awayRecentGames: [] }).home.roadTripConsecutiveAway).toBe(1);
  });

  it("locates a Tacoma designated home opener without moving the Seattle base", () => {
    const game = prior("1994-11-05", SEA, UTA);
    const resolved = resolvePhysicalVenue({ date: game.date, homeTeam: SEA, awayTeam: UTA });
    expect(resolved.venueSource).toBe("fixture-correction");
    expect(resolved.homeCourt).toBe(true);
    expect(resolved.homeBase.latitude).toBeCloseTo(47.6221, 3);
    expect(resolved.venue.latitude).toBeCloseTo(47.24, 1);
    const row = rowToRecentGame(game, 1);
    expect(row.isHome).toBe(true);
    expect(row.venueLat).toBe(resolved.venue.latitude);
    expect(row.teamLat).toBe(resolved.homeBase.latitude);
    const scored = scoreGameFatigue({ game, homeTeam: fatigueTeam(SEA, 1), awayTeam: fatigueTeam(UTA, 2), homeRecentGames: [], awayRecentGames: [] }).home;
    const legs = seasonTravelLegs([{ ...game, gameId: 10 }]);
    expect(scored.score).toBe(0);
    expect(scored.roadTripConsecutiveAway).toBe(0);
    expect(scored.travelDistanceMiles).toBeGreaterThan(20);
    expect(scored.travelDistanceMiles).toBe(Math.round(legs.get(travelLegKey(10, 1))!));
  });

  it("charges consecutive designated home venues in season Mileage and the rolling model", () => {
    const first = { ...prior("1994-11-05", SEA, UTA), gameId: 1 };
    const second = { ...prior("1994-11-07", SEA, BOS), gameId: 2 };
    const start = rowToRecentGame(first, 1);
    const finish = rowToRecentGame(second, 1);
    const legs = seasonTravelLegs([second, first]);
    const between = haversineDistance(start.venueLat!, start.venueLon!, finish.venueLat!, finish.venueLon!);
    expect(between).toBeGreaterThan(20);
    expect(legs.get(travelLegKey(2, 1))).toBeCloseTo(between, 8);
    const scored = scoreGameFatigue({ game: second, homeTeam: fatigueTeam(SEA, 1), awayTeam: fatigueTeam(BOS, 2), homeRecentGames: [start], awayRecentGames: [] }).home;
    expect(scored.travelDistanceMiles).toBe(Math.round(legs.get(travelLegKey(1, 1))! + between));
    expect(scored.features.homeStandLength).toBe(2);
  });

  it("gives accepted fixture facts precedence over conflicting city and neutral metadata", () => {
    const venue = resolvePhysicalVenue({ date: "1994-11-05", homeTeam: SEA, awayTeam: UTA, neutralSite: true, neutralVenueCity: "Mexico City" });
    expect(venue.venueSource).toBe("fixture-correction");
    expect(venue.neutralSite).toBe(false);
    expect(venue.venue.latitude).toBeCloseTo(47.24, 1);
    const swapped = resolvePhysicalVenue({ date: "1994-11-05", homeTeam: UTA, awayTeam: SEA });
    expect(swapped.venueSource).toBe("dated-home-base");
  });

  it("uses the exact Japan arena instead of the nominal Utah host and its altitude", () => {
    const PHX: VenueTeam = { abbreviation: "PHX", latitude: 33.4457, longitude: -112.0712, altitude: false };
    const date = "1990-11-02";
    const venue = resolvePhysicalVenue({ date, homeTeam: UTA, awayTeam: PHX });
    expect(venue.neutralSite).toBe(true);
    expect(venue.venue.longitude).toBeGreaterThan(130);
    expect(venue.venue.altitude).toBe(false);
    const scored = scoreGameFatigue({ game: { date }, homeTeam: fatigueTeam(UTA, 1), awayTeam: fatigueTeam(PHX, 2), homeRecentGames: [], awayRecentGames: [] });
    expect(scored.home.roadTripConsecutiveAway).toBe(1);
    expect(scored.away.roadTripConsecutiveAway).toBe(1);
    expect(scored.home.altitudeMultiplier).toBe(1);
    expect(scored.away.altitudeMultiplier).toBe(1);
  });

  it("locates the modern Mexico City arena independently of the old Palacio fixture", () => {
    const SAS: VenueTeam = { abbreviation: "SAS", latitude: 29.4270, longitude: -98.4375, altitude: false };
    const MIA: VenueTeam = { abbreviation: "MIA", latitude: 25.7814, longitude: -80.1870, altitude: false };
    const modern = resolvePhysicalVenue({ date: "2022-12-17", homeTeam: SAS, awayTeam: MIA });
    const cityFallback = resolvePhysicalVenue({ date: "2028-12-01", homeTeam: SAS, awayTeam: MIA, neutralSite: true, neutralVenueCity: "Mexico City" });
    expect(modern.venue).toEqual({ latitude: 19.49765, longitude: -99.1752, altitude: true });
    expect(cityFallback.venue).toEqual(modern.venue);
    expect(modern.homeCourt).toBe(false);
    const HOU: VenueTeam = { ...BOS, abbreviation: "HOU" };
    const DAL: VenueTeam = { ...UTA, abbreviation: "DAL" };
    const old = resolvePhysicalVenue({ date: "1997-12-06", homeTeam: DAL, awayTeam: HOU });
    expect(old.venueSource).toBe("fixture-correction");
    expect(haversineDistance(old.venue.latitude, old.venue.longitude, modern.venue.latitude, modern.venue.longitude)).toBeGreaterThan(5);
  });

  it("resolves Toronto's modeled base window without changing its pre-bubble base", () => {
    const at = (date: string) => resolvePhysicalVenue({ date, homeTeam: TOR, awayTeam: BOS }).homeBase;
    expect(at("2020-11-30").latitude).toBe(TOR.latitude);
    expect(at("2020-12-01").latitude).toBeCloseTo(27.9427, 4);
    expect(at("2021-06-30").latitude).toBeCloseTo(27.9427, 4);
    expect(at("2021-07-01").latitude).toBe(TOR.latitude);
    expect(at("2020-07-29").latitude).toBe(TOR.latitude);
  });
});

describe("current streaks and physical travel endpoints", () => {
  it("resets the away streak at home and the home stand away", () => {
    const trip = [recent({ date: "2026-10-28", isHome: false }), recent({ date: "2026-10-30", isHome: false }), recent({ isHome: false })];
    expect(oneSide(trip, true).roadTripConsecutiveAway).toBe(0);
    expect(oneSide(trip, true).features.homeStandLength).toBe(1);
    expect(oneSide([recent()], false, UTA.latitude, UTA.longitude).features.homeStandLength).toBe(0);
    expect(oneSide(trip, false, UTA.latitude, UTA.longitude).roadTripConsecutiveAway).toBe(4);
  });

  it("charges home-to-home movement between actual alternate venues", () => {
    const history = [recent({ venueLat: 41, venueLon: -72 })];
    const result = oneSide(history, true, 40, -73);
    const expected = haversineDistance(BOS.latitude, BOS.longitude, 41, -72) + haversineDistance(41, -72, 40, -73);
    expect(result.travelDistanceMiles).toBe(Math.round(expected));
  });

  it("uses an alternate home endpoint when departing to or returning from a road game", () => {
    const history = [recent({ date: "2026-10-20", venueLat: 41, venueLon: -72 })];
    expect(oneSide(history, false, UTA.latitude, UTA.longitude).travelDistanceMiles)
      .toBe(Math.round(haversineDistance(41, -72, UTA.latitude, UTA.longitude)));
    const road = [recent({ date: "2026-10-20", isHome: false, venueLat: UTA.latitude, venueLon: UTA.longitude })];
    expect(oneSide(road, true, 41, -72).travelDistanceMiles)
      .toBe(Math.round(haversineDistance(UTA.latitude, UTA.longitude, 41, -72)));
  });

  it("retains the one-mile same-building tolerance", () => {
    expect(oneSide([recent({ date: "2026-10-20", venueLat: 40, venueLon: -73 })], true, 40.001, -73).travelDistanceMiles).toBe(0);
  });

  it("uses the first retained game's dated base when the 30-day chain crosses a base boundary", () => {
    const before = rowToRecentGame(prior("2020-11-30", BOS, TOR), 2);
    const result = calculateFatigue({ gameDate: "2020-12-02", recentGames: [before], currentGameIsHome: true,
      teamHomeLat: 27.9427, teamHomeLon: -82.4518, currentVenueLat: 27.9427, currentVenueLon: -82.4518, isVisitingAltitude: false });
    const expected = haversineDistance(TOR.latitude, TOR.longitude, BOS.latitude, BOS.longitude)
      + haversineDistance(BOS.latitude, BOS.longitude, 27.9427, -82.4518);
    expect(result.travelDistanceMiles).toBe(Math.round(expected));
  });
});
