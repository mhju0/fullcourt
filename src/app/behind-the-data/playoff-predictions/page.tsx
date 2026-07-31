import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
} from "@/components/behind-the-data-parts";
import {
  PLAYOFF_MODEL_ACCURACY,
  PLAYOFF_MODEL_CALIBRATION,
  PLAYOFF_MODEL_EVAL,
} from "@/lib/playoff-model-metrics";
import {
  PLAYOFF_MODEL_COEFFICIENTS,
  PLAYOFF_ROUND_SPLIT,
  PLAYOFF_ROUNDS_TWO_PLUS_RECORD,
} from "@/lib/playoff-rest-facts";
import { termTdStyle, termThStyle, termThUnitStyle } from "@/lib/terminal-styles";

export const metadata: Metadata = {
  title: "Playoff Predictions — Behind the Data",
  description:
    "The playoff series model: its four features and what actually drives it, why the target is the home-court team, and why its edge is calibration rather than accuracy.",
};

/** `+0.71` from `0.7141` — sign always shown, since a bare `0.71` reads as "no direction". */
function formatCoef(weight: number): string {
  return `${weight >= 0 ? "+" : ""}${weight.toFixed(2)}`;
}

const winPctToSeedRatio = (
  PLAYOFF_MODEL_COEFFICIENTS.win_pct_diff / PLAYOFF_MODEL_COEFFICIENTS.seed_diff
).toFixed(1);

/**
 * The model's feature set, in descending order of how much it actually moves the prediction.
 *
 * `weight` is the standardized logistic coefficient, sourced from
 * `PLAYOFF_MODEL_COEFFICIENTS` (`ml/PHASE3_REPORT.md` §4) rather than hand-typed — the honest
 * ordering, and the reason this table is sorted this way rather than by narrative importance.
 * The site used to introduce `entry_rest_diff` first and call it the headline feature; the
 * coefficients say otherwise, so the page now says otherwise too.
 *
 * `logistic_grind_v2` superseded `logistic_unreg_v1` on 2026-07-31, swapping `entry_rest_diff`
 * (raw days of rest) for `prior_grind_diff` (format-aware prior-round grind). The `v1` rows are
 * retained in the DB — this table describes the current, `v2` fit. Stated in rendered copy
 * below (not just here) so a reader without the source sees it too.
 */
const FEATURES = [
  {
    name: "win_pct_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.win_pct_diff,
    what: "Regular-season win percentage, differenced.",
    why: `The dominant driver — roughly ${winPctToSeedRatio} times seed_diff's weight. This model is, first and foremost, a regular-season-record model.`,
  },
  {
    name: "seed_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.seed_diff,
    what: "Seed gap between the two teams.",
    why: "Derived as a win-percentage rank proxy rather than read from an official bracket seed, so it can drift a line in tiebreak eras.",
  },
  {
    name: "prior_grind_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.prior_grind_diff,
    what: "The opponent's prior-round grind minus the home-court team's own, where grind is games played beyond a sweep (games_played − 4 for a best-of-7, − 3 otherwise).",
    why: "The subtraction order is deliberately inverted versus the other three features so a positive coefficient still favors the home-court team. Always 0 in Round 1, since there is no prior round to have been ground down by.",
  },
  {
    name: "h2h_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.h2h_diff,
    what: "Regular-season head-to-head record between the two.",
    why: "Small samples — often three or four games — so it carries the least weight of the four.",
  },
] as const;

