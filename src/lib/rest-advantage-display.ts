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
      /**
       * The differential was projected from the published schedule, not measured from played
       * basketball — an unplayed game sits earlier in the season, so the prior-game overtime
       * and blowout terms are still open. See `src/lib/fatigue-provenance.ts`.
       *
       * A property of this one reading rather than a fourth `kind`: the cell renders the same
       * team and the same number either way, and only annotates where it came from. Making it
       * a kind would have forced every consumer to handle a case that is not different.
       */
      projected: boolean;
    }
  | {
      kind: "neutral";
      text: string;
    }
  /**
   * No fatigue pair exists for this game, so no differential was ever computed.
   *
   * Distinct from `neutral`, which is a *result*: the model measured both sides and called
   * the gap too small to act on. Folding the two together is how the Games board came to
   * print "EVEN 0.0" over all 1,200 fixtures of a released-but-unplayed season — fatigue is
   * scored from games already played, so an unstarted season has no scores to difference.
   */
  | {
      kind: "unmeasured";
      text: string;
    };

export function formatRestAdvantageValue(value: number): string {
  return Math.abs(value).toFixed(1);
}

export function formatRestAdvantageDisplay(
  restAdvantage: RestAdvantage | null,
  homeAbbreviation: string,
  awayAbbreviation: string,
  projected = false
): RestAdvantageDisplay {
  if (!restAdvantage) {
    return { kind: "unmeasured", text: "—" };
  }

  if (restAdvantage.advantageTeam === "neutral") {
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
    projected,
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
  /**
   * The class, ready to render on its own — `"gap 3 or more"`, `"gap any measurable"`, or
   * `"home court · rested visitor"`.
   *
   * Self-describing rather than a bare value with the word "gap" prepended by the caller.
   * The two branches below do not describe the same quantity, so a fixed prefix was only
   * correct for one of them: over a rested-visitor figure it read "gap rested visitor"
   * against the *home* team's rate, which states the opposite of the truth.
   */
  classLabel: string;
  /**
   * The **more-rested team's** win rate in that class (0–100, 1 decimal), on both branches.
   *
   * Symmetric since 2026-08-06. It used to flip subject: the home-rested branch reported the
   * rested team and the road-rested branch reported the home team, which made the two
   * unreadable side by side — `/upcoming` renders one column from this and the column meant
   * two different things depending on the row. Whose rate it is never varies now; what varies
   * is `baselinePct`.
   */
  winPct: number;
  /**
   * What that same side wins anyway, regardless of rest — the home baseline for a rested home
   * team, the road baseline for a rested road team.
   *
   * Inseparable from `winPct` by construction: `sentence` always states both, so a truncated
   * render cannot show one without the other. A 42.4% standing alone beside a coloured rest
   * badge reads as an endorsement of a losing side; 42.4% against 40.1% does not.
   */
  baselinePct: number;
  /** `winPct − baselinePct`, signed. The part rest accounts for. */
  lift: number;
  /** The denominator. Never zero — a class with no games yields no evidence at all. */
  games: number;
  /** Ready-to-render sentence. States the rate, the baseline and the denominator. */
  sentence: string;
};

/**
 * The backtest fields this module needs. Keeps callers from passing the whole payload.
 *
 * `homeAwayBreakdown` is in here because `thresholds` and `overallWinRate` are **not**
 * symmetric: `buildHistoricalBacktest` filters them through `isCalledSide`, so both describe
 * home-rested games alone. The breakdown is the only field that can speak for the other half.
 *
 * `venueBaseline` is in here because no rate above means anything without it. Both rows are
 * stated against what that side wins anyway, the same way `/analysis` plots them.
 */
export type RestAdvantageEvidenceSource = Pick<
  AnalysisResponse,
  "thresholds" | "overallWinRate" | "totalGames" | "homeAwayBreakdown" | "venueBaseline"
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
    venueBaseline: backtest.venueBaseline,
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
 * A rested visitor gets the uncalled half instead, stated as the home team's record over
 * those same games rather than as the visitor's loss. The site's rule is to publish that half
 * rather than drop it — the same thing `/analysis` does — because a card showing "LAL 4.1"
 * and then saying nothing reads as an endorsement the model withheld. Saying it as a home win
 * gives the reader the reason for the rule instead of only the verdict.
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

  const baseline = source.venueBaseline;
  if (!baseline || baseline.games <= 0) return null;

  if (advantageTeam === "away") {
    const onRoad = source.homeAwayBreakdown?.awayTeamMoreRested;
    if (!onRoad || onRoad.games <= 0) return null;

    return {
      classLabel: "on the road · all gaps",
      winPct: onRoad.winPct,
      baselinePct: baseline.roadWinPct,
      lift: liftPoints(onRoad.winPct, baseline.roadWinPct),
      games: onRoad.games,
      sentence: `Rested team on the road: won ${onRoad.winPct.toFixed(
        1
      )}% — road teams win ${baseline.roadWinPct.toFixed(
        1
      )}% overall (n = ${onRoad.games.toLocaleString("en-US")}).`,
    };
  }

  const cleared = source.thresholds
    .filter((bucket) => abs >= bucket.threshold && bucket.games > 0)
    .sort((a, b) => b.threshold - a.threshold)[0];

  const rate = cleared ? cleared.winPct : source.overallWinRate;
  const games = cleared ? cleared.games : source.totalGames;

  if (games <= 0) return null;

  const gapLabel = cleared ? `gap ≥ ${cleared.threshold}` : "any gap";

  return {
    classLabel: `at home · ${gapLabel}`,
    winPct: rate,
    baselinePct: baseline.homeWinPct,
    lift: liftPoints(rate, baseline.homeWinPct),
    games,
    // Same subject, same verb and same denominator form as the road branch above, so the two
    // can be read against each other rather than only against themselves.
    sentence: `Rested team at home, ${gapLabel}: won ${rate.toFixed(
      1
    )}% — home teams win ${baseline.homeWinPct.toFixed(
      1
    )}% overall (n = ${games.toLocaleString("en-US")}).`,
  };
}

/** Percentage points above the side's own baseline. One decimal, signed. */
function liftPoints(winPct: number, baselinePct: number): number {
  return Math.round((winPct - baselinePct) * 10) / 10;
}
