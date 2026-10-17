import type {
  AnalysisResponse,
  EraRates,
  GameSearchResponse,
  GameSearchResult,
  GapRangeBucket,
  HomeAwayBreakdown,
  RestAdvantage,
  ThresholdBucket,
  VenueBaseline,
} from "@/types";

export const NEUTRAL_REST_ADVANTAGE_THRESHOLD = 0.5;

/**
 * The rest gap between two fatigue scores, `away − home`, at the scores' own precision.
 *
 * Fatigue scores are stored to two decimals, so every true gap is a multiple of 0.01. A bare
 * float subtraction is not: `4.35 − 3.85` computes to 0.49999999999999956, which put a 0.50 gap
 * on the neutral side and a 2.00 gap outside RA ≥ 2 while the board printed "0.5" and "2.0".
 * Rounding here gives every threshold and every display the same number (D-87, reversing D-13).
 * Every comparison against a rest-advantage threshold goes through this function.
 */
export function restAdvantageDifferential(
  homeFatigueScore: number,
  awayFatigueScore: number
): number {
  return Math.round((awayFatigueScore - homeFatigueScore) * 100) / 100;
}

/**
 * Canonical rest-advantage classification. `|differential| >= 0.5` is a call, below it neutral.
 *
 * `differential` is the stored two-decimal gap (`restAdvantageDifferential`), so a gap of 0.50
 * is a call and 0.49 is not. Pinned in `rest-advantage-evidence.test.ts`.
 */
export function classifyRestAdvantage(
  homeFatigueScore: number,
  awayFatigueScore: number
): RestAdvantage {
  const differential = restAdvantageDifferential(homeFatigueScore, awayFatigueScore);
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
 * 2026-10-17 by `scripts/measure_uncalled_half.ts`, pinned as `RESTED_ON_ROAD`): backing the
 * more rested team when that team is the visitor won 42.3% of 11,494 games. Home teams win
 * 59.9% of everything and road teams 40.1%, so that row does gain against its own baseline — but a gain over a baseline is
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
 * letting the combined number pick covers 96.6% of games at 59.7%, *below* the 59.9% you get by
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
  advantageTeam: RestAdvantage["advantageTeam"],
  neutralSite: boolean
): advantageTeam is "home" {
  // A neutral-site game has a listed host but no home court, so "rested and at home" cannot
  // hold there (D-92).
  return advantageTeam === "home" && !neutralSite;
}

export type HistoricalGameEvidenceRow = {
  date: string;
  season: string;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigueScore: string;
  awayFatigueScore: string;
  /** Played away from both arenas: no home court, so outside every venue figure (D-92). */
  neutralSite: boolean;
};

type ProcessedHistoricalGame = {
  date: string;
  season: string;
  differential: number;
  restedTeamSide: "home" | "away";
  restedTeamWon: boolean;
};

export const BACKTEST_THRESHOLDS = [2, 3, 5, 7] as const;

/**
 * The three gap sizes /analysis reports, each game counted in exactly one (D-102).
 *
 * The cumulative thresholds above count a 6-point gap in every bucket from RA ≥ 2 to RA ≥ 5,
 * so the small-gap bars borrowed the lift of the large gaps riding inside them. Split apart,
 * 0.5 to 3 wins at the home baseline and the effect appears only above it. 0.5 is the call line,
 * and 3 and 5 are the board's MEDIUM and LARGE REST EDGE lines (`restEdgeSize`, D-101), which a
 * test holds equal, so every tab names the same games the same way. `max` is exclusive and
 * `null` means no ceiling.
 */
export const GAP_RANGES = [
  { key: "small", label: "Small", min: NEUTRAL_REST_ADVANTAGE_THRESHOLD, max: 3 },
  { key: "medium", label: "Medium", min: 3, max: 5 },
  { key: "large", label: "Large", min: 5, max: null },
] as const satisfies readonly { key: string; label: string; min: number; max: number | null }[];

export type GapRange = (typeof GAP_RANGES)[number];
export type GapRangeKey = GapRange["key"];

/** Whether a gap (already rounded by `restAdvantageDifferential`) falls inside a range. */
export function inGapRange(differential: number, range: GapRange): boolean {
  const gap = Math.abs(differential);
  return gap >= range.min && (range.max === null || gap < range.max);
}

/** "0.5–3", "3–5", "5+": the span as every label on the site prints it. */
export function gapRangeSpan(range: GapRange): string {
  return range.max === null ? `${range.min}+` : `${range.min}–${range.max}`;
}

export function gapRangeByKey(key: GapRangeKey): GapRange {
  return GAP_RANGES.find((range) => range.key === key) ?? GAP_RANGES[0];
}

/** Seasons per era on the era chart. The oldest era absorbs the remainder (D-102). */
export const ERA_LENGTH = 5;

/**
 * Groups complete seasons into eras of `ERA_LENGTH`, counted back from the newest so the most
 * recent era is always a full one. A short remainder joins the oldest era instead of standing
 * alone, because a one-season era is exactly the noisy single-season bar this chart replaced.
 */
export function groupSeasonsIntoEras(seasons: readonly string[]): string[][] {
  const sorted = [...seasons].sort((left, right) => left.localeCompare(right));
  const eras: string[][] = [];
  for (let end = sorted.length; end > 0; end -= ERA_LENGTH) {
    eras.unshift(sorted.slice(Math.max(0, end - ERA_LENGTH), end));
  }
  if (eras.length > 1 && eras[0].length < ERA_LENGTH) {
    const [remainder, oldest] = eras.splice(0, 2);
    eras.unshift([...remainder, ...oldest]);
  }
  return eras;
}

