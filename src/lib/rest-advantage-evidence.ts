import type {
  AnalysisResponse,
  GameSearchResponse,
  GameSearchResult,
  HomeAwayBreakdown,
  RestAdvantage,
  ThresholdBucket,
  VenueBaseline,
} from "@/types";

export const NEUTRAL_REST_ADVANTAGE_THRESHOLD = 0.5;

/**
 * Canonical rest-advantage classification. `|differential| >= 0.5` is a call, below it neutral.
 *
 * Read as "about 0.5", never "exactly 0.5": `differential` is a float subtraction, so a gap that
 * reads as 0.50 can compute just under the threshold and land neutral — `4.35 − 3.85` does.
 * Pinned in `rest-advantage-evidence.test.ts` and explained in `docs/GLOSSARY.md`.
 */
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

/**
 * Whether the site makes a **call** on a game, given which side the rest edge favours.
 *
 * Deliberately separate from `classifyRestAdvantage`, which answers a different question and
 * must keep answering it: "the visitor is the more rested team" is a true statement about a
 * schedule and the matchup rows should go on saying it. This function answers "would we bet
 * on that", and the answer for a rested visitor is no.
 *
 * The evidence, over every decidable game the site publishes (1985-86 on, re-measured
 * 2026-08-06 by `scripts/measure_uncalled_half.ts`): backing the more rested team when that
 * team is the visitor won 42.4% of 11,548 games. Home teams win 59.9% of everything and road
 * teams 40.1%, so that row does gain against its own baseline — but a gain over a baseline is
 * a measurement, and a pick has to clear 50%.
 *
 * The figures this docblock carried until 2026-08-06 — 44.39% of 7,224, and a ladder said to
 * reach 50.29% only at an edge of 5 — were the 2002-03-onward harness slice, not the published
 * population, and the site had no way to notice: they were prose. They are now generated into
 * `ml/rest_split_facts.json` and pinned by a test. Two claims did not survive the correction:
 * the road row reaches even at a gap of 6 and clears it at 7 (on 108 and 26 games, which is the
 * schedule running out of examples rather than a signal), so "no threshold rescues it" is false
 * as written; and "rest alone never outweighs home court at any magnitude" is an absolute
 * resting on a pooled 41-season rate that has drifted — a rested road team is near even over
 * the last five seasons. Neither sentence is published any more.
 *
 * What does hold, and is why this function exists: folding home court into the score and
 * letting the combined number pick covers 96.5% of games at 59.7%, *below* the 59.9% you get by
 * backing the home team in every game — adding a constant to both sides creates no information.
 * See ADR 0006 and its 2026-08-06 addendum.
 *
 * One place, not five — the backtest, the season report, the predictions backfill and the daily
 * refresh all route through here, because a hand-written copy of this predicate in each reader
 * is exactly how the regime filter got lost.
 *
 * Written as a type guard narrowing to `"home"` rather than returning a bare boolean, so the
 * callers that then pick a team get that from the compiler instead of restating the rule. If a
 * road call is ever justified, this signature widens and every call site is flagged for review
 * — which is the point.
 */
export function isCalledSide(
  advantageTeam: RestAdvantage["advantageTeam"]
): advantageTeam is "home" {
  return advantageTeam === "home";
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

/** Win percentage to one decimal. Shared so two surfaces cannot round one statistic differently. */
export function winPct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}

/** Builds the complete historical backtest from final games with both fatigue scores. */
export function buildHistoricalBacktest(
  rows: readonly HistoricalGameEvidenceRow[],
  seasonMinRA = 0
): AnalysisResponse {
  const decidable: ProcessedHistoricalGame[] = [];

  // The venue baseline is tallied over every scored game, before any rest filter — including
  // the neutral ones `decidable` drops. It has to be the wider set: it answers "what does this
  // side win anyway", and a version computed only on games with a rest gap would already carry
  // the effect it exists to subtract.
  let baselineGames = 0;
  let baselineHomeWins = 0;
  const baselineBySeason = new Map<string, { games: number; homeWins: number }>();

  for (const row of rows) {
    if (row.homeScore === null || row.awayScore === null) continue;

    const homeWon = row.homeScore > row.awayScore;

    baselineGames++;
    if (homeWon) baselineHomeWins++;
    const seasonBaseline = baselineBySeason.get(row.season) ?? { games: 0, homeWins: 0 };
    seasonBaseline.games++;
    if (homeWon) seasonBaseline.homeWins++;
    baselineBySeason.set(row.season, seasonBaseline);

    const restAdvantage = classifyRestAdvantage(
      Number.parseFloat(row.homeFatigueScore),
      Number.parseFloat(row.awayFatigueScore)
    );
    if (restAdvantage.advantageTeam === "neutral") continue;

    decidable.push({
      date: row.date,
      season: row.season,
      differential: restAdvantage.differential,
      restedTeamSide: restAdvantage.advantageTeam,
      restedTeamWon:
        restAdvantage.advantageTeam === "home" ? homeWon : !homeWon,
    });
  }

  // Every headline figure counts only the games the site actually calls. `decidable` stays the
  // wider set — it is what the home/away breakdown below is built from, and that breakdown is
  // the evidence for declining the other half rather than a second headline.
  const called = decidable.filter((row) => isCalledSide(row.restedTeamSide));

  const overallWins = called.filter((row) => row.restedTeamWon).length;
  const thresholds: ThresholdBucket[] = BACKTEST_THRESHOLDS.map((threshold) => {
    const bucket = called.filter(
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
      ? called.filter((row) => Math.abs(row.differential) >= seasonMinRA)
      : called;
  const bySeason = new Map<string, { games: number; wins: number }>();
  for (const row of seasonSource) {
    const aggregate = bySeason.get(row.season) ?? { games: 0, wins: 0 };
    aggregate.games++;
    if (row.restedTeamWon) aggregate.wins++;
    bySeason.set(row.season, aggregate);
  }
  const seasonWinRates = Array.from(bySeason.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([season, aggregate]) => {
      const baseline = baselineBySeason.get(season);
      return {
        season,
        games: aggregate.games,
        restedTeamWins: aggregate.wins,
        winPct: winPct(aggregate.wins, aggregate.games),
        homeBaselinePct: baseline ? winPct(baseline.homeWins, baseline.games) : 0,
      };
    });

  const venueBaseline: VenueBaseline = {
    games: baselineGames,
    homeWins: baselineHomeWins,
    homeWinPct: winPct(baselineHomeWins, baselineGames),
    // From the counts, not `100 − homeWinPct`: both halves of a rounding tie round upward, so
    // subtracting a figure already rounded to one decimal can land a tenth off.
    roadWinPct: winPct(baselineGames - baselineHomeWins, baselineGames),
  };

  return {
    totalGames: called.length,
    overallWins,
    overallWinRate: winPct(overallWins, called.length),
    thresholds,
    homeAwayBreakdown,
    venueBaseline,
    seasonWinRates,
  };
}

export type HistoricalGameSearchRow = HistoricalGameEvidenceRow & {
  id: number;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
};

/**
 * What narrows the rows, applied in SQL.
 *
 * `minRA` absent means no floor beyond the neutral cutoff the query always applies.
 * Lives here rather than in `queries.ts` for the same reason
 * {@link HistoricalGameSearchRow} does: the evidence module owns the vocabulary, and the
 * query is one reader of it.
 */
export type HistoricalGameSearchFilters = {
  minRA?: number;
  /** Team abbreviation — matches either side of the game. */
  team?: string;
  /** "YYYY-YY". */
  season?: string;
};

/** What shapes the page, applied after the rows are in hand. */
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
