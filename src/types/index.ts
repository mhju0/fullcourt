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
  hasCoastToCoastRoadSwing: boolean;
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

export interface ApiResponse<T> {
  data: T;
  error: string | null;
  meta?: Record<string, unknown>;
}

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

export interface MonthlyTrend {
  /** "YYYY-MM" */
  month: string;
  games: number;
  restedTeamWins: number;
  winPct: number;
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
  /** Sorted chronologically (ascending). */
  monthlyTrends: MonthlyTrend[];
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

// ─── Playoff Predictor (backend only — GET /api/playoffs; no page yet) ──

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

