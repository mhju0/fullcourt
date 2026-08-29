export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
  city: string;
}

export interface FatigueInfo {
  score: number;
  isBackToBack: boolean;
  is3In4: boolean;
  /**
   * Sum of modeled flight legs in the travel window (7 calendar days before this game,
   * not counting game day), per `calculateFatigue` — not “days traveling.”
   */
  travelDistanceMiles: number;
  altitudePenalty: boolean;
  /** When altitude applies (away at DEN/UTA), human-readable arena context. */
  altitudeArenaLabel: string | null;
  /** Days since this team's previous game; null = season opener / no prior game. */
  daysRest: number | null;
  /** Games in the 7 calendar days before this game (not counting this game). */
  gamesInLast7Days: number;
  /** Games in the 30 calendar days before this game (not counting this game). */
  gamesInLast30Days: number;
  /** Fourth game within a rolling 6-calendar-day span in that window. */
  is4In6: boolean;
  /** Prior game went to overtime (extra fatigue in the model). */
  isOvertimePenalty: boolean;
  /**
   * Consecutive away games including tonight when this team is away; 0 when playing at home
   * or with no road streak into this game.
   */
  roadTripConsecutiveAway: number;
  /** Tonight's game is on the road ≥2 time zones (≥26° longitude) from home. */
  hasTimeZoneDisplacement: boolean;
}

export interface RestAdvantage {
  differential: number;
  advantageTeam: "home" | "away" | "neutral";
}

/** One calendar day in a season with regular-season game count (API: GET /api/games/dates). */
export interface GameDateCount {
  date: string;
  gameCount: number;
}

export interface GameResponse {
  id: number;
  externalId: string;
  date: string;
  season: string;
  status: string;
  /**
   * Tip-off as the ET clock string ("7:30 PM ET"), or null — `tip_off_utc` is null
   * pre-2002 and for all of 2019-20, complete otherwise (docs/DATABASE.md), and an
   * absent time renders as its absence.
   */
  tipOffEt: string | null;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigue: FatigueInfo | null;
  awayFatigue: FatigueInfo | null;
  restAdvantage: RestAdvantage | null;
  /**
   * This game's fatigue was projected from the published schedule rather than measured from
   * played basketball — i.e. an unplayed game sits earlier in its season. See
   * `src/lib/fatigue-provenance.ts`; it is NOT the same as "this game has not been played".
   */
  projectedFatigue: boolean;
}

/**
 * The read envelope. A discriminated union rather than `data: T` with a
 * nullable `error`: on failure there is no `T` to send, and the previous shape
 * forced every route to write `data: null as unknown as T`.
 */
export type ApiResponse<T> =
  | { data: T; error: null; meta?: Record<string, unknown> }
  | { data: null; error: string; meta?: Record<string, unknown> };

// ─── Analysis ────────────────────────────────────────────────────

export interface ThresholdBucket {
  /** Minimum absolute rest-advantage differential required to be counted. */
  threshold: number;
  games: number;
  restedTeamWins: number;
  /** Win percentage (0–100, 1 decimal). */
  winPct: number;
}

export interface HomeAwayBreakdown {
  homeTeamMoreRested: {
    games: number;
    restedTeamWins: number;
    winPct: number;
  };
  awayTeamMoreRested: {
    games: number;
    restedTeamWins: number;
    winPct: number;
  };
}

/**
 * How often each side wins regardless of rest — the number every published rest-advantage
 * rate is stated against.
 *
 * Counted over every scored game in the population, **including the neutral ones the rest
 * figures drop**. That is the point: a rate can only be read as an effect of rest if the
 * venue's own contribution has been subtracted, and every game the site publishes a rate for
 * is a home game.
 */
export interface VenueBaseline {
  /** Every scored game, neutral included. Wider than `AnalysisResponse.totalGames`. */
  games: number;
  homeWins: number;
  /** How often the home team wins, regardless of rest (0–100, 1 decimal). */
  homeWinPct: number;
  /** The same for the road side. Derived from counts, never as `100 − homeWinPct`. */
  roadWinPct: number;
}

