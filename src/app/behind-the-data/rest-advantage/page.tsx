import type { Metadata } from "next";
import Link from "next/link";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
} from "@/components/behind-the-data-parts";
import { FATIGUE_CONSTANTS as K } from "@/lib/fatigue";
import {
  HOME_BAR_COUNTERFACTUAL,
  liftOverBaseline,
  RESTED_AT_HOME,
  RESTED_ON_ROAD,
  RESTED_ON_ROAD_BY_ERA,
  REST_SPLIT_BASELINE,
  REST_SPLIT_SAMPLE,
  THIN_SAMPLE_GAMES,
  type RestGapRung,
} from "@/lib/rest-split-facts";
import { termTdStyle } from "@/lib/terminal-styles";
import { DataTable } from "@/components/ui/data-table";
import { signedNumber } from "@/lib/signed-number";

export const metadata: Metadata = {
  title: "Rest Advantage · Behind the Data",
  description:
    "The fatigue score in full: its eight terms, every constant, and single-term ablations showing which of them actually carry the result.",
};

/**
 * The flagship model's reference page. Constants are read from `FATIGUE_CONSTANTS` rather
 * than retyped, so the prose cannot drift from the code. Measured figures carry the date
 * they were measured, because they need a full-table analysis that is not worth running per
 * page view.
 */
const MEASURED_ON = "2026-07-30";

/**
 * Single-term ablations, re-measured 2026-08-02 by `ml/ablate_fatigue_terms.py`.
 *
 * These replace a table measured on 2026-07-30 that asked a question the model can no
 * longer be asked. That version held the set of games fixed and reported how much
 * *accuracy* each term was worth, which only had an answer while the rule could pick
 * either side: drop a term, the pick flips home to away, accuracy moves. Since
 * 2026-08-02 a called game is always a pick of the home team, so on a fixed sample every
 * ablated model makes the identical pick and every term would score exactly zero.
 *
 * What the terms do now is *select* — they decide which games get called at all. Each row
 * neutralises one term and re-derives the call under the shipped rule.
 *
 * `found` / `foundWinPct` are the load-bearing columns, and `delta` is the trap. A term
 * that finds extra winners at a rate below the model's own 61.17% average *lowers* the
 * headline while *raising* the number of games won. Travel is exactly that: it is the
 * single largest contributor of correct calls (+404 above a coin flip, more than any other
 * term) and it still moves the headline +0.32pp when removed, because its 5,994 games win
 * at 59.14% rather than 61.17%. Reading `delta` alone says delete it. Deleting it would
 * give up more winning predictions than any other change available.
 *
 * Ordered by wins-above-a-coin-flip surrendered, not by delta.
 */
const ABLATIONS_MEASURED_ON = "2026-08-02";
const ABLATION_BASELINE = { winPct: 61.17, called: 27400, edge: 3061 };
const ABLATIONS = [
  { term: "Travel", delta: 0.32, found: 5994, foundWinPct: 59.14, edgeLost: 404 },
  { term: "Recent workload (decay)", delta: -0.68, found: 3437, foundWinPct: 63.37, edgeLost: 336 },
  { term: "Back-to-back", delta: -0.31, found: 1743, foundWinPct: 63.57, edgeLost: 210 },
  { term: "Road segment", delta: 0.24, found: 2784, foundWinPct: 58.94, edgeLost: 209 },
  { term: "Altitude", delta: -0.03, found: 616, foundWinPct: 62.34, edgeLost: 71 },
  { term: "Schedule density", delta: -0.08, found: 707, foundWinPct: 60.54, edgeLost: 41 },
  { term: "Overtime", delta: -0.07, found: 148, foundWinPct: 64.86, edgeLost: 20 },
  { term: "Freshness", delta: 0.02, found: 148, foundWinPct: 60.14, edgeLost: -10 },
] as const;


/** The 0.5 cutoff's cost, stated once and interpolated rather than described as "a fifth". */
const NEUTRAL_GAMES = REST_SPLIT_SAMPLE.neutral.toLocaleString();