/** Win percentage to one decimal. Shared so two surfaces cannot round one statistic differently. */
export function winPct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}

/** Builds the complete historical backtest from final games with both fatigue scores. */
export function buildHistoricalBacktest(
  rows: readonly HistoricalGameEvidenceRow[],
  seasonMinRA = 0,
  incompleteSeasons: ReadonlySet<string> = new Set()
): AnalysisResponse {
  const decidable: ProcessedHistoricalGame[] = [];

  // The venue baseline is tallied over every scored game with a home court, before any rest
  // filter — including the no-edge ones `decidable` drops. It has to be the wider set: it answers "what does this
  // side win anyway", and a version computed only on games with a rest gap would already carry
  // the effect it exists to subtract.
  let baselineGames = 0;
  let baselineHomeWins = 0;
  let latestEvidenceDate: string | null = null;
  const baselineBySeason = new Map<
    string,
    { games: number; homeWins: number; latestEvidenceDate: string }
  >();

  for (const row of rows) {
    if (row.homeScore === null || row.awayScore === null) continue;
    if (latestEvidenceDate === null || row.date > latestEvidenceDate) latestEvidenceDate = row.date;
    // No home court to measure: kept out of the baseline, the home/away breakdown and the calls.
    if (row.neutralSite) continue;

    const homeWon = row.homeScore > row.awayScore;

    baselineGames++;
    if (homeWon) baselineHomeWins++;
    const seasonBaseline = baselineBySeason.get(row.season) ?? {
      games: 0,
      homeWins: 0,
      latestEvidenceDate: row.date,
    };
    seasonBaseline.games++;
    if (homeWon) seasonBaseline.homeWins++;
    if (row.date > seasonBaseline.latestEvidenceDate) seasonBaseline.latestEvidenceDate = row.date;
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
  const called = decidable.filter((row) => isCalledSide(row.restedTeamSide, false));

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

  const countRanges = (rows: readonly ProcessedHistoricalGame[]): GapRangeBucket[] =>
    GAP_RANGES.map((range) => {
      const bucket = rows.filter((row) => inGapRange(row.differential, range));
      const wins = bucket.filter((row) => row.restedTeamWon).length;
      return {
        key: range.key,
        min: range.min,
        max: range.max,
        games: bucket.length,
        restedTeamWins: wins,
        winPct: winPct(wins, bucket.length),
      };
    });
  const gapRanges = countRanges(called);

  // Eras read the unfiltered called games of complete seasons only: a season still being played
  // would make the newest era shift every night.
  const completeSeasons = [...baselineBySeason.keys()].filter(
    (season) => !incompleteSeasons.has(season)
  );
  const eras: EraRates[] = groupSeasonsIntoEras(completeSeasons).map((seasons) => {
    const inEra = new Set(seasons);
    let homeGames = 0;
    let homeWins = 0;
    for (const season of seasons) {
      const baseline = baselineBySeason.get(season);
      homeGames += baseline?.games ?? 0;
      homeWins += baseline?.homeWins ?? 0;
    }
    return {
      firstSeason: seasons[0],
      lastSeason: seasons[seasons.length - 1],
      seasonCount: seasons.length,
      homeGames,
      homeWins,
      homeWinPct: winPct(homeWins, homeGames),
      ranges: countRanges(called.filter((row) => inEra.has(row.season))),
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
  const seasonKeys = seasonMinRA > NEUTRAL_REST_ADVANTAGE_THRESHOLD
    ? [...bySeason.keys()]
    : [...baselineBySeason.keys()];
  const seasonWinRates = seasonKeys
    .sort((left, right) => left.localeCompare(right))
    .map((season) => {
      const aggregate = bySeason.get(season) ?? { games: 0, wins: 0 };
      const baseline = baselineBySeason.get(season);
      return {
        season,
        homeGames: baseline?.games ?? 0,
        homeWins: baseline?.homeWins ?? 0,
        latestEvidenceDate: baseline?.latestEvidenceDate ?? "",
        games: aggregate.games,
        restedTeamWins: aggregate.wins,
        winPct: winPct(aggregate.wins, aggregate.games),
        homeBaselinePct: baseline ? winPct(baseline.homeWins, baseline.games) : 0,
        isComplete: !incompleteSeasons.has(season),
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
    latestEvidenceDate,
    totalGames: called.length,
    overallWins,
    overallWinRate: winPct(overallWins, called.length),
    thresholds,
    gapRanges,
    eras,
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

/** Which side was the more-rested one. Every choice leaves neutral sites out (D-92). */
export type ExploreSide = "home" | "away" | "either";

/**
 * What shapes the page, applied after the rows are in hand.
 *
 * `gap` and `side` run here rather than in SQL so they read the same rounded gap and the same
 * `isCalledSide` the backtest does: a bar's count and the rows it opens then cannot disagree,
 * which an unrounded SQL bound could at a range edge. The query still applies the range floor.
 */
export type HistoricalGameSearchOptions = {
  result: "all" | "correct" | "incorrect";
  page: number;
  limit: number;
  gap?: GapRangeKey;
  side?: ExploreSide;
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
    if (options.side !== undefined && row.neutralSite) continue;
    if (options.side === "home" && !isCalledSide(restAdvantage.advantageTeam, row.neutralSite)) continue;
    if (options.side === "away" && restAdvantage.advantageTeam !== "away") continue;
    if (options.gap !== undefined && !inGapRange(restAdvantage.differential, gapRangeByKey(options.gap))) continue;

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
      restAdvantageDifferential: Math.abs(restAdvantage.differential),
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
