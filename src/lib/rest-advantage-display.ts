import {
  NEUTRAL_REST_ADVANTAGE_THRESHOLD,
  winPct,
} from "@/lib/rest-advantage-evidence";
import type { AnalysisResponse, HomeAwayBreakdown, RestAdvantage } from "@/types";

export type RestAdvantageDisplay =
  | {
      kind: "team";
      teamAbbreviation: string;
      value: string;
      text: string;
    }
  | {
      kind: "neutral";
      text: string;
    };

export function formatRestAdvantageValue(value: number): string {
  return Math.abs(value).toFixed(1);
}

export function formatRestAdvantageDisplay(
  restAdvantage: RestAdvantage | null,
  homeAbbreviation: string,
  awayAbbreviation: string
): RestAdvantageDisplay {
  if (!restAdvantage || restAdvantage.advantageTeam === "neutral") {
    return { kind: "neutral", text: "NEUTRAL" };
  }

  const teamAbbreviation =
    restAdvantage.advantageTeam === "home" ? homeAbbreviation : awayAbbreviation;
  const value = formatRestAdvantageValue(restAdvantage.differential);

  return {
    kind: "team",
    teamAbbreviation,
    value,
    text: `${teamAbbreviation} ${value}`,
  };
}

// ─── Historical evidence for a single matchup ─────────────────────

/**
 * The backtest slice a live matchup is measured against.
 *
 * House rule: no number appears without its denominator and its counterfactual, so
 * every field needed to state both is carried here rather than recomputed at the
 * call site.
 */
export type RestAdvantageEvidence = {
  /** "3 or more" for a bucketed gap, "any measurable" for the overall fallback. */
  classLabel: string;
  /** Win percentage of the more-rested team in that class (0–100, 1 decimal). */
  winPct: number;
  /** Percentage points away from the 50% coin flip. Signed. */
  deviation: number;
  /** The denominator. Never zero — a class with no games yields no evidence at all. */
  games: number;
  /** Ready-to-render sentence. */
  sentence: string;
};

/**
 * The backtest fields this module needs. Keeps callers from passing the whole payload.
 *
 * `homeAwayBreakdown` is in here because `thresholds` and `overallWinRate` are **not**
 * symmetric: `buildHistoricalBacktest` filters them through `isCalledSide`, so both describe
 * home-rested games alone. The breakdown is the only field that can speak for the other half.
 */
export type RestAdvantageEvidenceSource = Pick<
  AnalysisResponse,
  "thresholds" | "overallWinRate" | "totalGames" | "homeAwayBreakdown"
>;

/**
 * The home team's win rate over the games where the *visitor* was the fresher side.
 *
 * The same games the breakdown already counts, stated as the win they are rather than as
 * the loss backing the visitor would have been. That is the reason the rule is home-only,
 * so it is the number worth publishing.
 *
 * Derived from the counts, not as `100 − winPct`: `winPct` is already rounded to one
 * decimal, so subtracting it compounds that rounding. `games − restedTeamWins` is exact —
 * `restedTeamWon` on these rows is `!homeWon` (`rest-advantage-evidence.ts:109`), and an
 * NBA game cannot end tied, so every game in the set is one or the other.
 */
export function homeWinRateWhenVisitorRested(
  awayTeamMoreRested: HomeAwayBreakdown["awayTeamMoreRested"]
): number {
  const { games, restedTeamWins } = awayTeamMoreRested;
  return winPct(games - restedTeamWins, games);
}

/**
 * Narrows a backtest payload to the fields above, or null before it arrives.
 *
 * Two surfaces did this inline and each re-listed the four keys by hand, which is how a
 * `Pick` stops being the single statement of what the slice is. Written here, next to the
 * type, so adding a field to the evidence means editing one place rather than finding
 * every caller that spelled the old set out.
 */
export function toEvidenceSource(
  backtest: AnalysisResponse | null | undefined
): RestAdvantageEvidenceSource | null {
  if (!backtest) return null;

  return {
    thresholds: backtest.thresholds,
    overallWinRate: backtest.overallWinRate,
    totalGames: backtest.totalGames,
    homeAwayBreakdown: backtest.homeAwayBreakdown,
  };
}

/**
 * Picks the historical class a matchup belongs to and states its record.
 *
 * Takes the whole `RestAdvantage` rather than a bare differential **on purpose**. The gap's
 * magnitude alone does not identify a class: `thresholds` and `overallWinRate` are built from
 * called games only (`isCalledSide`, i.e. the rested team was also at home), so keying off
 * `Math.abs(differential)` printed a home-rested win rate onto rested-visitor cards — the very
 * games this model declines, and which `/analysis` publishes as losing at 42.4%. Passing the
 * pair together makes that mismatch unrepresentable.
 *
 * `thresholds` are CUMULATIVE (`|differential| >= threshold`), not disjoint bins, so a
 * 4.1 gap belongs to "3 or more" — not to a bucket centred on 4. Gaps the classifier
 * calls but that clear no threshold (0.5 <= |RA| < 2) fall back to the overall rate,
 * whose "any measurable" wording signals that it is the weakest class available.
 *
 * A rested visitor gets the declined half instead, stated as the loss it is. The site's rule
 * is to publish that half rather than drop it — the same thing `/analysis` does — because a
 * card showing "LAL 4.1" and then saying nothing reads as an endorsement the model withheld.
 *
 * Returns null when there is nothing honest to say: a neutral/no-call matchup, a missing
 * backtest, or a class with a zero denominator.
 */
export function buildRestAdvantageEvidence(
  restAdvantage: RestAdvantage | null | undefined,
  source: RestAdvantageEvidenceSource | null | undefined
): RestAdvantageEvidence | null {
  if (!restAdvantage) return null;
  if (!source) return null;

  const { differential, advantageTeam } = restAdvantage;
  const abs = Math.abs(differential);
  // Below the canonical call threshold the app names no team, so it claims nothing.
  if (advantageTeam === "neutral") return null;
  if (abs < NEUTRAL_REST_ADVANTAGE_THRESHOLD) return null;

  if (advantageTeam === "away") {
    const declined = source.homeAwayBreakdown?.awayTeamMoreRested;
    if (!declined || declined.games <= 0) return null;

    return {
      classLabel: "rested visitor",
      winPct: declined.winPct,
      deviation: Math.round((declined.winPct - 50) * 10) / 10,
      games: declined.games,
      sentence: `This model declines a rested visitor: backing one has won ${declined.winPct.toFixed(
        1
      )}% of the time (n = ${declined.games.toLocaleString("en-US")}).`,
    };
  }

  const cleared = source.thresholds
    .filter((bucket) => abs >= bucket.threshold && bucket.games > 0)
    .sort((a, b) => b.threshold - a.threshold)[0];

  const classLabel = cleared ? `${cleared.threshold} or more` : "any measurable";
  const winPct = cleared ? cleared.winPct : source.overallWinRate;
  const games = cleared ? cleared.games : source.totalGames;

  if (games <= 0) return null;

  const deviation = Math.round((winPct - 50) * 10) / 10;

  const subject = cleared
    ? `Gaps of ${classLabel}`
    : "Any measurable gap";

  return {
    classLabel,
    winPct,
    deviation,
    games,
    sentence: `${subject} ${
      cleared ? "have" : "has"
    } gone the rested team's way ${winPct.toFixed(
      1
    )}% of the time (n = ${games.toLocaleString("en-US")}).`,
  };
}
