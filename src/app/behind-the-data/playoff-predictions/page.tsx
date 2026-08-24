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
  title: "Playoff Predictions — Behind the Data",
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

      <Section label="&ldquo;ISN&rsquo;T THAT JUST THE BETTER TEAM?&rdquo;" descriptor="THE CONFOUND TEST">
        <Prose>
          The Playoff Rest page shows teams winning far more often when their opponent came out
          of a long previous round. Fair objection: you earn a short series by being good, so
          maybe the fresh team just wins because it was better all along. The reason that does
          not cover it is that{" "}
          <strong>how long your opponent&rsquo;s last series went is not up to you</strong> — it
          was decided by two other teams. So hold your own last round fixed at a quick close, and
          let only their side vary.
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
          points, from something you did not control. But read the last column honestly: the
          teams whose opponents went long were also slightly better on record, so part of that
          gap is quality rather than exhaustion.
        </Prose>
        <Prose>
          So widen back out to every second-round-or-later series — no longer holding your own
          last round fixed — and keep only the evenly-matched ones, where neither side has a real
          record advantage to hide behind:{" "}
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
          points. It barely shrinks.
        </Prose>
        <Prose>
          And running it the other way — when you are the one who went the distance — moves it{" "}
          {Math.abs(PLAYOFF_GRIND_EXOGENOUS.mirrorDeltaPts).toFixed(1)} points the wrong way,
          which is the signature of a differential rather than of long series being bad in the
          absolute.
        </Prose>
        <Prose>
          The same thing counted a second way, by the layoff into Game 1 rather than by the
          previous round&rsquo;s length — rounds 2+:
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
          needed seven games to get past someone has also just shown it is worse than its record
          said — and this data cannot separate &ldquo;worn down&rdquo; from &ldquo;not as good as
          we thought.&rdquo; Game-by-game the edge does not fade the way tiredness should, which
          cuts against the fatigue reading. The effect is solid; the reason for it is arguable,
          and we would rather say so.
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
          The honest result splits in two, and only one half is good. Measured over{" "}
          {PLAYOFF_MODEL_EVAL.folds} seasons predicted in advance ({PLAYOFF_MODEL_EVAL.series}{" "}
          series, {PLAYOFF_MODEL_EVAL.firstSeason} onward), the model produces{" "}
          <strong>materially better-calibrated probabilities</strong> than the base rate — it
          knows the difference between a lopsided matchup and a near coin flip.
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
          labels it as such. For every later season the product page shows the forecast beside
          the hindsight figure, each labelled, so the two are never mistaken for each other.
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