export default function PlayoffPredictionsMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · PLAYOFF REST"
      title="Playoff predictions"
      description="A separate model from the regular-season one, at series grain rather than game grain. Its edge is the honesty of the probability, not the pick it implies."
    >
      <Section label="WHAT IS PREDICTED" descriptor="SERIES GRAIN">
        <Prose>
          One row per playoff series. The model outputs the probability that the{" "}
          <strong>home-court team</strong> wins the series — not the higher seed, and not a
          named favourite. Home court is the reference because it is unambiguous in every era
          and needs no bracket lookup, which seeding does.
        </Prose>
        <Formula>
          {`P(home-court team wins the series)   →   ≥ 0.5 predicts them, otherwise the opponent`}
        </Formula>
        <Note>
          This is <strong>not</strong> a playoff version of the fatigue model, and it is worth
          being blunt about that because the site used to imply it was. It shares a philosophy
          with the rest model — that rest is a measurable input nobody prices — but it shares no
          code, no constants and no feature definition. Playoff games are deliberately excluded
          from the fatigue model itself: a fixed two-team series breaks its travel assumptions,
          since the opponent never changes and the itinerary is known in advance.
        </Note>
      </Section>

      <Section label="THE FEATURES" descriptor={`${FEATURES.length} INPUTS · BY WEIGHT`}>
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={termThStyle}>FEATURE</th>
                <th style={termThStyle}>
                  WEIGHT
                  <span style={termThUnitStyle}>LOG-ODDS PER UNIT</span>
                </th>
                <th style={termThStyle}>WHAT IT IS</th>
                <th style={termThStyle}>NOTE</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.name}>
                  <td style={{ ...termTdStyle, fontWeight: 700, whiteSpace: "nowrap" }}>{f.name}</td>
                  <td style={{ ...termTdStyle, fontWeight: 700, whiteSpace: "nowrap" }} className="tabular-nums">
                    {formatCoef(f.weight)}
                  </td>
                  <td style={termTdStyle}>{f.what}</td>
                  <td style={{ ...termTdStyle, color: "var(--term-text-muted)" }}>{f.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          Weights are standardized logistic coefficients, so they are comparable to each other
          directly. All four are positive: every dimension of home-court advantage pushes the
          probability the same way, which is why the model almost always picks the home-court
          team and why its picks are hard to distinguish from that rule.
          <br />
          <br />
          A fifth column, <strong>is_best_of_7</strong>, is stored on each series — first rounds
          were best-of-five through 2001-02, and a shorter series is more random — but it is{" "}
          <strong>not</strong> fed to the model. This page previously listed it as an input; it
          is not one.
          <br />
          <br />
          <strong>logistic_grind_v2</strong> superseded <strong>logistic_unreg_v1</strong> on
          2026-07-31, when <strong>entry_rest_diff</strong> (raw days of rest) was swapped for{" "}
          <strong>prior_grind_diff</strong> above. The <strong>v1</strong> prediction rows are
          retained rather than overwritten, so older predictions stay auditable.
        </Note>
      </Section>

      <Section label="WHAT THE MODEL ACTUALLY WINS AT" descriptor="CALIBRATION, NOT ACCURACY">
        <Prose>
          The honest result splits in two, and only one half is good. Measured over{" "}
          {PLAYOFF_MODEL_EVAL.folds} seasons predicted in advance ({PLAYOFF_MODEL_EVAL.series}{" "}
          series, {PLAYOFF_MODEL_EVAL.firstSeason} onward), the model produces{" "}
          <strong>materially better-calibrated probabilities</strong> than the base rate — it
          knows the difference between a lopsided matchup and a near coin flip.
        </Prose>
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={termThStyle}>METRIC</th>
                {/* No single unit fits: the rows are log loss, a Brier score and a percentage,
                    so the scale is named by each row's own METRIC cell rather than up here. */}
                <th style={termThStyle}>
                  MODEL
                  <span style={termThUnitStyle}>IN THE METRIC AT LEFT</span>
                </th>
                <th style={termThStyle}>
                  BASE RATE
                  <span style={termThUnitStyle}>IN THE METRIC AT LEFT</span>
                </th>
                <th style={termThStyle}>VERDICT</th>
              </tr>
            </thead>
            <tbody>
              {PLAYOFF_MODEL_CALIBRATION.map((m) => (
                <tr key={m.key}>
                  <td style={{ ...termTdStyle, fontWeight: 700, whiteSpace: "nowrap" }}>{m.label}</td>
                  <td style={termTdStyle} className="tabular-nums">{m.model.toFixed(4)}</td>
                  <td style={termTdStyle} className="tabular-nums">{m.baseline.toFixed(4)}</td>
                  <td style={{ ...termTdStyle, color: "var(--term-blue)", fontWeight: 700 }}>
                    {m.improvementPct}% BETTER
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...termTdStyle, fontWeight: 700, whiteSpace: "nowrap" }}>ACCURACY</td>
                <td style={termTdStyle} className="tabular-nums">
                  {(PLAYOFF_MODEL_ACCURACY.model * 100).toFixed(1)}%
                </td>
                <td style={termTdStyle} className="tabular-nums">
                  {(PLAYOFF_MODEL_ACCURACY.baseline * 100).toFixed(1)}%
                </td>
                <td style={{ ...termTdStyle, color: "var(--term-text-muted)", fontWeight: 700 }}>
                  NO REAL EDGE
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Prose>
          Log loss and Brier score are both lower-is-better measures of whether a stated
          probability is honest: a model that says 90% and is right nine times in ten scores
          well, and one that says 90% and is right six times in ten does not. The base rate is
          the simplest possible competitor — {PLAYOFF_MODEL_ACCURACY.baselineName}, at the
          historical rate they win.
        </Prose>
        <Prose>
          On <strong>accuracy</strong> that competitor is just as good. Across the same seasons
          the model beat it, tied it, and lost to it {PLAYOFF_MODEL_ACCURACY.winTieLoss}{" "}
          times, and the confidence interval around the model&rsquo;s accuracy contains the base rate
          outright. So the correct reading of this page is: <strong>use the probability, ignore
          the pick.</strong>
        </Prose>
        <Note>
          The dataset is small by the standards of any modelling problem: a few hundred series
          across the covered seasons, against roughly forty-six thousand regular-season games.
          That is the central constraint here, and it is why the model stays deliberately simple
          rather than reaching for something expressive enough to overfit — and why no amount of
          further work turns this into a strong classifier.
        </Note>
      </Section>

      <Section label="THE ROUND SPLIT" descriptor="WHERE THE ACCURACY EDGE ACTUALLY LIVES">
        <Prose>
          The pooled accuracy row above hides a split, and pooling is what produced the
          earlier &ldquo;no real edge&rdquo; reading. In Round 1, <strong>prior_grind_diff</strong>{" "}
          is 0 for every series by construction — there is no prior round to have been ground
          down by — so the model knows nothing the always-home-court rule does not, and loses
          to it. From the second round on there is a grind to read, and it wins there.
        </Prose>
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={termThStyle}>ROUNDS</th>
                <th style={termThStyle}>SERIES</th>
                <th style={termThStyle}>
                  MODEL
                  <span style={termThUnitStyle}>ACCURACY %</span>
                </th>
                <th style={termThStyle}>
                  ALWAYS HOME COURT
                  <span style={termThUnitStyle}>ACCURACY %</span>
                </th>
                <th style={termThStyle}>
                  LOG LOSS
                  <span style={termThUnitStyle}>MODEL VS BASELINE</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...termTdStyle, fontWeight: 700, whiteSpace: "nowrap" }}>Second round onward</td>
                <td style={termTdStyle} className="tabular-nums">{PLAYOFF_ROUND_SPLIT.roundsTwoPlus.n}</td>
                <td style={{ ...termTdStyle, color: "var(--term-blue)", fontWeight: 700 }} className="tabular-nums">
                  {PLAYOFF_ROUND_SPLIT.roundsTwoPlus.model.toFixed(1)}
                </td>
                <td style={termTdStyle} className="tabular-nums">{PLAYOFF_ROUND_SPLIT.roundsTwoPlus.baseline.toFixed(1)}</td>
                <td style={termTdStyle} className="tabular-nums">
                  {PLAYOFF_ROUND_SPLIT.roundsTwoPlus.logLoss.toFixed(4)} vs {PLAYOFF_ROUND_SPLIT.roundsTwoPlus.baselineLogLoss.toFixed(4)}
                </td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, fontWeight: 700, whiteSpace: "nowrap" }}>First round</td>
                <td style={termTdStyle} className="tabular-nums">{PLAYOFF_ROUND_SPLIT.roundOne.n}</td>
                <td style={termTdStyle} className="tabular-nums">{PLAYOFF_ROUND_SPLIT.roundOne.model.toFixed(1)}</td>
                <td style={{ ...termTdStyle, fontWeight: 700 }} className="tabular-nums">
                  {PLAYOFF_ROUND_SPLIT.roundOne.baseline.toFixed(1)}
                </td>
                <td style={termTdStyle} className="tabular-nums">
                  {PLAYOFF_ROUND_SPLIT.roundOne.logLoss.toFixed(4)} vs {PLAYOFF_ROUND_SPLIT.roundOne.baselineLogLoss.toFixed(4)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Note>
          {PLAYOFF_ROUND_SPLIT.roundsTwoPlus.n} series is not many, so one pooled number is not
          proof. Season by season, from the second round on, the model beat the always-home-court
          rule in {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.win} seasons, tied it in{" "}
          {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.tie}, and lost to it in{" "}
          {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.loss} — the paired, same-brackets-same-seasons
          comparison this claim actually rests on.
        </Note>
      </Section>

      <Section label="FORECAST VERSUS HINDSIGHT" descriptor="WHICH NUMBER IS REAL">
        <Prose>
          A series&rsquo; <strong>pick</strong> comes from a model trained only on seasons that
          had already finished when that series was played. That is a real forecast, and it is
          the only figure treated as evidence anywhere on the site.
        </Prose>
        <Prose>
          A series&rsquo; <strong>hindsight</strong> figure comes from one model fitted across
          every covered season at once, including the one being predicted. It already knew the
          answer, so it flatters itself and is not evidence of anything.
        </Prose>
        <Note>
          Hindsight exists for one reason: the model needs about ten seasons of prior history
          before its first honest fit, so the earliest covered brackets have no forecast at all.
          For those seasons the hindsight figure is the only number that exists, and the page
          labels it as such. For every later season the product page shows the forecast alone.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            "Injuries, which decide playoff series more often than any feature in this model.",
            "Matchup and style. A team built to beat one opponent and not another is invisible to win percentage and seeding.",
            "In-series adjustments. Coaches change rotations and schemes between games; the model predicts once, before game one.",
            "Roster change between the regular season and the playoffs — a deadline acquisition counts only through whatever win percentage it produced.",
            "Seeds are derived from win-percentage rank rather than read from an official bracket, so they can disagree with the published seeding in tiebreak situations.",
            "A probability near 0.5 is the model saying it does not know. It is not a lean worth acting on.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