/** Historical backtest stats (final games with fatigue data, |RA| >= 0.5). */
export interface AnalysisResponse {
  /**
   * Games counted in every headline figure below: |RA| >= 0.5 **and** the more-rested team
   * was also at home. Narrower than `venueBaseline.games` on both counts.
   */
  totalGames: number;
  overallWins: number;
  /**
   * Win percentage (0–100, 1 decimal). Read against `venueBaseline.homeWinPct`, not against
   * 50 — every game in it is a home game.
   */
  overallWinRate: number;
  thresholds: ThresholdBucket[];
  homeAwayBreakdown: HomeAwayBreakdown;
  venueBaseline: VenueBaseline;
  /**
   * More-rested team win rate aggregated per NBA season (regular-season calendar only).
   */
  seasonWinRates: {
    season: string;
    games: number;
    restedTeamWins: number;
    winPct: number;
    /**
     * That season's own home win rate, over every scored game in it.
     *
     * Per-season rather than one constant because home-court advantage is not stable: it runs
     * from 67.9% in 1987-88 to 54.3% in 2023-24. A fixed zero line would make the 1980s bars
     * read as a rest effect when they are league-wide home court.
     */
    homeBaselinePct: number;
  }[];
}

// ─── Game search ─────────────────────────────────────────────────

export interface GameSearchResult {
  gameId: number;
  date: string;
  season: string;
  homeTeamAbbreviation: string;
  awayTeamAbbreviation: string;
  homeScore: number;
  awayScore: number;
  homeFatigueScore: number;
  awayFatigueScore: number;
  /** Absolute rest advantage differential (always >= 0). */
  restAdvantageDifferential: number;
  advantageTeam: "home" | "away";
  restedTeamWon: boolean;
}

/** One prior final game shown in the detail modal's Recent Games list. */
export interface TeamRecentResultGame {
  /** Primary key of this game (for drill-down navigation). */
  gameId: number;
  date: string;
  opponentAbbreviation: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  won: boolean;
}

/** Full game card payload plus recent results for both teams. */
export interface GameDetailResponse {
  game: GameResponse;
  homeRecentWeek: TeamRecentResultGame[];
  awayRecentWeek: TeamRecentResultGame[];
}

export interface GameSearchResponse {
  games: GameSearchResult[];
  total: number;
  page: number;
  limit: number;
}

// ─── Upcoming games (Future Games page) ──────────────────────────

export interface UpcomingGameWithRA {
  gameId: number;
  date: string;
  season: string;
  homeTeam: Pick<TeamInfo, "id" | "abbreviation" | "name" | "city">;
  awayTeam: Pick<TeamInfo, "id" | "abbreviation" | "name" | "city">;
  homeFatigueScore: number | null;
  awayFatigueScore: number | null;
  restAdvantageDifferential: number;
  predictedAdvantageAbbreviation: string;
  /** See `GameResponse.projectedFatigue`. */
  projectedFatigue: boolean;
}

// ─── Playoff Predictor (GET /api/playoffs → the /playoffs page) ──

export interface PlayoffTeamRef {
  id: number;
  abbreviation: string;
  name: string;
}

/** One prediction method's result for a series ("full_insample" or "walk_forward_oos"). */
export interface PlayoffSeriesPredictionMethod {
  /** P(home-court team wins the series). */
  predictedHomeCourtWinProb: number;
  predictedWinnerTeam: PlayoffTeamRef;
  modelVersion: string;
  /** null until the series has a known winner. */
  predictedWinnerCorrect: boolean | null;
}

