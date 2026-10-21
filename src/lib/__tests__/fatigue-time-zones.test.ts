import { describe, expect, it } from "vitest";
import { calculateFatigue, signedClockShiftHours, venueUtcOffsetHours, type RecentGame } from "@/lib/fatigue";
import { formatEasternDateKey } from "@/lib/nba-season";

const TOKYO = { lat: 35.68, lon: 139.71, zone: "Asia/Tokyo" };
const PHOENIX = { lat: 33.446, lon: -112.071, zone: "America/Phoenix" };
const CHICAGO = { lat: 41.881, lon: -87.674, zone: "America/Chicago" };
const INDIANAPOLIS = { lat: 39.764, lon: -86.155, zone: "America/Indiana/Indianapolis" };
const LOS_ANGELES = { lat: 34.043, lon: -118.267, zone: "America/Los_Angeles" };
const NEW_YORK = { lat: 40.751, lon: -73.993, zone: "America/New_York" };
const LONDON = { lat: 51.503, lon: 0.0032, zone: "Europe/London" };
const PARIS = { lat: 48.839, lon: 2.378, zone: "Europe/Paris" };
type Venue = typeof TOKYO;

function intlOffset(venue: Venue, date: Date): number {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: venue.zone, timeZoneName: "longOffset" })
    .formatToParts(date).find((part) => part.type === "timeZoneName")!.value;
  if (offset === "GMT") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset)!;
  return (Number(match[2]) + Number(match[3]) / 60) * (match[1] === "+" ? 1 : -1);
}
const atNoonUtc = (date: string) => new Date(`${date}T12:00:00Z`);
const calendarDate = (date: string) => new Date(`${date}T00:00:00`);
const game = (date: string, home: Venue, venue = home): RecentGame => ({
  date, isHome: home === venue, teamLat: home.lat, teamLon: home.lon,
  opponentLat: venue.lat, opponentLon: venue.lon, venueLat: venue.lat, venueLon: venue.lon, overtimePeriods: 0,
});
function trip(home: Venue, destination: Venue, date: string, history: RecentGame[]) {
  return calculateFatigue({ gameDate: date, recentGames: history, teamHomeLat: home.lat, teamHomeLon: home.lon,
    currentVenueLat: destination.lat, currentVenueLon: destination.lon, currentGameIsHome: false, isVisitingAltitude: false });
}

describe("known historical venue civil time", () => {
  // Civil authorities: https://www.nict.go.jp/en/sts/jst.html
  // https://www.weather.gov/media/directives/010_pdfs_archived/pd01009044a.pdf
  // https://www.govinfo.gov/content/pkg/FR-2006-01-20/pdf/06-563.pdf
  it.each(["1990-11-02", "1996-11-07", "2003-10-29", "2026-01-15", "2026-07-15"])("matches Japan UTC+9 without seasonal DST on %s", (date) => {
    expect(intlOffset(TOKYO, atNoonUtc(date))).toBe(9);
    expect(venueUtcOffsetHours(TOKYO.lat, TOKYO.lon, calendarDate(date))).toBe(9);
  });

  it.each([
    ["1986-04-06", -6], ["1986-04-26", -6], ["1986-04-27", -5],
    ["1986-10-25", -5], ["1986-10-26", -6],
    ["1987-04-04", -6], ["1987-04-05", -5],
    ["2007-03-10", -6], ["2007-03-11", -5],
  ] as const)("matches Central's historical DST boundary on %s", (date, expected) => {
    expect(intlOffset(CHICAGO, atNoonUtc(date))).toBe(expected);
    expect(venueUtcOffsetHours(CHICAGO.lat, CHICAGO.lon, calendarDate(date))).toBe(expected);
    expect(venueUtcOffsetHours(PHOENIX.lat, PHOENIX.lon, calendarDate(date))).toBe(-7);
    const displaced = trip(CHICAGO, PHOENIX, date, []);
    expect(displaced.features.zoneShiftHours).toBe(-7 - expected);
    expect(displaced.hasTimeZoneDisplacement).toBe(expected === -5);
  });

  it.each([
    ["1986-04-27", -5], ["2005-07-01", -5], ["2005-10-15", -5],
    ["2006-04-01", -5], ["2006-04-02", -4], ["2006-10-29", -5],
  ] as const)("matches Indianapolis's 2006 DST adoption on %s", (date, expected) => {
    expect(intlOffset(INDIANAPOLIS, atNoonUtc(date))).toBe(expected);
    expect(venueUtcOffsetHours(INDIANAPOLIS.lat, INDIANAPOLIS.lon, calendarDate(date))).toBe(expected);
  });

  it.each([LOS_ANGELES, NEW_YORK, CHICAGO, LONDON, PARIS])("preserves ordinary North American and European offsets for $zone", (venue) => {
    for (const date of ["2026-01-15", "2026-07-15"]) {
      expect(venueUtcOffsetHours(venue.lat, venue.lon, calendarDate(date))).toBe(intlOffset(venue, atNoonUtc(date)));
    }
  });
});

