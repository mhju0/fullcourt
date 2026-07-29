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
  /** Large east–west spread between home and road venues on the current / recent trip. */
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
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigue: FatigueInfo | null;
  awayFatigue: FatigueInfo | null;
  restAdvantage: RestAdvantage | null;
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

/** Historical backtest stats (final games with fatigue data, |RA| >= 0.5). */
export interface AnalysisResponse {
  /** Total games counted (|RA| >= 0.5). */
  totalGames: number;
  overallWins: number;
  /** Win percentage (0–100, 1 decimal). */
  overallWinRate: number;
  thresholds: ThresholdBucket[];
  homeAwayBreakdown: HomeAwayBreakdown;
  /**
   * More-rested team win rate aggregated per NBA season (regular-season calendar only).
   */
  seasonWinRates: {
    season: string;
    games: number;
    restedTeamWins: number;
    winPct: number;
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
  /** Season sum of (own rest days − opponent rest days), each side capped at 5. */
  netRestEdge: number;
  /** Fatigue-score edge per counted game. Null when no counted game is scored. */
  netFatigueEdgePerGame: number | null;
  /** Back-to-backs avoided relative to opponents. Positive is favorable, like every figure here. */
  backToBackEdge: number;
  /** Third-nights-in-four avoided relative to opponents. */
  threeInFourEdge: number;
}

/**
 * Season-level figures. Deliberately carries no cross-season ranking — season length, team
 * count, and the league-wide rest distribution all shifted across the ~40 seasons.
 */
export interface ScheduleDisparityLeague {
  /** Spread in days between the most and least favored team. */
  delta: number;
  /** Counted games where one side held any rest edge, and where that edge reached 3+ days. */
  gamesWithAnyEdge: number;
  gamesWithLargeEdge: number;
  countedGames: number;
}

export interface ScheduleDisparityResponse {
  season: string;
  /** True when any game in the season is not final, so figures may still revise. */
  provisional: boolean;
  /** ET date the figures were computed, for the as-of line on provisional seasons. */
  asOf: string;
  /** Every regular-season game in the season — the denominator `league.countedGames` sits in. */
  scheduledGames: number;
  teams: ScheduleDisparityTeam[];
  league: ScheduleDisparityLeague;
}