export interface PlayoffSeriesWithPredictions {
  seriesId: number;
  season: string;
  /** 1 = first round … 4 = Finals. */
  round: number;
  /** null for the Finals (cross-conference). */
  conference: string | null;
  isBestOf7: boolean;
  homeCourtTeam: PlayoffTeamRef;
  opponentTeam: PlayoffTeamRef;
  homeCourtWins: number | null;
  opponentWins: number | null;
  /** null until the series is resolved. */
  seriesWinnerTeam: PlayoffTeamRef | null;
  seedDiff: number | null;
  winPctDiff: number | null;
  entryRestDiff: number | null;
  h2hDiff: number | null;
  /**
   * Opponent's prior-round grind minus the home-court team's, where grind is games beyond a
   * sweep. Positive favors the home-court team — the sign is inverted versus the other diffs
   * on purpose so that "positive is good for home court" holds for every one of them.
   */
  priorGrindDiff: number | null;
  /** Games the home-court team played in its previous round. null in Round 1. */
  homeCourtPriorGames: number | null;
  /** Games the opponent played in its previous round. null in Round 1. */
  opponentPriorGames: number | null;
  /**
   * The format of each side's *previous* series — not this one's. Reading a prior-round game
   * count needs the format it was played under: through 2001-02 Round 1 was best-of-5, so a
   * 5-game previous round was the full distance while `isBestOf7` (this series, always true
   * in rounds 2+) would call it an early close.
   *
   * Two fields rather than one shared flag because they are two independent lookups. The two
   * teams' prior series can only differ in format across an era boundary, which never happens
   * inside one season — but nothing in the lookup enforces that, so it is not modelled as an
   * invariant. Both are null exactly when the matching `…PriorGames` is null (Round 1).
   */
  homeCourtPriorIsBestOf7: boolean | null;
  opponentPriorIsBestOf7: boolean | null;
  /** Either method may be absent (null) for a given series — never fabricated. */
  predictions: {
    fullInsample: PlayoffSeriesPredictionMethod | null;
    walkForwardOos: PlayoffSeriesPredictionMethod | null;
  };
}

export interface PlayoffRoundGroup {
  round: number;
  roundLabel: string;
  series: PlayoffSeriesWithPredictions[];
}

/** Accuracy computed only over series with a known winner AND a non-null prediction for the method. */
export interface PlayoffMethodSummary {
  knownWinnerGames: number;
  predictedCorrect: number;
  /** 0-100, 1 decimal. */
  accuracy: number;
}

export interface PlayoffsResponse {
  season: string;
  rounds: PlayoffRoundGroup[];
  summary: {
    fullInsample: PlayoffMethodSummary;
    walkForwardOos: PlayoffMethodSummary;
  };
}

// ─── Shot Quality (Expected Shot Value, xeFG%) ──────────────────

/** Model versions written to `shot_value_surface` (SQ-5). */
export type ShotQualityModelVersion = "gbm-v1" | "baseline-zone-v1";

/** Per-cell expected-value triplet for one model version; null when that surface has no row. */
export interface ShotQualityModelValues {
  pMake: number;
  expectedEfg: number;
  xpps: number;
}

/**
 * One league-grain grid cell (`shot_grid` team_id IS NULL) with its atomic counts and the
 * expected-value surface for each model version. `gbm`/`baseline` are null when no
 * `shot_value_surface` row exists for that (season, cell, model_version).
 */
export interface ShotQualityCell {
  cellX: number;
  cellY: number;
  zoneBasic: string | null;
  zoneRange: string | null;
  zoneArea: string | null;
  fga: number;
  fgm: number;
  fg3a: number;
  fg3m: number;
  gbm: ShotQualityModelValues | null;
  baseline: ShotQualityModelValues | null;
}

export interface ShotQualityResponse {
  season: string;
  /** The requested `model` (default "gbm-v1"); a display hint — both surfaces are always returned. */
  activeModel: ShotQualityModelVersion;
  cells: ShotQualityCell[];
  meta: {
    cellCount: number;
    totalFga: number;
  };
}


// ─── Schedule Disparity ──────────────────────────────────────────

/**
 * One team's season-level schedule disparity figures, as the page renders them.
 *
 * Deliberately narrower than what `computeScheduleDisparity` produces. The module is the
 * analytical unit and computes (and tests) the full metric set — uncapped totals, the season
 * fatigue sum, 4-in-6, per-team edge counts. This is the delivery surface, and it carries only
 * what `/schedule` puts on screen, so the payload cannot drift into the unrendered state that
 * retired `monthlyTrends`.
 */
