import {
  calculateFatigue,
  type FatigueResult,
  type RecentGame,
} from "@/lib/fatigue";
import { classifyRestAdvantage } from "@/lib/rest-advantage-evidence";

export type DailyRefreshGame = {
  id: number;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  status: string;
};

export type DailyRefreshTeam = {
  id: number;
  latitude: string;
  longitude: string;
  altitudeFlag: boolean;
};

export type FatigueScoreWrite = {
  teamId: number;
  score: string;
  decayLoadScore: string;
  travelLoadScore: string;
  backToBackMultiplier: string;
  altitudeMultiplier: string;
  densityMultiplier: string;
  freshnessBonus: string;
  gamesInLast7Days: number;
  gamesInLast30Days: number;
  travelDistanceMiles: string;
  isBackToBack: boolean;
  daysSinceLastGame: number | null;
  isOvertimePenalty: boolean;
  roadTripConsecutiveAway: number;
  isThreeInFour: boolean;
  isFourInSix: boolean;
  hasCoastToCoastRoadSwing: boolean;
};

export type PredictionWrite = {
  predictedAdvantageTeamId: number;
  restAdvantageDifferential: string;
};

export type DailyRefreshWrite = {
  gameId: number;
  fatigueRows: [FatigueScoreWrite, FatigueScoreWrite];
  replaceUnresolvedPrediction: boolean;
  prediction: PredictionWrite | null;
};

export interface DailyRefreshPort {
  loadRecentGames(teamId: number, gameDate: string): Promise<RecentGame[]>;
  /** Atomically replaces one game's fatigue rows and unresolved prediction. */
  replaceGameRefresh(write: DailyRefreshWrite): Promise<void>;
}

export type DailyRefreshSummary = {
  gamesRefreshed: number;
  fatigueRowsWritten: number;
  predictionRowsWritten: number;
  failedGames: Array<{ gameId: number; reason: string }>;
};

/**
 * Computes and replaces each game independently, preserving the last-known-good
 * rows whenever calculation or the game-level transaction fails.
 */
export async function refreshDailyGames(input: {
  games: readonly DailyRefreshGame[];
  teams: readonly DailyRefreshTeam[];
  port: DailyRefreshPort;
}): Promise<DailyRefreshSummary> {
  const teamById = new Map(input.teams.map((team) => [team.id, team]));
  const summary: DailyRefreshSummary = {
    gamesRefreshed: 0,
    fatigueRowsWritten: 0,
    predictionRowsWritten: 0,
    failedGames: [],
  };

  for (const game of input.games) {
    try {
      const home = requireTeam(teamById, game.homeTeamId);
      const away = requireTeam(teamById, game.awayTeamId);
      const homeLat = parseCoordinate(home.latitude, home.id, "latitude");
      const homeLon = parseCoordinate(home.longitude, home.id, "longitude");
      const awayLat = parseCoordinate(away.latitude, away.id, "latitude");
      const awayLon = parseCoordinate(away.longitude, away.id, "longitude");

      const recentHome = await input.port.loadRecentGames(
        game.homeTeamId,
        game.date
      );
      const homeResult = calculateFatigue(
        game.date,
        recentHome,
        false,
        homeLat,
        homeLon,
        homeLat,
        homeLon,
        true
      );
      const recentAway = await input.port.loadRecentGames(
        game.awayTeamId,
        game.date
      );
      const awayResult = calculateFatigue(
        game.date,
        recentAway,
        home.altitudeFlag,
        awayLat,
        awayLon,
        homeLat,
        homeLon,
        false
      );

      const homeFatigue = toFatigueScoreWrite(game.homeTeamId, homeResult);
      const awayFatigue = toFatigueScoreWrite(game.awayTeamId, awayResult);
      const prediction =
        game.status === "scheduled"
          ? buildPrediction(
              game,
              Number(homeFatigue.score),
              Number(awayFatigue.score)
            )
          : null;

      await input.port.replaceGameRefresh({
        gameId: game.id,
        fatigueRows: [homeFatigue, awayFatigue],
        replaceUnresolvedPrediction: game.status === "scheduled",
        prediction,
      });

      summary.gamesRefreshed++;
      summary.fatigueRowsWritten += 2;
      if (prediction !== null) summary.predictionRowsWritten++;
    } catch (error) {
      summary.failedGames.push({
        gameId: game.id,
        reason: error instanceof Error ? error.message : "Unknown refresh error",
      });
    }
  }

  return summary;
}

function requireTeam(
  teamById: ReadonlyMap<number, DailyRefreshTeam>,
  teamId: number
): DailyRefreshTeam {
  const team = teamById.get(teamId);
  if (!team) throw new Error(`missing team ${teamId}`);
  return team;
}

function parseCoordinate(
  value: string,
  teamId: number,
  coordinate: "latitude" | "longitude"
): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid ${coordinate} for team ${teamId}`);
  }
  return parsed;
}

function toFatigueScoreWrite(
  teamId: number,
  result: FatigueResult
): FatigueScoreWrite {
  return {
    teamId,
    score: String(Math.round(result.score * 100) / 100),
    decayLoadScore: String(result.decayLoadScore),
    travelLoadScore: String(result.travelLoadScore),
    backToBackMultiplier: String(result.backToBackMultiplier),
    altitudeMultiplier: String(result.altitudeMultiplier),
    densityMultiplier: String(result.densityMultiplier),
    freshnessBonus: String(result.freshnessBonus),
    gamesInLast7Days: result.gamesInLast7Days,
    gamesInLast30Days: result.gamesInLast30Days,
    travelDistanceMiles: String(result.travelDistanceMiles),
    isBackToBack: result.isBackToBack,
    daysSinceLastGame: result.daysSinceLastGame,
    isOvertimePenalty: result.isOvertimePenalty,
    roadTripConsecutiveAway: result.roadTripConsecutiveAway,
    isThreeInFour: result.isThreeInFour,
    isFourInSix: result.isFourInSix,
    hasCoastToCoastRoadSwing: result.hasCoastToCoastRoadSwing,
  };
}

function buildPrediction(
  game: DailyRefreshGame,
  homeFatigueScore: number,
  awayFatigueScore: number
): PredictionWrite | null {
  const restAdvantage = classifyRestAdvantage(
    homeFatigueScore,
    awayFatigueScore
  );
  if (restAdvantage.advantageTeam === "neutral") return null;

  return {
    predictedAdvantageTeamId:
      restAdvantage.advantageTeam === "home"
        ? game.homeTeamId
        : game.awayTeamId,
    restAdvantageDifferential: String(
      Math.round(restAdvantage.differential * 100) / 100
    ),
  };
}
