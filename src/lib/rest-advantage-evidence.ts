import type {
  AnalysisResponse,
  GameSearchResponse,
  GameSearchResult,
  HomeAwayBreakdown,
  MonthlyTrend,
  RestAdvantage,
  ThresholdBucket,
} from "@/types";

export const NEUTRAL_REST_ADVANTAGE_THRESHOLD = 0.5;

/** Canonical rest-advantage classification. Exactly ±0.5 is a call, not neutral. */
export function classifyRestAdvantage(
  homeFatigueScore: number,
  awayFatigueScore: number
): RestAdvantage {
  const differential = awayFatigueScore - homeFatigueScore;
  const advantageTeam: RestAdvantage["advantageTeam"] =
    Math.abs(differential) < NEUTRAL_REST_ADVANTAGE_THRESHOLD
      ? "neutral"
      : differential >= 0
        ? "home"
        : "away";

  return { differential, advantageTeam };
}

export type HistoricalGameEvidenceRow = {
  date: string;
  season: string;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigueScore: string;
  awayFatigueScore: string;
};

type ProcessedHistoricalGame = {
  date: string;
  season: string;
  differential: number;
  restedTeamSide: "home" | "away";
  restedTeamWon: boolean;
};

const BACKTEST_THRESHOLDS = [2, 3, 5, 7] as const;

function winPct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}

/** Builds the complete historical backtest from final games with both fatigue scores. */
export function buildHistoricalBacktest(
  rows: readonly HistoricalGameEvidenceRow[],
  seasonMinRA = 0
): AnalysisResponse {
  const decidable: ProcessedHistoricalGame[] = [];

  for (const row of rows) {
    if (row.homeScore === null || row.awayScore === null) continue;

    const restAdvantage = classifyRestAdvantage(
      Number.parseFloat(row.homeFatigueScore),
      Number.parseFloat(row.awayFatigueScore)
    );
    if (restAdvantage.advantageTeam === "neutral") continue;

    const homeWon = row.homeScore > row.awayScore;
    decidable.push({
      date: row.date,
      season: row.season,
      differential: restAdvantage.differential,
      restedTeamSide: restAdvantage.advantageTeam,
      restedTeamWon:
        restAdvantage.advantageTeam === "home" ? homeWon : !homeWon,
    });
  }

  const overallWins = decidable.filter((row) => row.restedTeamWon).length;
  const thresholds: ThresholdBucket[] = BACKTEST_THRESHOLDS.map((threshold) => {
    const bucket = decidable.filter(
      (row) => Math.abs(row.differential) >= threshold
    );
    const wins = bucket.filter((row) => row.restedTeamWon).length;
    return {
      threshold,
      games: bucket.length,
      restedTeamWins: wins,
      winPct: winPct(wins, bucket.length),
    };
  });

  const homeRested = decidable.filter((row) => row.restedTeamSide === "home");
  const awayRested = decidable.filter((row) => row.restedTeamSide === "away");
  const homeRestedWins = homeRested.filter((row) => row.restedTeamWon).length;
  const awayRestedWins = awayRested.filter((row) => row.restedTeamWon).length;
  const homeAwayBreakdown: HomeAwayBreakdown = {
    homeTeamMoreRested: {
      games: homeRested.length,
      restedTeamWins: homeRestedWins,
      winPct: winPct(homeRestedWins, homeRested.length),
    },
    awayTeamMoreRested: {
      games: awayRested.length,
      restedTeamWins: awayRestedWins,
      winPct: winPct(awayRestedWins, awayRested.length),
    },
  };

  const monthly = new Map<string, { games: number; wins: number }>();
  for (const row of decidable) {
    const month = row.date.slice(0, 7);
    const aggregate = monthly.get(month) ?? { games: 0, wins: 0 };
    aggregate.games++;
    if (row.restedTeamWon) aggregate.wins++;
    monthly.set(month, aggregate);
  }
  const monthlyTrends: MonthlyTrend[] = Array.from(monthly.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, aggregate]) => ({
      month,
      games: aggregate.games,
      restedTeamWins: aggregate.wins,
      winPct: winPct(aggregate.wins, aggregate.games),
    }));

  const seasonSource =
    seasonMinRA > NEUTRAL_REST_ADVANTAGE_THRESHOLD
      ? decidable.filter((row) => Math.abs(row.differential) >= seasonMinRA)
      : decidable;
  const bySeason = new Map<string, { games: number; wins: number }>();
  for (const row of seasonSource) {
    const aggregate = bySeason.get(row.season) ?? { games: 0, wins: 0 };
    aggregate.games++;
    if (row.restedTeamWon) aggregate.wins++;
    bySeason.set(row.season, aggregate);
  }
  const seasonWinRates = Array.from(bySeason.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([season, aggregate]) => ({
      season,
      games: aggregate.games,
      restedTeamWins: aggregate.wins,
      winPct: winPct(aggregate.wins, aggregate.games),
    }));

  return {
    totalGames: decidable.length,
    overallWins,
    overallWinRate: winPct(overallWins, decidable.length),
    thresholds,
    homeAwayBreakdown,
    monthlyTrends,
    seasonWinRates,
  };
}

export type HistoricalGameSearchRow = HistoricalGameEvidenceRow & {
  id: number;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
};

export type HistoricalGameSearchOptions = {
  result: "all" | "correct" | "incorrect";
  page: number;
  limit: number;
};

/** Builds the user-facing game explorer result from already-filtered regular-season rows. */
export function buildHistoricalGameSearch(
  rows: readonly HistoricalGameSearchRow[],
  options: HistoricalGameSearchOptions
): GameSearchResponse {
  const decisive: GameSearchResult[] = [];

  for (const row of rows) {
    if (row.homeScore === null || row.awayScore === null) continue;

    const homeFatigueScore = Number.parseFloat(row.homeFatigueScore);
    const awayFatigueScore = Number.parseFloat(row.awayFatigueScore);
    const restAdvantage = classifyRestAdvantage(
      homeFatigueScore,
      awayFatigueScore
    );
    if (restAdvantage.advantageTeam === "neutral") continue;

    const homeWon = row.homeScore > row.awayScore;
    decisive.push({
      gameId: row.id,
      date: row.date,
      season: row.season,
      homeTeamAbbreviation: row.homeTeamAbbr,
      awayTeamAbbreviation: row.awayTeamAbbr,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      homeFatigueScore,
      awayFatigueScore,
      restAdvantageDifferential:
        Math.round(Math.abs(restAdvantage.differential) * 100) / 100,
      advantageTeam: restAdvantage.advantageTeam,
      restedTeamWon:
        restAdvantage.advantageTeam === "home" ? homeWon : !homeWon,
    });
  }

  const filtered =
    options.result === "correct"
      ? decisive.filter((row) => row.restedTeamWon)
      : options.result === "incorrect"
        ? decisive.filter((row) => !row.restedTeamWon)
        : decisive;
  const offset = (options.page - 1) * options.limit;

  return {
    games: filtered.slice(offset, offset + options.limit),
    total: filtered.length,
    page: options.page,
    limit: options.limit,
  };
}
