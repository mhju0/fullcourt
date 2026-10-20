import { PLAYOFF_MODEL_DATA_REVISION, PLAYOFF_MODEL_VERSION } from "@/lib/playoff-model-version";
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
import { LEAD, TYPE, WIDTH, termTdStyle } from "@/lib/terminal-styles";
import { DataTable } from "@/components/ui/data-table";
import { signedNumber } from "@/lib/signed-number";

export const metadata: Metadata = {
  title: "Playoff Predictions · Behind the Data",
  description:
    "The playoff series model: its four features, corrected input revision, home-court target, and held-out probability and accuracy comparisons.",
};

const winPctToSeedRatio = (
  PLAYOFF_MODEL_COEFFICIENTS.win_pct_diff / PLAYOFF_MODEL_COEFFICIENTS.seed_diff
).toFixed(1);

/**
 * Features ranked by the separate regularized interpretation fit.
 *
 * `weight` is the standardized logistic coefficient, sourced from
 * `PLAYOFF_MODEL_COEFFICIENTS` (`ml/PHASE3_REPORT.md` §4) rather than hand-typed — the honest
 * ordering, and the reason this table is sorted this way rather than by narrative importance.
 * The site used to introduce `entry_rest_diff` first and call it the headline feature; the
 * coefficients say otherwise, so the page now says otherwise too.
 *
 * `logistic_grind_v2` superseded `logistic_unreg_v1` on 2026-07-31, swapping `entry_rest_diff`
 * (raw days of rest) for `prior_grind_diff` (format-aware prior-round grind). The `v1` rows are
 * retained in the DB — this table interprets the current `v2` feature set. Stated in rendered copy
 * below (not just here) so a reader without the source sees it too.
 */
const FEATURES = [
  {
    name: "win_pct_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.win_pct_diff,
    what: "The gap in regular-season win percentage.",
    why: `The largest weight, about ${winPctToSeedRatio} times seed_diff's.`,
  },
  {
    name: "seed_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.seed_diff,
    what: "The seed gap.",
    why: "Seeds are rebuilt from win percentage and tie rules, so they can differ from the official seeding of the time.",
  },
  {
    name: "prior_grind_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.prior_grind_diff,
    what: "How much longer the opponent's last round ran than the home-court team's.",
    why: "Positive means the opponent played more games beyond a sweep. Always 0 in Round 1, which has no prior round.",
  },
  {
    name: "h2h_diff",
    weight: PLAYOFF_MODEL_COEFFICIENTS.h2h_diff,
    what: "The gap in regular-season head-to-head wins.",
    why: "Usually three or four games. The smallest weight.",
  },
] as const;

/** A row label with its series count beneath it, so a phone keeps the rate columns on screen. */
function LabelWithSeries({ label, n }: { label: string; n: number }) {
  return (
    <>
      {label}
      <br />
      <span className="mono" style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)", fontVariantNumeric: "tabular-nums", fontWeight: 400, whiteSpace: "nowrap" }}>
        {n} series
      </span>
    </>
  );
}

/** A value with a second, muted figure beneath it. */
function WithSub({ value, sub }: { value: React.ReactNode; sub: string }) {
  return (
    <>
      {value}
      <br />
      <span style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)", fontWeight: 400, whiteSpace: "nowrap" }}>{sub}</span>
    </>
  );
}