export interface ScheduleDisparityTeam {
  teamId: number;
  abbreviation: string;
  name: string;
  /**
   * Season sum of the capped own-minus-opponent rest-days differential. Positive is favorable,
   * like every figure here.
   *
   * Derived from game dates alone, so unlike every fatigue figure below it is defined for a
   * season whose schedule is published but unplayed — which is why it is shipped: it is what
   * lets the page rank 2026-27 in August instead of showing thirty blank rows. Capped at 5 days
   * per side before differencing, justified by the model's own `FRESHNESS_PLATEAU_DAYS = 3`;
   * uncapped, the All-Star break swamps the season total.
   */
  netRestEdge: number;
  /**
   * Counted games with a fatigue advantage ≥ the app's 0.5 call threshold.
   *
   * **Null means not measured, not zero.** Fatigue is scored from games already played, so
   * every fatigue figure on this row is null together for an unplayed season.
   */
  favorableGames: number | null;
  /** Counted games facing a fatigue disadvantage ≥ 0.5. Null when unmeasured. */
  unfavorableGames: number | null;
  /** favorableGames − unfavorableGames — the page's headline ranking. Null when unmeasured. */
  netEdgeGames: number | null;
  /**
   * The same edges priced in wins, through the conversion the Season Report also reads.
   *
   * Held to two decimals and displayed to one. It is small for every team by construction —
   * the league distributes rest edges evenly enough that no schedule reaches half a game — and
   * copy that quotes it needs the per-game effect beside it (`REST_SHARE_OF_HOME_COURT`), or a
   * reader takes the size of the number for the size of the effect.
   */
  scheduleValueWins: number | null;
  /** The ≥ 1.5 "big edge" tier of each count. Null when unmeasured. */
  bigFavorableGames: number | null;
  bigUnfavorableGames: number | null;
  /** Back-to-backs avoided relative to opponents. Positive is favorable, like every figure here. */
  backToBackEdge: number;
  /** Third-nights-in-four avoided relative to opponents. */
  threeInFourEdge: number;
}

/**
 * Season-level figures. Deliberately carries no cross-season ranking — season length, team
 * count, and the league-wide rest distribution all shifted across the four decades covered.
 */
export interface ScheduleDisparityLeague {
  /** Spread in net edge games between the most and least favored team. Null when unmeasured. */
  delta: number | null;
  /** Counted games where one side's fatigue edge reached 0.5, and the ≥1.5 big tier. */
  gamesWithAnyEdge: number | null;
  gamesWithLargeEdge: number | null;
  /** Counted games — excludes each side's opener. A population, not a comparison. */
  countedGames: number;
  /**
   * Counted games that carried a fatigue pair, and so were genuinely compared.
   *
   * The denominator the page should quote beside the word "COMPARED". It diverges from
   * `countedGames` exactly when it matters: an unplayed season has 1,184 counted and 0 measured.
   */
  measuredGames: number;
}

export interface ScheduleDisparityResponse {
  season: string;
  /** True when any game in the season is not final, so figures may still revise. */
  provisional: boolean;
  /**
   * ET date of the most recent final game in this season — the surface's "as of" stamp.
   *
   * Replaced `asOf` on 2026-08-27, which carried the date the *response was built* under a
   * label identical to `/analysis`'s data stamp: two lines that looked like the same claim
   * and were not. A stamp on a season-scoped page has to be that season's data date or it is
   * a claim about a different population. Null before the season's first final game — no
   * stamp is rendered then, the whole-element form of the `NO_FIGURE` rule.
   */
  latestFinalDate: string | null;
  /** Every regular-season game in the season — the denominator `league.countedGames` sits in. */
  scheduledGames: number;
  teams: ScheduleDisparityTeam[];
  league: ScheduleDisparityLeague;
}
