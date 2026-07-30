import type {
  AnalysisResponse,
  GameSearchResponse,
  GameSearchResult,
  HomeAwayBreakdown,
  RestAdvantage,
  ThresholdBucket,
  VenueControlledRestEffect,
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

/**
 * Era buckets for the venue-controlled swing. Roughly decades, chosen because the trend
 * across them is monotone and the boundaries are not tuned to flatter any of them.
 * `from` is inclusive, `to` exclusive, compared as "YYYY-YY" season labels.
 */
const SWING_ERAS = [
  { label: "1985–1994", from: "0000-00", to: "1995-96" },
  { label: "1995–2004", from: "1995-96", to: "2005-06" },
  { label: "2005–2014", from: "2005-06", to: "2015-16" },
  { label: "2015–present", from: "2015-16", to: "9999-99" },
] as const;

function winPct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}

/**
 * Home win rate split by which side was more rested, plus the difference between them.
 *
 * `restedTeamWon` conflates two effects: rest and home-court advantage. Because the home
 * team is the more-rested side in ~70% of decidable games — travel load alone nearly
 * guarantees it — the headline win rate is substantially a restatement of "home teams win".
 * Holding venue fixed (every figure here is a *home* win rate) isolates what rest is worth:
 * measured across all 40 seasons the swing is ~3.4pp against a ~55% headline, and home-court
 * advantage is worth roughly three times as much.
 *
 * Associational, not causal: no control for opponent strength, and rest correlates with
 * schedule position — a rested visitor is often a good team mid-road-trip.
 */
function buildVenueControlled(
  rows: readonly HistoricalGameEvidenceRow[],
  inEra: (season: string) => boolean = () => true
): VenueControlledRestEffect {
  let allGames = 0;
  let allHomeWins = 0;
  let homeRested = 0;
  let homeRestedHomeWins = 0;
  let awayRested = 0;
  let awayRestedHomeWins = 0;

  for (const row of rows) {
    if (row.homeScore === null || row.awayScore === null) continue;
    if (!inEra(row.season)) continue;

    const homeWon = row.homeScore > row.awayScore;
    allGames++;
    if (homeWon) allHomeWins++;

    // Positive differential = the away team carries more fatigue = the home side is rested.
    const differential =
      Number.parseFloat(row.awayFatigueScore) - Number.parseFloat(row.homeFatigueScore);
    if (differential > NEUTRAL_REST_ADVANTAGE_THRESHOLD) {
      homeRested++;
      if (homeWon) homeRestedHomeWins++;
    } else if (differential < -NEUTRAL_REST_ADVANTAGE_THRESHOLD) {
      awayRested++;
      if (homeWon) awayRestedHomeWins++;
    }
  }

  const homeRestedRate = homeRested > 0 ? homeRestedHomeWins / homeRested : 0;
  const awayRestedRate = awayRested > 0 ? awayRestedHomeWins / awayRested : 0;
  const swing =
    homeRested > 0 && awayRested > 0
      ? Math.round((homeRestedRate - awayRestedRate) * 1000) / 10
      : 0;

  return {
    games: allGames,
    baselineHomeWinRate: winPct(allHomeWins, allGames),
    homeRestedGames: homeRested,
    homeRestedHomeWinRate: winPct(homeRestedHomeWins, homeRested),
    awayRestedGames: awayRested,
    awayRestedHomeWinRate: winPct(awayRestedHomeWins, awayRested),
    swingPp: swing,
  };
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
    seasonWinRates,
    venueControlled: buildVenueControlled(rows),
    venueControlledByEra: SWING_ERAS.map((era) => ({
      label: era.label,
      ...buildVenueControlled(
        rows,
        (season) => season >= era.from && season < era.to
      ),
    })).filter((era) => era.games > 0),
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
