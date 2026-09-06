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
  PLAYOFF_BEST_OF_FIVE,
  PLAYOFF_ENTRY_REST_BUCKETS,
  PLAYOFF_GRIND_EXOGENOUS,
  PLAYOFF_MODEL_COEFFICIENTS,
  PLAYOFF_ROUND_SPLIT,
  PLAYOFF_ROUNDS_TWO_PLUS_RECORD,
} from "@/lib/playoff-rest-facts";
import { termTdStyle } from "@/lib/terminal-styles";
import { DataTable } from "@/components/ui/data-table";
import { signedNumber } from "@/lib/signed-number";

export const metadata: Metadata = {
  title: "Playoff Predictions · Behind the Data",
  description:
    "The playoff series model: its four features and what actually drives it, why the target is the home-court team, and why its edge is calibration rather than accuracy.",
};

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
    why: `The largest standardized coefficient, roughly ${winPctToSeedRatio} times seed_diff's weight.`,
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
    why: "Usually based on three or four games. It has the smallest standardized coefficient.",
  },
] as const;

export default function PlayoffPredictionsMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · PLAYOFF REST"
      title="Playoff predictions"
      description="A separate model for playoff series, using team records and prior-round workload. It is evaluated on probability quality and winner accuracy."
    >
      <Section label="WHAT IS PREDICTED" descriptor="SERIES GRAIN">
        <Prose>
          One row per playoff series. The model outputs the probability that the{" "}
          <strong>home-court team</strong> wins the series. That reference side comes from the
          series schedule and can differ from the higher-seeded team.
        </Prose>
        <Formula>
          {`P(home-court team wins the series)   →   ≥ 0.5 predicts them, otherwise the opponent`}
        </Formula>
        <Note>
          This model has its own features and fitted coefficients. Playoff games are excluded
          from the fatigue model itself: a fixed two-team series breaks its travel assumptions,
          since the opponent never changes and the itinerary is known in advance.
        </Note>
      </Section>

      <Section label="THE FEATURES" descriptor={`${FEATURES.length} INPUTS · BY WEIGHT`}>
        <DataTable
          rows={FEATURES}
          rowKey={(f) => f.name}
          columns={[
            {
              label: "FEATURE",
              className: "whitespace-nowrap",
              style: { fontWeight: 700 },
              cell: (f) => f.name,
            },
            {
              label: "WEIGHT",
              unit: "LOG-ODDS PER UNIT",
              // Left, not right: the weights are read against each other as a list, and the
              // column sits between two prose columns rather than among numbers.
              align: "left",
              className: "whitespace-nowrap tabular-nums",
              style: { fontWeight: 700 },
              cell: (f) => signedNumber(f.weight, 2),
            },
            { label: "WHAT IT IS", cell: (f) => f.what },
            {
              label: "NOTE",
              style: { color: "var(--term-text-muted)" },
              cell: (f) => f.why,
            },
          ]}
        />
        <Note>
          Weights are standardized logistic coefficients, so they are comparable to each other
          directly. All four are positive: every dimension of home-court advantage pushes the
          probability the same way, which is why the model almost always picks the home-court
          team and why its picks are hard to distinguish from that rule.
          <br />
          <br />
          A fifth column, <strong>is_best_of_7</strong>, records series format. First rounds
          were best-of-five through 2001-02. Format adjusts the prior-round grind calculation
          but is <strong>not</strong> a separate model input.
          <br />
          <br />
          <strong>logistic_grind_v2</strong> superseded <strong>logistic_unreg_v1</strong> on
          2026-07-31, when <strong>entry_rest_diff</strong> (raw days of rest) was swapped for{" "}
          <strong>prior_grind_diff</strong> above. The <strong>v1</strong> prediction rows are
          retained rather than overwritten, so older predictions stay auditable.
        </Note>
      </Section>

      <Section label="&ldquo;ISN&rsquo;T THAT JUST THE BETTER TEAM?&rdquo;" descriptor="THE CONFOUND TEST">
        <Prose>
          A short prior series can indicate team strength as well as less workload. The first
          comparison keeps only teams that closed their own previous round early, then groups
          them by how long their opponent&rsquo;s round lasted. This narrows the comparison but
          does not randomly assign opponents or eliminate differences in team quality.
        </Prose>
        <DataTable
          rows={[
            { label: "They closed it early", ...PLAYOFF_GRIND_EXOGENOUS.oppClosedEarly },
            // The row the section exists to show, so its rate is the one that carries colour.
            { label: "They went the distance", ...PLAYOFF_GRIND_EXOGENOUS.oppWentLong, lead: true },
          ]}
          rowKey={(r) => r.label}
          rowAttrs={(_r, i) =>
            i === 1 ? { style: { borderTop: "1px solid var(--term-border)" } } : {}
          }
          columns={[
            {
              label: "THEIR LAST ROUND",
              className: "whitespace-nowrap",
              style: { fontWeight: 700 },
              cell: (r) => r.label,
            },
            // Left-aligned, as they were: this table's numbers are two rows to compare against
            // each other, not a column to scan down.
            { label: "SERIES", className: "tabular-nums", cell: (r) => r.n },
            {
              label: "YOU WON THE SERIES",
              unit: "%",
              className: "tabular-nums",
              cell: (r) => (
                <span
                  style={
                    "lead" in r ? { color: "var(--term-blue-text)", fontWeight: 700 } : undefined
                  }
                >
                  {r.winPct.toFixed(1)}
                </span>
              ),
            },
            {
              label: "YOUR RECORD EDGE",
              unit: "MEAN WIN% DIFF",
              className: "tabular-nums",
              cell: (r) => r.meanWinPctDiff.toFixed(3),
            },
          ]}
        />
        <Prose>
          {(
            PLAYOFF_GRIND_EXOGENOUS.oppWentLong.winPct -
            PLAYOFF_GRIND_EXOGENOUS.oppClosedEarly.winPct
          ).toFixed(1)}{" "}
          percentage points separate the groups. Teams whose opponents went long were also
          slightly better by regular-season record, so that difference can confound the comparison.
        </Prose>
        <Prose>
          Across second-round-or-later series with similar regular-season records, without
          holding the team&rsquo;s own prior round fixed, the rates are{" "}
          <strong>
            {PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppClosedEarly.winPct.toFixed(1)}% becomes{" "}
            {PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppWentLong.winPct.toFixed(1)}%
          </strong>{" "}
          ({PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppClosedEarly.n} series against{" "}
          {PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppWentLong.n}), a gap of{" "}
          {(
            PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppWentLong.winPct -
            PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppClosedEarly.winPct
          ).toFixed(1)}{" "}
          percentage points.
        </Prose>
        <Prose>
          For teams that went the distance themselves, the comparison reverses by{" "}
          {Math.abs(PLAYOFF_GRIND_EXOGENOUS.mirrorDeltaPts).toFixed(1)}{" "}points. The association
          depends on both teams&rsquo; prior rounds.
        </Prose>
        <Prose>
          The same thing counted a second way, by the layoff into Game 1 rather than by the
          previous round&rsquo;s length, for rounds 2+:
        </Prose>
        <DataTable
          rows={PLAYOFF_ENTRY_REST_BUCKETS}
          rowKey={(b) => b.label}
          rowAttrs={(_b, i) =>
            i > 0 ? { style: { borderTop: "1px solid var(--term-border)" } } : {}
          }
          columns={[
            {
              label: "REST INTO GAME 1",
              className: "whitespace-nowrap",
              style: { fontWeight: 700 },
              cell: (b) => b.label,
            },
            { label: "SERIES", className: "tabular-nums", cell: (b) => b.n },
            {
              label: "WON THE SERIES",
              unit: "%",
              className: "tabular-nums",
              cell: (b) => b.winPct.toFixed(1),
            },
          ]}
        />
        <Note>
          <strong>What we cannot tell you:</strong>{" "}
          whether it is really fatigue. A team that
          needed seven games may also be weaker than its regular-season record suggests.
          These comparisons cannot separate that possibility from fatigue. The association
          does not fade game by game as a simple recovery explanation would predict.
          <br />
          <br />
          &ldquo;Closed it early&rdquo; means a team won its previous round within one game of a
          sweep; &ldquo;went the distance&rdquo; means it needed the last game or the one before
          it. Grind is counted as games beyond a sweep rather than as raw games played because{" "}
          {PLAYOFF_BEST_OF_FIVE.round1BestOfFive} of {PLAYOFF_BEST_OF_FIVE.round1Total} first
          rounds in this record were best-of-five, where five games means a team went the full
          distance rather than closing early.
        </Note>
      </Section>

      <Section label="WHAT THE MODEL ACTUALLY WINS AT" descriptor="CALIBRATION, NOT ACCURACY">
        <Prose>
          In walk-forward evaluation over{" "}
          {PLAYOFF_MODEL_EVAL.folds} held-out seasons ({PLAYOFF_MODEL_EVAL.series}{" "}
          series, {PLAYOFF_MODEL_EVAL.firstSeason} onward), the model produces{" "}
          lower probability-error scores than a constant historical home-court win rate.
        </Prose>
        <DataTable
          rows={PLAYOFF_MODEL_CALIBRATION}
          rowKey={(m) => m.key}
          columns={[
            {
              label: "METRIC",
              className: "whitespace-nowrap",
              style: { fontWeight: 700 },
              cell: (m) => m.label,
            },
            // No single unit fits: the rows are log loss, a Brier score and a percentage, so
            // the scale is named by each row's own METRIC cell rather than up here.
            {
              label: "MODEL",
              unit: "IN THE METRIC AT LEFT",
              className: "tabular-nums",
              cell: (m) => m.model.toFixed(4),
            },
            {
              label: "BASE RATE",
              unit: "IN THE METRIC AT LEFT",
              className: "tabular-nums",
              cell: (m) => m.baseline.toFixed(4),
            },
            {
              label: "VERDICT",
              style: { color: "var(--term-blue-text)", fontWeight: 700 },
              cell: (m) => `${m.improvementPct}% BETTER`,
            },
          ]}
        >
          {/* Accuracy is the half of the result that is not a win, so it sits below the three
              calibration rows rather than among them — and its verdict is muted, not blue. */}
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
        </DataTable>
        <Prose>
          Log loss and Brier score are both lower-is-better measures of whether a stated
          probability matches the outcome. Both penalise confident errors. The base rate uses{" "}
          {PLAYOFF_MODEL_ACCURACY.baselineName}, at the
          historical rate they win.
        </Prose>
        <Prose>
          On <strong>accuracy</strong> that competitor is just as good. Across the same seasons
          the model beat it, tied it, and lost to it {PLAYOFF_MODEL_ACCURACY.winTieLoss}{" "}
          times, and the confidence interval around the model&rsquo;s accuracy contains the base rate
          outright. The evaluation provides stronger support for improved probability
          estimates than for improved winner selection.
        </Prose>
        <Note>
          The dataset contains only a few hundred series. That limits precision, especially
          for round-level comparisons, and increases the risk of overfitting more complex models.
        </Note>
      </Section>

      <Section label="THE ROUND SPLIT" descriptor="WHERE THE ACCURACY EDGE ACTUALLY LIVES">
        <Prose>
          Accuracy differs by round in this sample. In Round 1, <strong>prior_grind_diff</strong>{" "}
          is always 0 because there is no prior round. The model still uses its other features,
          but its accuracy falls below the always-home-court rule. From Round 2 onward its
          observed accuracy is higher. This split alone does not isolate the grind term&rsquo;s contribution.
        </Prose>
        <DataTable
          // Each row emphasises whichever of the two accuracy columns actually won it — blue
          // for the model, plain bold for the always-home-court rule. Naming the winner is
          // what makes the split legible: the model wins from round two, and loses round one.
          rows={[
            {
              label: "Second round onward",
              ...PLAYOFF_ROUND_SPLIT.roundsTwoPlus,
              winner: "model" as const,
            },
            {
              label: "First round",
              ...PLAYOFF_ROUND_SPLIT.roundOne,
              winner: "baseline" as const,
            },
          ]}
          rowKey={(r) => r.label}
          rowAttrs={(_r, i) =>
            i === 1 ? { style: { borderTop: "1px solid var(--term-border)" } } : {}
          }
          columns={[
            {
              label: "ROUNDS",
              className: "whitespace-nowrap",
              style: { fontWeight: 700 },
              cell: (r) => r.label,
            },
            { label: "SERIES", className: "tabular-nums", cell: (r) => r.n },
            {
              label: "MODEL",
              unit: "ACCURACY %",
              className: "tabular-nums",
              cell: (r) => (
                <span
                  style={
                    r.winner === "model"
                      ? { color: "var(--term-blue-text)", fontWeight: 700 }
                      : undefined
                  }
                >
                  {r.model.toFixed(1)}
                </span>
              ),
            },
            {
              label: "ALWAYS HOME COURT",
              unit: "ACCURACY %",
              className: "tabular-nums",
              cell: (r) => (
                <span style={r.winner === "baseline" ? { fontWeight: 700 } : undefined}>
                  {r.baseline.toFixed(1)}
                </span>
              ),
            },
            {
              label: "LOG LOSS",
              unit: "MODEL VS BASELINE",
              className: "tabular-nums",
              cell: (r) => `${r.logLoss.toFixed(4)} vs ${r.baselineLogLoss.toFixed(4)}`,
            },
          ]}
        />
        <Note>
          {PLAYOFF_ROUND_SPLIT.roundsTwoPlus.n} series is not many, so one pooled number is not
          proof. Season by season, from the second round on, the model beat the always-home-court
          rule in {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.win} seasons, tied it in{" "}
          {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.tie}, and lost to it in{" "}
          {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.loss}, a paired, same-brackets-same-seasons
          comparison this claim actually rests on.
        </Note>
      </Section>

      <Section label="FORECAST VERSUS HINDSIGHT" descriptor="WHICH NUMBER IS REAL">
        <Prose>
          A series&rsquo; <strong>pick</strong> comes from a model trained only on seasons that
          had already finished when that series was played. Historical picks are walk-forward
          predictions: the target season is excluded from training.
        </Prose>
        <Prose>
          A series&rsquo; <strong>hindsight</strong> figure comes from one model fitted across
          every covered season at once, including the one being predicted. This is an
          in-sample estimate and cannot establish predictive performance.
        </Prose>
        <Note>
          Hindsight exists for one reason: the model needs about ten seasons of prior history
          before its first walk-forward fit, so the earliest covered brackets have no such forecast.
          For those seasons the hindsight figure is the only number that exists, and the page
          labels it as such. For every later season the product page shows the forecast beside
          the hindsight figure, each labelled, so the two are never mistaken for each other.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="LIMITATIONS">
        <LimitList
          items={[
            "Injuries and expected player availability.",
            "Matchup and style. A team built to beat one opponent and not another is invisible to win percentage and seeding.",
            "In-series adjustments. Coaches change rotations and schemes between games; the model predicts once, before game one.",
            "Roster changes are reflected only indirectly through the team's regular-season results.",
            "Seeds are derived from win-percentage rank rather than read from an official bracket, so they can disagree with the published seeding in tiebreak situations.",
            "A probability near 0.5 is the model saying it does not know. It is not a lean worth acting on.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
