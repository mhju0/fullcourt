import type { FatigueInfo, GameDateCount, GameResponse } from "../../src/types";

const homeFatigue: FatigueInfo = {
  score: 1, isBackToBack: false, is3In4: false, travelDistanceMiles: 0,
  altitudePenalty: false, altitudeArenaLabel: null, daysRest: 3, gamesInLast7Days: 2,
  gamesInLast30Days: 10, is4In6: false, isOvertimePenalty: false,
  roadTripConsecutiveAway: 0, hasTimeZoneDisplacement: false,
};
const awayFatigue: FatigueInfo = {
  ...homeFatigue, score: 4, isBackToBack: true, daysRest: 1, gamesInLast7Days: 3,
  travelDistanceMiles: 200, roadTripConsecutiveAway: 2,
};

// Synthetic scores, IDs and schedules exercise rendering; they are not historical evidence.
export function releaseDates(season: string): GameDateCount[] {
  const year = season.slice(0, 4);
  return ["12-24", "12-25", "12-26", "01-02"].map(day => ({
    date: `${day.startsWith("01") ? Number(year) + 1 : year}-${day}`, gameCount: 1,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export function releaseGame(date: string): GameResponse {
  const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
  return {
    id: Number(date.replaceAll("-", "")), externalId: `smoke-${date}`, date,
    season: `${year}-${String(year + 1).slice(-2)}`, status: "final",
    tipOffEt: "7:00 PM ET", tipOffUtc: new Date(`${date}T19:00:00-05:00`).toISOString(),
    homeTeam: { id: 1, name: "Celtics", abbreviation: "BOS", city: "Boston" },
    awayTeam: { id: 2, name: "Nets", abbreviation: "BKN", city: "Brooklyn" },
    homeScore: 110, awayScore: 100, homeFatigue, awayFatigue,
    restAdvantage: { differential: 3, advantageTeam: "home" }, projectedFatigue: false,
    seasonOpeners: { home: false, away: false },
  };
}