describe("date-line clock adjustment", () => {
  it.each([
    [-8, 9, -7], [-7, 9, -8], [-5, 9, -10], [-4, 9, -11],
    [9, -8, 7], [9, -5, 10], [-8, -5, 3], [-5, -8, -3], [0, 12, 12], [12, 0, -12],
  ])("wraps offset %s → %s to signed shift %s", (home, destination, expected) => {
    expect(signedClockShiftHours(home, destination)).toBe(expected);
    expect(signedClockShiftHours(destination, home)).toBe(-expected);
  });

  it("charges USA→Japan as a seven-hour delay and re-entrains after the first Japan game", () => {
    const first = trip(LOS_ANGELES, TOKYO, "1990-11-02", [game("1990-10-30", LOS_ANGELES)]);
    const second = trip(LOS_ANGELES, TOKYO, "1990-11-03", [game("1990-10-30", LOS_ANGELES), game("1990-11-02", LOS_ANGELES, TOKYO)]);
    expect(first.features.zoneShiftHours).toBe(-7);
    expect(first.features.zonesCrossed).toBe(7);
    expect(first.features.jetLagUnits).toBe(0.85);
    expect(second.features.jetLagUnits).toBeCloseTo(0.85 * 6 / 7, 12);
    expect(second.features.zoneShiftHours).toBe(-7);
  });

  it("preserves the model's zero displacement at the US team's true home after Japan", () => {
    const result = calculateFatigue({ gameDate: "1990-11-05", recentGames: [game("1990-11-02", LOS_ANGELES, TOKYO)],
      teamHomeLat: LOS_ANGELES.lat, teamHomeLon: LOS_ANGELES.lon,
      currentVenueLat: LOS_ANGELES.lat, currentVenueLon: LOS_ANGELES.lon, currentGameIsHome: true, isVisitingAltitude: false });
    expect(result.features.zoneShiftHours).toBe(0);
    expect(result.features.jetLagUnits).toBe(0);
    expect(result.hasTimeZoneDisplacement).toBe(false);
    expect(result.roadTripConsecutiveAway).toBe(0);
    expect(result.travelDistanceMiles).toBeGreaterThan(5000);
  });

  it("uses the inverse advance for Japan-to-USA clock adjustment", () => {
    const reverse = trip(TOKYO, LOS_ANGELES, "1990-11-05", [game("1990-11-02", TOKYO)]);
    expect(reverse.features.zoneShiftHours).toBe(7);
    expect(reverse.features.zonesCrossed).toBe(7);
    expect(reverse.features.jetLagUnits).toBe(1.25);
  });
});

describe("body clock on a daylight-saving changeover", () => {
  // The rule turns on the tip's Eastern calendar date. These tips are evening games the night
  // before a changeover Sunday, which is already that Sunday in UTC and in Asia.
  const bodyClock = (tipUtc: string) =>
    calculateFatigue({ gameDate: formatEasternDateKey(new Date(tipUtc)), recentGames: [], teamHomeLat: NEW_YORK.lat,
      teamHomeLon: NEW_YORK.lon, currentVenueLat: NEW_YORK.lat, currentVenueLon: NEW_YORK.lon, currentGameIsHome: true,
      isVisitingAltitude: false, currentTipOffUtc: new Date(tipUtc) }).features.bodyClockHour;

  it.each([
    ["2026-03-08T00:30:00Z", 19.5],
    ["2026-11-01T00:30:00Z", 20.5],
  ])("reads %s at the clock New York showed", (tipUtc, expected) => {
    expect(intlOffset(NEW_YORK, new Date(tipUtc)) + 24 + 0.5).toBe(expected);
    expect(bodyClock(tipUtc)).toBe(expected);
  });
});
