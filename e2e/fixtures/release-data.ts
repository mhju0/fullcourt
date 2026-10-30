import type { FatigueInfo, GameDateCount, GameResponse, ShotQualityResponse } from "../../src/types";

const homeFatigue: FatigueInfo = {
  score: 1, isBackToBack: false, is3In4: false, travelDistanceMiles: 0,
  altitudePenalty: false, altitudeArenaLabel: null, daysRest: 2, gamesInLast7Days: 2,
  gamesInLast30Days: 10, is4In6: false, isOvertimePenalty: false,
  roadTripConsecutiveAway: 0, hasTimeZoneDisplacement: false,
};
const awayFatigue: FatigueInfo = {
  ...homeFatigue, score: 4, isBackToBack: true, daysRest: 0, gamesInLast7Days: 3,
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
    restAdvantage: { differential: 3, advantageTeam: "home" }, projectedFatigue: false, neutralCity: null,
    seasonOpeners: { home: false, away: false },
  };
}

// Synthetic raw cells and publication metadata exercise the NBA-web display contract only.
export const releaseRawShotQuality: ShotQualityResponse = {
  season: "2024-25", latestPublishedSeason: "2024-25", previousPublishedSeason: "2023-24", activeModel: "gbm-v1",
  cells: [
    { cellX: 0, cellY: 1, zoneBasic: null, zoneRange: null, zoneArea: null, fga: 10, fgm: 4, fg3a: 0, fg3m: 0, gbm: null, baseline: null },
    { cellX: 21, cellY: 3, zoneBasic: null, zoneRange: null, zoneArea: null, fga: 4, fgm: 1, fg3a: 4, fg3m: 1, gbm: null, baseline: null },
    { cellX: 8, cellY: 18, zoneBasic: null, zoneRange: null, zoneArea: null, fga: 6, fgm: 2, fg3a: 0, fg3m: 0, gbm: null, baseline: null },
  ],
  meta: { cellCount: 3, totalFga: 20, publication: {
    source: "nba-web-snapshot", updateStatus: "published", checkedAt: "2024-12-25T13:00:00Z",
    generatedAt: "2024-12-25T12:00:00Z", firstGameDate: "2024-12-24", lastGameDate: "2024-12-24",
    gameCount: 1, sourceShotCount: 20, droppedShotCount: 0,
    models: {
      "gbm-v1": { coveredCells: 0, totalCells: 3, ready: false, trainingPeriod: null },
      "baseline-zone-v1": { coveredCells: 0, totalCells: 3, ready: false, trainingPeriod: null },
    },
  } },
};
