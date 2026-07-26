import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence";
import type { AnalysisResponse, RestAdvantage } from "@/types";

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

/** The backtest fields this module needs. Keeps callers from passing the whole payload. */
export type RestAdvantageEvidenceSource = Pick<
  AnalysisResponse,
  "thresholds" | "overallWinRate" | "totalGames"
>;

/**
 * Picks the historical class a matchup belongs to and states its record.
 *
 * `thresholds` are CUMULATIVE (`|differential| >= threshold`), not disjoint bins, so a
 * 4.1 gap belongs to "3 or more" — not to a bucket centred on 4. Gaps the classifier
 * calls but that clear no threshold (0.5 <= |RA| < 2) fall back to the overall rate,
 * whose "any measurable" wording signals that it is the weakest class available.
 *
 * Returns null when there is nothing honest to say: a neutral/no-call matchup, a missing
 * backtest, or a class with a zero denominator.
 */
export function buildRestAdvantageEvidence(
  differential: number | null | undefined,
  source: RestAdvantageEvidenceSource | null | undefined
): RestAdvantageEvidence | null {
  if (differential === null || differential === undefined) return null;
  if (!source) return null;

  const abs = Math.abs(differential);
  // Below the canonical call threshold the app names no team, so it claims nothing.
  if (abs < NEUTRAL_REST_ADVANTAGE_THRESHOLD) return null;

  const cleared = source.thresholds
    .filter((bucket) => abs >= bucket.threshold && bucket.games > 0)
    .sort((a, b) => b.threshold - a.threshold)[0];

  const classLabel = cleared ? `${cleared.threshold} or more` : "any measurable";
  const winPct = cleared ? cleared.winPct : source.overallWinRate;
  const games = cleared ? cleared.games : source.totalGames;

  if (games <= 0) return null;

  const deviation = Math.round((winPct - 50) * 10) / 10;
  const magnitude = Math.abs(deviation).toFixed(1);
  const counterfactual =
    deviation > 0
      ? `${magnitude} points above a coin flip`
      : deviation < 0
        ? `${magnitude} points below a coin flip`
        : "level with a coin flip";

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
    )}% of the time — ${counterfactual} (n = ${games.toLocaleString("en-US")}).`,
  };
}