/**
 * Both rest rows against their own baselines, plus the games with no gap.
 *
 * Every scored game sits in exactly one of the first three rows — which is the point. A table
 * that accounts for the whole population is harder to accuse of cherry-picking than a sentence
 * saying it does not cherry-pick.
 */
function RestRowTable() {
  const rows = [
    {
      label: "Rested team at home",
      note: "published",
      games: RESTED_AT_HOME.games,
      winPct: RESTED_AT_HOME.winPct,
      baseline: REST_SPLIT_BASELINE.homeWinPct,
    },
    {
      label: "Rested team on the road",
      note: "counted separately",
      games: RESTED_ON_ROAD.games,
      winPct: RESTED_ON_ROAD.winPct,
      baseline: REST_SPLIT_BASELINE.roadWinPct,
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.label}
      columns={[
        {
          label: "RESTED TEAM",
          unit: "WHERE IT PLAYED",
          cell: (r) => (
            <>
              {r.label} <span style={{ color: "var(--term-text-muted)" }}>· {r.note}</span>
            </>
          ),
        },
        {
          label: "GAMES",
          unit: "COUNT",
          numeric: true,
          cell: (r) => r.games.toLocaleString(),
        },
        {
          label: "IT WON",
          unit: "WIN RATE",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (r) => `${r.winPct}%`,
        },
        {
          label: "BASELINE",
          unit: "SAME SIDE, ALL GAMES",
          numeric: true,
          style: { color: "var(--term-text-muted)" },
          cell: (r) => `${r.baseline}%`,
        },
        {
          label: "VS BASELINE",
          unit: "PCT POINTS",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (r) => signedNumber(liftOverBaseline(r.winPct, r.baseline)),
        },
      ]}
    >
      {/* Two rows outside the split: the games with no gap to measure, and the population
          every rate above is read against. Neither is a rested-team row, so neither belongs
          in `rows`. */}
      <tr>
            <td style={termTdStyle}>
              No measurable gap{" "}
              <span style={{ color: "var(--term-text-muted)" }}>· |RA| &lt; 0.5</span>
            </td>
            <td style={{ ...termTdStyle, textAlign: "right" }}>{NEUTRAL_GAMES}</td>
            <td style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}>
              —
            </td>
            <td style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}>
              —
            </td>
            <td style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}>
              —
            </td>
          </tr>
          <tr>
            <td style={{ ...termTdStyle, borderTop: "1px solid var(--term-border)" }}>
              Every completed game since {REST_SPLIT_SAMPLE.firstSeason}
            </td>
            <td
              style={{
                ...termTdStyle,
                borderTop: "1px solid var(--term-border)",
                textAlign: "right",
                fontWeight: 700,
              }}
            >
              {REST_SPLIT_BASELINE.games.toLocaleString()}
            </td>
            <td
              colSpan={3}
              style={{
                ...termTdStyle,
                borderTop: "1px solid var(--term-border)",
                textAlign: "right",
                color: "var(--term-text-muted)",
              }}
            >
              {REST_SPLIT_BASELINE.homeWinPct}% HOME · {REST_SPLIT_BASELINE.roadWinPct}% ROAD
            </td>
          </tr>
    </DataTable>
  );
}

/**
 * The road row by rest gap.
 *
 * This replaces a sentence claiming "no threshold rescues it", which the full ladder refutes:
 * the row reaches even at a gap of 6 and clears it at 7. Both of those rungs are tiny, and the
 * caption says so — the honest reading is the schedule running out of examples, not a signal
 * switching on. The old sentence was written from a ladder that stopped at 5.
 */