export default function PlayoffPredictionsMethodPage() {
  return (
    <BehindTheDataShell
      topic="playoff-predictions"
      eyebrow="BEHIND THE DATA · PLAYOFF REST"
      title="Playoff Rest"
      description="A separate model for playoff series, built on team records and prior-round workload, and scored on probability quality and winner accuracy."
    >
      <Section label="WHAT IS PREDICTED" title="What the model predicts">
        <Prose>
          For each playoff series, the model gives the probability that the{" "}
          <strong>home-court team</strong> wins it. That team comes from the series schedule,
          so it is not always the higher seed.
        </Prose>
        <Formula>
          {`p = P(home-court team wins series)

p ≥ 0.5  →  pick the home-court team
p < 0.5  →  pick the opponent`}
        </Formula>
        <Note>
          This model has its own inputs and weights. It does not use the regular-season
          fatigue score, and playoff games are left out of the regular-season win rates. Played
          playoff games still count toward workload.
        </Note>
      </Section>

      <Section label="THE FEATURES" title="Model inputs and interpretation" descriptor={`${FEATURES.length} inputs`} disclosure>
        <Prose>
          Four inputs, each the home-court team minus the opponent. The number beside each is
          its standardized weight, in log-odds per standard deviation.
        </Prose>
        <ul className="flex flex-col gap-3" style={{ maxWidth: WIDTH.prose }}>
          {FEATURES.map((f) => (
            <li key={f.name} style={{ fontSize: TYPE.body, lineHeight: LEAD.body, color: "var(--term-text)" }}>
              <strong className="mono">{f.name}</strong>{" "}
              <span className="mono" style={{ fontVariantNumeric: "tabular-nums", color: "var(--term-blue-text)", fontWeight: 700 }}>
                {signedNumber(f.weight, 2)}
              </span>
              <br />
              {f.what}{" "}
              <span style={{ color: "var(--term-text-muted)" }}>{f.why}</span>
            </li>
          ))}
        </ul>
        <Formula>
          {`grind = games played − 4  (best of 7)
        games played − 3  (best of 5)`}
        </Formula>
        <Note>
          These weights come from a separate full-sample fit (L2, C = 1), used only to compare
          the inputs. The displayed probabilities come from unregularized fits, refitted for
          each walk-forward window. All four weights are positive, but an input can be negative,
          so it can favor the opponent. A large weight is not proof of cause.
        </Note>
        <Note>
          Series format (<strong>is_best_of_7</strong>) is stored but is not a model input. It
          only sets the grind formula above. First rounds were best-of-five through 2001-02.
        </Note>
        <Note>
          <strong>logistic_grind_v2</strong> replaced <strong>logistic_unreg_v1</strong> on
          2026-07-31, swapping <strong>entry_rest_diff</strong> (raw days of rest) for{" "}
          <strong>prior_grind_diff</strong>. The current data revision,{" "}
          <strong>{PLAYOFF_MODEL_VERSION}</strong>, refits the same model on corrected inputs
          as of {PLAYOFF_MODEL_DATA_REVISION}. Older v1 and v2 rows are kept for audit.
          Walk-forward picks still train only on earlier seasons.
        </Note>
      </Section>

      <Section label="&ldquo;ISN&rsquo;T THAT JUST THE BETTER TEAM?&rdquo;" title="Accounting for team strength" disclosure>
        <Prose>
          A short previous series can mean a strong team as well as a rested one. To narrow
          that down, this keeps only teams that closed their own last round early, then splits
          them by how long their opponent&rsquo;s last round ran. It narrows the comparison
          but does not remove differences in team quality.
        </Prose>
        <DataTable
          rows={[
            { label: "Opponent closed early", ...PLAYOFF_GRIND_EXOGENOUS.oppClosedEarly },
            // The row the section exists to show, so its rate is the one that carries colour.
            { label: "Opponent went long", ...PLAYOFF_GRIND_EXOGENOUS.oppWentLong, lead: true },
          ]}
          rowKey={(r) => r.label}
          rowAttrs={(_r, i) =>
            i === 1 ? { style: { borderTop: "1px solid var(--term-border)" } } : {}
          }
          columns={[
            {
              label: "OPPONENT'S LAST ROUND",
              style: { fontWeight: 700 },
              cell: (r) => <LabelWithSeries label={r.label} n={r.n} />,
            },
            {
              label: "YOU WON",
              unit: "SERIES %",
              numeric: true,
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
              label: "RECORD EDGE",
              unit: "WIN % PTS",
              numeric: true,
              // Stored as a 0–1 fraction; printed in percentage points to match the WIN% unit.
              cell: (r) => (r.meanWinPctDiff * 100).toFixed(1),
            },
          ]}
        />
        <Prose>
          The two groups are{" "}
          {(
            PLAYOFF_GRIND_EXOGENOUS.oppWentLong.winPct -
            PLAYOFF_GRIND_EXOGENOUS.oppClosedEarly.winPct
          ).toFixed(1)}{" "}
          points apart. Teams facing a long-series opponent also had slightly better records,
          which muddies the comparison.
        </Prose>
        <Prose>
          A second cut: rounds 2 and later, teams within eight points of each other in
          regular-season win percentage, with no filter on the team&rsquo;s own last round.
          Teams won{" "}
          <strong>
            {PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppClosedEarly.winPct.toFixed(1)}% against an
            opponent that closed early and{" "}
            {PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppWentLong.winPct.toFixed(1)}% against one that
            went long
          </strong>{" "}
          ({PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppClosedEarly.n} and{" "}
          {PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppWentLong.n} series), a gap of{" "}
          {(
            PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppWentLong.winPct -
            PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppClosedEarly.winPct
          ).toFixed(1)}{" "}
          points.
        </Prose>
        <Prose>
          For teams that went long themselves, the gap reverses by{" "}
          {Math.abs(PLAYOFF_GRIND_EXOGENOUS.mirrorDeltaPts).toFixed(1)}{" "}points. So the pattern
          depends on both teams&rsquo; last rounds.
        </Prose>
        <Prose>
          The same question by days of rest before Game 1, rounds 2 and later:
        </Prose>
        <DataTable
          rows={PLAYOFF_ENTRY_REST_BUCKETS}
          rowKey={(b) => b.label}
          rowAttrs={(_b, i) =>
            i > 0 ? { style: { borderTop: "1px solid var(--term-border)" } } : {}
          }
          columns={[
            {
              label: "HOME-COURT TEAM",
              unit: "REST VS OPPONENT",
              style: { fontWeight: 700 },
              cell: (b) => <LabelWithSeries label={b.label} n={b.n} />,
            },
            {
              label: "IT WON",
              unit: "SERIES %",
              numeric: true,
              cell: (b) => b.winPct.toFixed(1),
            },
          ]}
        />
        <Note>
          <strong>What we cannot tell you:</strong> whether this is fatigue. A team that needed
          seven games may also be weaker than its record says. Series results cannot separate
          the two, and they say nothing about player recovery.
        </Note>
        <Note>
          &ldquo;Closed early&rdquo; means winning the last round within one game of a sweep.
          &ldquo;Went long&rdquo; means two or more games beyond a sweep: game 6 or 7 of a
          best-of-seven, game 5 of a best-of-five. Grind counts games beyond a sweep, not games
          played, because {PLAYOFF_BEST_OF_FIVE.round1BestOfFive} of{" "}
          {PLAYOFF_BEST_OF_FIVE.round1Total} first rounds here were best-of-five. In those, five
          games is the full distance, not an early close.
        </Note>
      </Section>

      <Section label="WHAT THE MODEL ACTUALLY WINS AT" title="Probability quality and winner accuracy" disclosure>
        <Prose>
          Each season is predicted by a model trained only on earlier seasons. Over{" "}
          {PLAYOFF_MODEL_EVAL.folds} held-out seasons ({PLAYOFF_MODEL_EVAL.series} series,{" "}
          {PLAYOFF_MODEL_EVAL.firstSeason} onward), its probabilities beat a baseline that gives
          every series the home-court win rate from the training seasons.
        </Prose>
        <DataTable
          rows={PLAYOFF_MODEL_CALIBRATION}
          rowKey={(m) => m.key}
          columns={[
            {
              label: "METRIC",
              style: { fontWeight: 700 },
              cell: (m) => m.label,
            },
            // No single unit fits: the rows are log loss, a Brier score and a percentage, so
            // the scale is named by each row's own METRIC cell rather than up here.
            {
              label: "MODEL",
              numeric: true,
              cell: (m) => m.model.toFixed(4),
            },
            {
              label: "BASE RATE",
              numeric: true,
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
            <td style={{ ...termTdStyle, fontWeight: 700 }}>ACCURACY</td>
            <td style={{ ...termTdStyle, textAlign: "right" }} className="tabular-nums">
              {(PLAYOFF_MODEL_ACCURACY.model * 100).toFixed(1)}%
            </td>
            <td style={{ ...termTdStyle, textAlign: "right" }} className="tabular-nums">
              {(PLAYOFF_MODEL_ACCURACY.baseline * 100).toFixed(1)}%
            </td>
            <td style={{ ...termTdStyle, color: "var(--term-text-muted)", fontWeight: 700 }}>
              NO CLEAR EDGE
            </td>
          </tr>
        </DataTable>
        <Prose>
          Log loss and Brier score both measure how well a stated probability matches what
          happened. Lower is better, and both punish confident misses. Here the baseline always
          picks the home-court team.
        </Prose>
        <Prose>
          Picking winners is a different story. Season by season, the model beat the baseline,
          tied it and lost to it {PLAYOFF_MODEL_ACCURACY.winTieLoss} times. That mixed record
          does not show a reliable gain. The evidence supports better probabilities more than
          better picks.
        </Prose>
        <Note>
          There are only a few hundred series. That limits precision, especially by round, and
          makes a more complex model easy to overfit.
        </Note>
      </Section>

      <Section label="THE ROUND SPLIT" title="Accuracy by playoff round" disclosure>
        <Prose>
          In Round 1, <strong>prior_grind_diff</strong> is always 0, since there is no earlier
          round. There the model picks winners less often than always taking the home-court
          team. From Round 2 on it picks them more often. This split alone does not show how
          much of that comes from the grind input.
        </Prose>
        <DataTable
          // Each row emphasises whichever of the two accuracy columns actually won it — blue
          // for the model, plain bold for the always-home-court rule. Naming the winner is
          // what makes the split legible: the model wins from round two, and loses round one.
          rows={[
            {
              label: "Round 2 on",
              ...PLAYOFF_ROUND_SPLIT.roundsTwoPlus,
              winner: "model" as const,
            },
            {
              label: "Round 1",
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
              style: { fontWeight: 700 },
              cell: (r) => <LabelWithSeries label={r.label} n={r.n} />,
            },
            {
              label: "MODEL",
              unit: "ACCURACY %",
              numeric: true,
              cell: (r) => (
                <WithSub
                  value={
                    <span
                      style={
                        r.winner === "model"
                          ? { color: "var(--term-blue-text)", fontWeight: 700 }
                          : undefined
                      }
                    >
                      {r.model.toFixed(1)}
                    </span>
                  }
                  sub={`log loss ${r.logLoss.toFixed(4)}`}
                />
              ),
            },
            {
              label: "HOME COURT",
              unit: "ACCURACY %",
              numeric: true,
              cell: (r) => (
                <WithSub
                  value={<span style={r.winner === "baseline" ? { fontWeight: 700 } : undefined}>{r.baseline.toFixed(1)}</span>}
                  sub={`log loss ${r.baselineLogLoss.toFixed(4)}`}
                />
              ),
            },
          ]}
        />
        <Note>
          HOME COURT always picks the home-court team. Its log loss here uses each slice&rsquo;s
          own observed home-court win rate, a hindsight constant, so it differs from the
          training-only baseline in the table above.
        </Note>
        <Note>
          {PLAYOFF_ROUND_SPLIT.roundsTwoPlus.n} series is not many, so one pooled number is not
          proof. The claim rests on a paired, season-by-season count: from Round 2 on, the model
          beat the always-home-court rule in {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.win} seasons, tied
          it in {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.tie} and lost in{" "}
          {PLAYOFF_ROUNDS_TWO_PLUS_RECORD.loss}.
        </Note>
      </Section>

      <Section label="FORECAST VERSUS HINDSIGHT" title="Forecast and hindsight estimates" disclosure>
        <DataTable wrapperClassName="reference-definitions" rows={[
          { label: "Forecast", meaning: "Trained only on seasons before the one predicted." },
          { label: "Hindsight", meaning: "Fitted on every season, including the one predicted. It cannot show predictive skill." },
        ]} rowKey={(row) => row.label} columns={[
          { label: "Estimate", cell: (row) => row.label },
          { label: "Training data", cell: (row) => row.meaning },
        ]} />
        <Prose>
          A series&rsquo; <strong>pick</strong> is a forecast. These are rebuilt today from the
          corrected inputs, so they are not proof that the same probabilities existed before
          each series began.
        </Prose>
        <Note>
          Hindsight exists for one reason. The model needs about ten seasons of history before
          its first forecast, so the earliest brackets have none. For those seasons the
          hindsight figure is the only number, and the page labels it that way. Where both
          exist, the product page labels them separately.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "Injuries and expected player availability.",
            "Matchups and style. A team built to beat one opponent and not another looks the same in win percentage and seeding.",
            "In-series changes. Coaches adjust rotations and schemes between games; the model uses pre-series inputs only.",
            "Roster changes, except as they show up in regular-season results.",
            "Official seeds. Seeds here are rebuilt from win percentage and tie rules and can differ from the real bracket.",
            "A probability near 0.5 means the model does not know. It is not a lean worth acting on.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
