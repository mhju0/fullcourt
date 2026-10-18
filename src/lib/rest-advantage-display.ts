import { winPct } from "@/lib/rest-advantage-evidence";
import type { HomeAwayBreakdown, RestAdvantage } from "@/types";

export type RestAdvantageDisplay =
  | {
      kind: "team";
      teamAbbreviation: string;
      value: string;
      text: string;
      /** See the note on the neutral branch below. */
      projected: boolean;
    }
  | {
      kind: "neutral";
      text: string;
      /**
       * The differential was projected from the published schedule, not measured from played
       * basketball — an unplayed game sits earlier in the season, so the prior-game overtime
       * and blowout terms are still open. See `src/lib/fatigue-provenance.ts`.
       *
       * A property of the reading rather than a fourth `kind`: the cell renders the same team
       * and the same number either way and only annotates where it came from, so making it a
       * kind would force consumers to handle a case that is not different.
       *
       * **Carried on `neutral` as well as `team`, and that is not redundant.** `neutral` is a
       * claim about the *result* — measured, and the gap came out too small to act on — which
       * is a different statement from a projected gap that is currently too small and can still
       * move. Leaving it off meant a board full of projected rows showed some annotated and
       * some not, with nothing marking the difference. `unmeasured` is the one branch that
       * takes no flag: there is no reading there to attribute.
       */
      projected: boolean;
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

/**
 * One decimal, cut rather than rounded: 2.96 prints 2.9, 3.09 prints 3.0 (D-98). Display only;
 * every comparison still reads the two-decimal value.
 *
 * Cutting is what keeps a printed figure on the same side of every line as its label. Each line
 * (EVEN under 0.5, MEDIUM REST EDGE at 3, LARGE at 5) sits on a tenth, and a value is at or above
 * a tenth exactly when its cut is. Rounding put 0.46 beside EVEN as "0.5" and 2.96 beside no badge as "3.0", 983
 * games in all, which is why D-87 printed two decimals until the owner chose this.
 *
 * The epsilon absorbs float error in an exact tenth (`0.3 * 10` is fine, but a computed 2.9 can
 * land a hair under), without lifting any real hundredth.
 */
export function cutToTenths(value: number): string {
  const tenths = Math.floor(Math.abs(value) * 10 + 1e-9) / 10;
  return `${value < 0 && tenths > 0 ? "-" : ""}${tenths.toFixed(1)}`;
}

/** The gap without its sign; the team name beside it carries the direction. */
export function formatRestAdvantageValue(value: number): string {
  return cutToTenths(Math.abs(value));
}

/**
 * A fatigue score, cut to one decimal like the gap. The two printed scores can differ from the
 * printed gap by 0.1, because each is cut separately (measured 2026-10-16: 20,889 of 48,431
 * games); the owner accepted that to keep every label in agreement with its figure.
 */
export function formatFatigueScore(score: number): string {
  return cutToTenths(score);
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
    return { kind: "neutral", text: "NEUTRAL", projected };
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

// ─── Historical evidence ─────────────────────────────────────────

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