function RoadLadderTable() {
  // The unfiltered row is the ladder's own first rung — every rested road game, no gap floor —
  // so it is a row rather than a hand-written one above the loop.
  const rungs = [
    { label: "any", games: RESTED_ON_ROAD.games, winPct: RESTED_ON_ROAD.winPct },
    ...RESTED_ON_ROAD.ladder.map((r) => ({
      label: `≥ ${r.gap}`,
      games: r.games,
      winPct: r.winPct,
    })),
  ];

  // The thin rungs are muted rather than omitted: dropping them is how the claim they refute
  // survived, and printing them boldly would oversell 26 games.
  const thin = (r: (typeof rungs)[number]) =>
    r.games < THIN_SAMPLE_GAMES ? "var(--term-text-muted)" : undefined;

  return (
    <DataTable
      rows={rungs}
      rowKey={(r) => r.label}
      columns={[
        { label: "REST GAP", unit: "AT LEAST", cell: (r) => r.label },
        {
          label: "GAMES",
          unit: "COUNT",
          numeric: true,
          cell: (r) => <span style={{ color: thin(r) }}>{r.games.toLocaleString()}</span>,
        },
        {
          label: "RESTED ROAD TEAM WON",
          unit: "WIN RATE",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (r) => <span style={{ color: thin(r) }}>{r.winPct}%</span>,
        },
        {
          label: `VS ${REST_SPLIT_BASELINE.roadWinPct}% BASELINE`,
          unit: "PCT POINTS",
          numeric: true,
          cell: (r) => (
            <span style={{ color: thin(r) }}>
              {signedNumber(liftOverBaseline(r.winPct, REST_SPLIT_BASELINE.roadWinPct))}
            </span>
          ),
        },
      ]}
    />
  );
}

/**
 * The road row inside recent eras, each against its own road baseline.
 *
 * The raw rate and the baseline are printed side by side because separating them is exactly
 * the error the retired claims made. 49.3% over the last five seasons looks like rest suddenly
 * mattering; most of that movement is home court weakening league-wide, and the column that
 * survives it is the last one.
 */
function RoadEraTable() {
  return (
    <DataTable
      rows={RESTED_ON_ROAD_BY_ERA}
      rowKey={(era) => era.label}
      columns={[
        {
          label: "ERA",
          unit: "SEASONS",
          cell: (era) => (
            <>
              {era.label}{" "}
              <span style={{ color: "var(--term-text-muted)" }}>· {era.seasons}</span>
            </>
          ),
        },
        {
          label: "GAMES",
          unit: "COUNT",
          numeric: true,
          cell: (era) => era.games.toLocaleString(),
        },
        {
          label: "RESTED ROAD TEAM WON",
          unit: "WIN RATE",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (era) => `${era.winPct}%`,
        },
        {
          label: "ROAD BASELINE",
          unit: "THAT ERA",
          numeric: true,
          style: { color: "var(--term-text-muted)" },
          cell: (era) => `${era.roadBaselinePct}%`,
        },
        {
          label: "VS BASELINE",
          unit: "PCT POINTS",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (era) => signedNumber(era.liftPp),
        },
        {
          label: "BEST RUNG",
          unit: "GAP · WIN RATE",
          numeric: true,
          style: { color: "var(--term-text-muted)" },
          cell: (era) => {
            // The strongest rung whose sample is worth printing. Picking the highest win rate
            // regardless of n would put a 36-game bucket in the most prominent column here.
            const solid = era.ladder.filter((r) => r.games >= THIN_SAMPLE_GAMES);
            const best = solid.reduce<RestGapRung | null>(
              (top, r) => (top === null || r.winPct > top.winPct ? r : top),
              null
            );
            return best ? `≥ ${best.gap} · ${best.winPct}%` : "—";
          },
        },
      ]}
    />
  );
}

export default function RestAdvantageMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · REST ADVANTAGE"
      title="Rest advantage"
      description="The fatigue score: inputs, constants, historical comparisons, and limitations."
    >
      <Section label="THE SCORE" descriptor="ONE FUNCTION, EIGHT TERMS">
        <Prose>
          Each team receives a fatigue score based on its schedule before tip-off. A higher
          score represents more estimated fatigue. The difference between the two teams&rsquo;
          scores is the <strong>rest advantage</strong>, used to group games in the backtest.
        </Prose>
        <Formula>
          {`baseLoad   = recentWorkload + travel + roadSegment
score      = max(0, baseLoad × backToBack × altitude × density + freshness + overtime)
restEdge   = awayScore − homeScore     (positive ⇒ the home side is fresher)`}
        </Formula>
        <Note>
          A difference under 0.5 is treated as neutral: {NEUTRAL_GAMES} games, about one
          in six, that carry no rest claim in either direction.
        </Note>
      </Section>

      <Section label="HOME COURT AND REST" descriptor="WHY THE TWO ARE COUNTED SEPARATELY">
        <Prose>
          Rest and home court are entangled, and the entanglement is structural. A visiting team
          has travelled by definition, so the fresher side is the home side in{" "}
          {RESTED_AT_HOME.games.toLocaleString()} of the{" "}
          {REST_SPLIT_SAMPLE.decided.toLocaleString()} games with a measurable gap. Two of the
          eight terms, body clock and visiting altitude, are tied to playing away from home, and
          the schedule pushes the same way on its own: the visiting side is playing a second
          night in a row roughly twice as often as the home side, and nothing in that term knows
          which team is at home.
        </Prose>
        <Prose>
          In about half the schedule the home team had travelled in too. In those games,
          the average rest edge falls by three quarters, while the home team still won 59.7% of
          those games, 60.0% of the ones where it had flown farther than its opponent, and 58.0%
          of the ones where it ended a road trip on a back-to-back. These groups all retain
          a substantial home win rate.
        </Prose>
        <Note>
          So a rest advantage cannot be read on its own. It has to be read against the venue it
          arrived with. Home teams win {REST_SPLIT_BASELINE.homeWinPct}% of all{" "}
          {REST_SPLIT_BASELINE.games.toLocaleString()} games and road teams{" "}
          {REST_SPLIT_BASELINE.roadWinPct}%. The corresponding rested groups sit{" "}
          {signedNumber(liftOverBaseline(RESTED_AT_HOME.winPct, REST_SPLIT_BASELINE.homeWinPct))}{" "}
          percentage points above baseline at home and{" "}
          {signedNumber(liftOverBaseline(RESTED_ON_ROAD.winPct, REST_SPLIT_BASELINE.roadWinPct))}{" "}
          on the road. These associations are small on both sides, and neither comes
          near the twenty points between the two baselines.
        </Note>

        <RestRowTable />

        <Prose>
          Model Results shows historical win rates, not the chance of winning a particular
          game. A rest advantage of 7+ means all games with a score gap of at least
          seven, not seven days of rest. Home teams are grouped by this minimum gap; road
          teams are pooled across all rest gaps. These rates use the current backtest;
          its group counts and threshold results are available in{" "}
          <Link href="/analysis" className="underline underline-offset-4">Model Results</Link>.
          The tables on this reference page retain their dated analysis samples.
        </Prose>

        <Note>
          The headline counts the rested home team. Rested visitors are reported separately:
          their pooled win rate is {RESTED_ON_ROAD.winPct}%, below 50% despite exceeding the
          road baseline. The headline therefore includes home-court advantage as well as rest.
        </Note>
        <RoadLadderTable />
        <Note>
          The last two rungs are {RESTED_ON_ROAD.ladder[4].games} and{" "}
          {RESTED_ON_ROAD.ladder[5].games} games in {REST_SPLIT_SAMPLE.seasons} seasons. Read
          those rates with caution because very large gaps have few examples.
        </Note>

        <Prose>
          The pooled ladder spans changes in home-court advantage. The era table compares
          rested visitors with the road baseline from the same period.
        </Prose>

        <RoadEraTable />

        <Note>
          The rested road team has climbed from {RESTED_ON_ROAD_BY_ERA[0].winPct}% to{" "}
          {RESTED_ON_ROAD_BY_ERA[2].winPct}%, which looks like rest coming to matter more. Most
          of it is not: the road baseline rose from {RESTED_ON_ROAD_BY_ERA[0].roadBaselinePct}%
          to {RESTED_ON_ROAD_BY_ERA[2].roadBaselinePct}% over the same span, because home-court
          advantage has weakened league-wide. What is left after subtracting that is the last
          column, and it has moved much less:{" "}
          {signedNumber(RESTED_ON_ROAD_BY_ERA[0].liftPp)} to{" "}
          {signedNumber(RESTED_ON_ROAD_BY_ERA[2].liftPp)} points.
        </Note>
        <Note>
          In the last ten seasons, rested visitors with a gap of 4 or more won{" "}
          {RESTED_ON_ROAD_BY_ERA[1].ladder[2].winPct}% across{" "}
          {RESTED_ON_ROAD_BY_ERA[1].ladder[2].games} games. That subgroup exceeds 50%, so the
          pooled road rate cannot support a claim that rested visitors always lose more often.
          This retrospective threshold comparison has not established a new prediction rule.
        </Note>

        <Note>
          Folding home court into the score itself and letting the combined number pick was
          measured too: with a {HOME_BAR_COUNTERFACTUAL.homeBar}-point home bar it covers{" "}
          {HOME_BAR_COUNTERFACTUAL.coveragePct}% of games at{" "}
          {HOME_BAR_COUNTERFACTUAL.accuracyPct}%, which is below simply picking the home team in
          every one of the {REST_SPLIT_BASELINE.games.toLocaleString()}. It also makes{" "}
          {HOME_BAR_COUNTERFACTUAL.roadCalls.toLocaleString()} road picks and loses{" "}
          {HOME_BAR_COUNTERFACTUAL.roadLosses.toLocaleString()} of them. This tested rule did
          not outperform the all-home baseline.
        </Note>
      </Section>

      <Section label="THE TERMS" descriptor="WITH THE CONSTANTS THE CODE USES">
        <div className="flex flex-col gap-6">
          <div>
            <Prose>
              {/* Hyphenated so no space is needed after the expression: a JSX text node
                  that wraps to the next line loses its leading space, which rendered
                  "30days" here. */}
              <strong>Recent workload.</strong> Every game in the last{" "}
              {K.decayLookbackDays}-day window adds load that decays exponentially, so last
              night matters far more than last week. Each game&rsquo;s cost is scaled down when it was
              a blowout, using final margin as a proxy for reduced workload. The score does
              not observe whether individual starters actually rested.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`cost      = ${K.gameBaseCost} × e^(−${K.decayRate} × daysAgo) × blowoutFactor
blowout   = 1 − ${K.blowoutMaxDiscount} × clamp((|margin| − ${K.blowoutFloor}) / ${K.blowoutRange}, 0, 1)`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Travel.</strong> Great-circle miles between consecutive venues over a{" "}
              {K.travelLookbackDays}-day window, log-scaled so additional miles add progressively
              less to the score. The itinerary assumes a trip home only when the <em>next</em>{" "}
              game is at home.
            </Prose>
            <div className="mt-2">
              <Formula>{`travel = ${K.travelScale} × ln(1 + miles / ${K.travelReferenceMiles})`}</Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Body clock.</strong> A charge for playing at least a{" "}
              {K.displacementMinHours}-hour clock shift from home, resolved from each
              venue&rsquo;s UTC offset. The model assigns a larger multiplier eastward and
              reduces the charge with nights in the new zone. These are retained assumptions;
              the Time Zones analysis did not validate their predictive value.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`displacement = ${K.displacementBonus} × direction × max(0, 1 − nightsInZone / zonesCrossed)
direction    = ${K.eastwardMultiplier} eastward, ${K.westwardMultiplier} westward`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Back-to-back.</strong> Playing last night multiplies the load. The size of
              that multiplier depends on the real gap between tip-offs, because a 10:30pm game
              into a 7pm game is roughly 21 hours of recovery and the reverse ordering is 27.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`b2b = clamp(${K.b2bMultiplier} + ${K.b2bPerHour} × (${K.b2bNominalHours} − turnaroundHours), ${K.b2bMin}, ${K.b2bMax})`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>The rest.</strong> Consecutive road games add{" "}
              {K.roadStreakPerGame} each after the first {K.roadStreakFree} are free. Visiting
              altitude (Denver, Utah, and Mexico City at 7,350 ft) multiplies by{" "}
              {K.altitudeMultiplier}, and the following night at normal elevation by{" "}
              {K.altitudeCarryover}. Schedule density compares games played across five windows
              {/* No cap is quoted here on purpose. SCHEDULE_STRESS_MAX_MULT is 1.42, but each
                  of the five windows is clamped before the curve is applied, so the multiplier
                  cannot structurally exceed ~1.33 and tops out at 1.307 on real schedules.
                  Printing 1.42 told readers density could multiply fatigue by half again as
                  much as it can. Verified 2026-08-03. */}{" "}
              against a normal pace. Extended rest earns a discount that begins at{" "}
              {K.freshnessPlateauDays} days and approaches{" "}
              {/* A true minus sign, and one decimal, so these read as the quantities the
                  model uses rather than as bare integers. */}
              {signedNumber(K.freshnessMaxBonus, 1)}. A prior game that went to
              overtime adds {K.overtimeSingle.toFixed(1)}, or {K.overtimeMulti.toFixed(1)} for
              double overtime or more.
            </Prose>
          </div>
        </div>
      </Section>

      <Section
        label="WHAT EACH TERM IS WORTH"
        descriptor={`MEASURED ${ABLATIONS_MEASURED_ON}`}
      >
        <Prose>
          Removing a term does not change <em>which</em> team gets picked: a called game is
          always a pick of the home side. What it changes is which games get called at all. So
          each term was neutralised in turn, the call re-derived, and the published win rate
          re-measured against a baseline of{" "}
          <strong>
            {ABLATION_BASELINE.winPct}% across {ABLATION_BASELINE.called.toLocaleString()} games
          </strong>
          .
        </Prose>
        <Prose>
          Games selected by back-to-back and recent-workload terms but lost when each is
          removed have win rates above 63%. Removing travel drops{" "}
          {ABLATIONS[0].found.toLocaleString()}{" "}
          of the model&rsquo;s calls, more than twice any other term. Those games won at{" "}
          {ABLATIONS[0].foundWinPct}%.
        </Prose>
        <DataTable
          rows={ABLATIONS}
          rowKey={(a) => a.term}
          columns={[
            { label: "TERM", cell: (a) => a.term },
            {
              label: "GAMES ONLY IT FINDS",
              unit: "COUNT",
              numeric: true,
              style: { fontWeight: 700 },
              cell: (a) => (
                // Weight by what the term contributes, which is the column that decides
                // whether it earns its place.
                <span
                  style={{
                    color: a.edgeLost >= 200 ? "var(--term-text)" : "var(--term-text-muted)",
                  }}
                >
                  {a.found.toLocaleString()}
                </span>
              ),
            },
            {
              label: "THOSE GAMES",
              unit: "WIN RATE",
              numeric: true,
              cell: (a) => `${a.foundWinPct}%`,
            },
            {
              label: "HEADLINE IF REMOVED",
              unit: "PCT POINTS",
              numeric: true,
              style: { color: "var(--term-text-muted)" },
              cell: (a) => `${signedNumber(a.delta)}pp`,
            },
          ]}
        />
        <Note>
          Removing travel or road segment <em>raises</em>{" "}the published rate while reducing
          coverage. The games they add win less often than the model&rsquo;s overall{" "}
          {ABLATION_BASELINE.winPct}% rate. Removing travel reduces net correct calls above
          a coin flip by {ABLATIONS[0].edgeLost} and drops{" "}
          {ABLATIONS[0].found.toLocaleString()} called games. Those are all dropped calls,
          including losses, not a count of winning predictions.
        </Note>
        <Note>
          The whole model sits at {ABLATION_BASELINE.edge.toLocaleString()} correct calls above a
          coin flip across {ABLATION_BASELINE.called.toLocaleString()} games. Freshness is the
          only term whose removal improves this net count, by ten calls. The ratified terms
          remain in place under the evaluation protocol in ADR 0006.
          Terms interact multiplicatively, so these figures do not sum to the total.
        </Note>
        <Note>
          The counts in this section are stated against a coin flip rather than against the{" "}
          {REST_SPLIT_BASELINE.homeWinPct}% home baseline used everywhere else on the site. That
          measures accuracy and coverage together, but it gives credit for home-court
          advantage too. It does not measure the model&rsquo;s improvement over home court;
          the rested home group sits{" "}
          {signedNumber(liftOverBaseline(RESTED_AT_HOME.winPct, REST_SPLIT_BASELINE.homeWinPct))}{" "}
          points above that baseline, as shown on Model Results.
        </Note>
        <Note>
          A separate out-of-sample fit found travel adds little <em>independent</em> information
          once the other schedule terms are known. The ablation table answers a different
          question: which games cross the fixed call threshold when travel is included.
          Changing coverage is not evidence that travel improves an independently fitted model.
        </Note>
      </Section>

      <Section label="WHERE THE DATA COMES FROM" descriptor="1985-86 TO PRESENT">
        <Prose>
          Schedules, scores and results come from the NBA&rsquo;s own feeds. Overtime periods,
          tip-off times and neutral-site venues come from ESPN. The missing overtime input was
          restored on {MEASURED_ON}; earlier model runs had treated it as zero throughout.
        </Prose>
        <Prose>
          Arena coordinates are era-correct: Sonics games resolve to Seattle, not Oklahoma City,
          and the 2005-06 Hornets to their Katrina-season home. Distances are great-circle, not
          routed.
        </Prose>
        <Note>
          ESPN coverage begins around 2002, and its neutral-site flag only from 2013. Earlier
          seasons are scored by the same formula with those three inputs absent, which means a
          pre-2002 overtime count of zero denotes <em>unknown</em>, not &ldquo;no overtime&rdquo;.
          The trade was taken deliberately rather than restricting the model to a shorter span,
          and the cost is that a 1994 score and a 2024 score are not built from quite the same
          information.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="LIMITATIONS">
        <Prose>
          The model reads schedules. It knows nothing about the teams playing.
        </Prose>
        <LimitList
          items={[
            "No injuries, rotations or minutes played. A rested team missing two starters scores the same as a healthy one.",
            "No team quality. The historical groups can differ in strength as well as rest, so their win rates do not isolate a causal rest effect.",
            "No actual itineraries. Teams are assumed to fly venue to venue and only home when the next game is home. No public source records what they really did.",
            "No load management. A star sitting a back-to-back is exactly the effect this model would want to capture, and it is invisible here.",
            "Playoffs are excluded entirely. A fixed two-team series breaks the travel assumptions.",
            "The 2019-20 Orlando bubble is excluded because it had one site, no travel, and no crowd. Pre-suspension games remain included. The condensed 72-game 2020-21 season is included, with greater density than the model's normal-pace anchors.",
          ]}
        />
      </Section>

      <Section label="HOW THE MODEL IS SCORED" descriptor="NO TUNING AGAINST THE BACKTEST">
        <Prose>
          Every constant above was set by reasoning about the physical effect and reviewed
          before the backtest was run; none was fitted to maximise this win rate. Reusing
          evaluation results to choose constants can overstate performance. One constant has moved on
          measured evidence: the altitude multiplier was raised from 1.15 to 1.29 on 2026-08-02
          to match altitude&rsquo;s measured size against a back-to-back on final margin. That
          is a different target from the win rates on this page, and the change is recorded in
          ADR 0006. Using a different target does not make the shared historical games an
          independent test set.
        </Prose>
        <Note>
          In the overhaul recorded on {MEASURED_ON}, nine fixes landed together and the published
          hit rates rose about a point. On games
          both the old and new model called, accuracy moved 0.15pp and the two picked the same
          team 98.8% of the time. The gain was almost entirely the new model declining 2,661
          games the old one had called at below a coin flip. Most of the reported improvement
          came from selecting a different set of games.
        </Note>
      </Section>
    </BehindTheDataShell>
  );
}
