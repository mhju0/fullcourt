import type { Metadata } from "next";
import ablationFacts from "../../../../ml/fatigue_ablation_facts.json";
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
import { HOME_REST_CONFOUND } from "@/lib/home-rest-confound-facts";
import {
  HOME_BAR_COUNTERFACTUAL,
  liftOverBaseline,
  RESTED_AT_HOME,
  RESTED_ON_ROAD,
  RESTED_ON_ROAD_BY_ERA,
  REST_SPLIT_BASELINE,
  REST_SPLIT_SAMPLE,
  THIN_SAMPLE_GAMES,
  type RestGapRange,
} from "@/lib/rest-split-facts";
import { GAP_RANGES, NEUTRAL_REST_ADVANTAGE_THRESHOLD, gapRangeByKey, gapRangeSpan } from "@/lib/rest-advantage-evidence";
import { termTdStyle } from "@/lib/terminal-styles";
import { DataTable } from "@/components/ui/data-table";
import { signedNumber } from "@/lib/signed-number";

export const metadata: Metadata = {
  title: "Rest Advantage · Behind the Data",
  description:
    "The fatigue score: its eight terms, operational constants, historical venue comparisons, and single-term ablations of the fixed call threshold.",
};

/** Rebuilt offline with score-fidelity checks before the producer replaces this snapshot. */
const ABLATIONS_MEASURED_ON = ablationFacts.measuredOn;
const ABLATION_BASELINE = ablationFacts.baseline;
const ABLATIONS = ablationFacts.terms;


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
      minWidth={520}
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
              <span style={{ color: "var(--term-text-muted)" }}>· |RA| &lt; {NEUTRAL_REST_ADVANTAGE_THRESHOLD}</span>
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
              Eligible scored games since {REST_SPLIT_SAMPLE.firstSeason}
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

/** "Medium 3–5": a gap size as every table on the site names it. */
function gapSizeLabel(range: RestGapRange): string {
  const span = gapRangeByKey(range.key);
  return `${span.label} ${gapRangeSpan(span)}`;
}

/**
 * The road row by gap size, each game in one size (D-106).
 *
 * This replaces a sentence claiming "no threshold rescues it". Pooled over every season, no
 * size reaches even; inside the last five seasons the medium size does (`RoadEraTable`), so
 * the absolute claim stays retired.
 */
function RoadGapSizeTable() {
  // The unfiltered row is every rested road game, so the sizes below it add up to it.
  const rows = [
    { label: `All gaps (${GAP_RANGES[0].min}+)`, games: RESTED_ON_ROAD.games, winPct: RESTED_ON_ROAD.winPct },
    ...RESTED_ON_ROAD.ranges.map((r) => ({
      label: gapSizeLabel(r),
      games: r.games,
      winPct: r.winPct,
    })),
  ];

  // Thin sizes are muted rather than omitted: dropping them hides the evidence, and printing
  // them boldly would oversell a few hundred games.
  const thin = (r: (typeof rows)[number]) =>
    r.games < THIN_SAMPLE_GAMES ? "var(--term-text-muted)" : undefined;

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.label}
      minWidth={520}
      columns={[
        { label: "REST GAP", unit: "SIZE", cell: (r) => r.label },
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
          // Room for "RESTED ROAD" on one line plus the cell padding, so the heading holds to two.
          headStyle: { minWidth: 112 },
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
 * The best-performing gap size worth quoting: the highest road win rate among the sizes with
 * at least `THIN_SAMPLE_GAMES` games. Picking the highest rate regardless of n would put a
 * 36-game size in the most prominent column.
 */
function bestSolidRange(ranges: readonly RestGapRange[]): RestGapRange | null {
  return ranges
    .filter((r) => r.games >= THIN_SAMPLE_GAMES)
    .reduce<RestGapRange | null>((top, r) => (top === null || r.winPct > top.winPct ? r : top), null);
}

/** The era and gap size where rested visitors won more than half, on a sample worth quoting. */
const ROAD_ABOVE_EVEN = RESTED_ON_ROAD_BY_ERA.flatMap((era) =>
  era.ranges
    .filter((r) => r.games >= THIN_SAMPLE_GAMES && r.winPct > 50)
    .map((range) => ({ era, range }))
).at(-1);

const LARGE_ROAD = RESTED_ON_ROAD.ranges.find((r) => r.key === "large")!;

/**
 * The road row inside recent eras, each against its own road baseline.
 *
 * The raw rate and the baseline are printed side by side because separating them is exactly
 * the error the retired claims made. A recent road rate near even can look like rest suddenly
 * mattering; most of that movement is home court weakening league-wide, and the column that
 * survives it is the last one.
 */
function RoadEraTable() {
  return (
    <DataTable
      rows={RESTED_ON_ROAD_BY_ERA}
      rowKey={(era) => era.label}
      minWidth={520}
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
          // Room for "RESTED ROAD" on one line plus the cell padding, so the heading holds to two.
          headStyle: { minWidth: 112 },
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
          label: "BEST GAP SIZE",
          unit: "SIZE · WIN RATE",
          numeric: true,
          style: { color: "var(--term-text-muted)", whiteSpace: "nowrap" },
          cell: (era) => {
            const best = bestSolidRange(era.ranges);
            return best ? `${gapSizeLabel(best)} · ${best.winPct}%` : "—";
          },
        },
      ]}
    />
  );
}

export default function RestAdvantageMethodPage() {
  return (
    <BehindTheDataShell
      topic="rest-advantage"
      eyebrow="BEHIND THE DATA · REST ADVANTAGE"
      title="Rest advantage"
      description="The fatigue score: inputs, constants, historical comparisons, and limitations."
    >
      <Section label="THE SCORE" title="How the score works">
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
          An absolute difference under {NEUTRAL_REST_ADVANTAGE_THRESHOLD} is treated as neutral:
          {" "}{NEUTRAL_GAMES} games ({(REST_SPLIT_SAMPLE.neutral / REST_SPLIT_SAMPLE.scoredGames * 100).toFixed(1)}%
          of this sample) that carry no rest claim in either direction.
        </Note>
      </Section>

      <Section label="HOME COURT AND REST" title="Home court and rest: comparisons and baselines" disclosure>
        <Prose>
          Rest and home court overlap in this schedule-based model. Visiting status does not
          establish an actual journey, but the fresher side is the home side in{" "}
          {RESTED_AT_HOME.games.toLocaleString()} of the{" "}
          {REST_SPLIT_SAMPLE.decided.toLocaleString()} games with a measurable gap. Two of the
          eight terms, road segment (which carries the body-clock charge) and visiting altitude,
          are tied to playing away from home. Other terms, such as back-to-back load, use the
          schedule rather than awarding home status a direct bonus.
        </Prose>
        <Prose>
          In {(HOME_REST_CONFOUND.bothTravelledIn.games / HOME_REST_CONFOUND.population * 100).toFixed(1)}%
          of this sample, both sides had a modeled inbound distance of at least one mile. In those games,
          the average rest edge falls by{" "}
          {Math.round(
            (1 -
              HOME_REST_CONFOUND.meanRestEdge.bothTravelledIn /
                HOME_REST_CONFOUND.meanRestEdge.allGames) *
              100
          )}
          %, while the home team still won{" "}
          {HOME_REST_CONFOUND.bothTravelledIn.homeWinPct.toFixed(1)}% of those games,{" "}
          {HOME_REST_CONFOUND.homeFlewFarther.homeWinPct.toFixed(1)}% of the ones where its modeled
          inbound distance exceeded its opponent’s, and{" "}
          {HOME_REST_CONFOUND.homeTravelledInOnBackToBack.homeWinPct.toFixed(1)}% of the ones
          where it had a modeled inbound distance of at least one mile on a back-to-back. These groups all retain
          a substantial home win rate.
        </Prose>
        <Note>
          So a rest advantage cannot be read on its own. It has to be read against the venue it
          arrived with. Home teams win {REST_SPLIT_BASELINE.homeWinPct}% of the eligible{" "}
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
          game. A large rest advantage ({gapRangeSpan(gapRangeByKey("large"))}) means a fatigue-score gap of at
          least {gapRangeByKey("large").min}, not {gapRangeByKey("large").min} days of rest. Games are grouped into
          three gap sizes, small, medium and large, and each game counts in one. These rates use
          the current backtest; its counts by gap size are available in{" "}
          <Link href="/analysis" className="underline underline-offset-4">Model Results</Link>.
          The tables on this reference page are committed analysis snapshots covering
          {" "}{REST_SPLIT_SAMPLE.firstSeason} through {REST_SPLIT_SAMPLE.lastSeason},
          refreshed with the October 20, 2026 input corrections. They include completed
          regular-season games with both fatigue scores and an identified home court, excluding
          the Orlando bubble. They do not update with each new game.
        </Prose>

        <Note>
          The headline counts the rested team at home. Rested visitors are reported separately:
          their pooled win rate is {RESTED_ON_ROAD.winPct}%, below 50% despite exceeding the
          road baseline. The headline therefore includes home-court advantage as well as rest.
        </Note>
        <RoadGapSizeTable />
        <Note>
          A large road edge is rare: {LARGE_ROAD.games.toLocaleString()} games in{" "}
          {REST_SPLIT_SAMPLE.seasons} seasons. Read that rate with caution.
        </Note>

        <Prose>
          The pooled rates span changes in home-court advantage. The era table compares
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
        {ROAD_ABOVE_EVEN ? (
          <Note>
            In the {ROAD_ABOVE_EVEN.era.label.toLowerCase()}, rested visitors with a{" "}
            {gapRangeByKey(ROAD_ABOVE_EVEN.range.key).label.toLowerCase()} gap (
            {gapRangeSpan(gapRangeByKey(ROAD_ABOVE_EVEN.range.key))}) won{" "}
            {ROAD_ABOVE_EVEN.range.winPct}% across {ROAD_ABOVE_EVEN.range.games} games. That
            group exceeds 50%, so the pooled road rate cannot support a claim that rested
            visitors always lose more often. This retrospective comparison has not established a
            new prediction rule.
          </Note>
        ) : null}

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

      <Section label="THE TERMS" title="Full formula and constants" disclosure>
        <DataTable rows={[
          { term: "Recent workload", meaning: "Previous games, weighted by recency and final margin." },
          { term: "Travel", meaning: "Great-circle distance between venues." },
          { term: "Road segment", meaning: "Consecutive road games beyond the initial allowance, plus body-clock displacement on the road." },
          { term: "Back-to-back", meaning: "A load multiplier based on time between tip-offs." },
          { term: "Altitude", meaning: "A visitor playing at altitude tonight." },
          { term: "Schedule density", meaning: "Games across five windows compared with a normal pace." },
          { term: "Freshness", meaning: "A discount for extended rest." },
          { term: "Overtime", meaning: "Additional load from overtime in the previous game." },
        ]} rowKey={(row) => row.term} columns={[
          { label: "Term", cell: (row) => row.term },
          { label: "What it measures", cell: (row) => row.meaning },
        ]} />
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
              less to the score. Legs join consecutive recorded venues without intermediate home
              stops. When no prior game is available in the model’s history, the dated team
              base is the assumed origin. These miles estimate distance; they do not record flights.
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
              reduces the charge by the count of consecutive prior games in the current zone. That
              count is a proxy for acclimation, not observed nights or sleep. These are retained assumptions;
              the Time Zones analysis did not validate their predictive value.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`displacement = ${K.displacementBonus} × direction × max(0, 1 − priorGamesInZone / zonesCrossed)
direction    = ${K.eastwardMultiplier} eastward, ${K.westwardMultiplier} westward`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Back-to-back.</strong> Playing last night multiplies the load. The size of
              that multiplier depends on the interval between recorded tip-offs. That interval
              includes the previous game itself and does not measure recovery time. When
              either tip is missing, the multiplier falls back to {K.b2bMultiplier}.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`b2b = clamp(${K.b2bMultiplier} + ${K.b2bPerHour} × (${K.b2bNominalHours} − turnaroundHours), ${K.b2bMin}, ${K.b2bMax})`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Road segments, altitude, density, extended rest and overtime.</strong> Consecutive road games add{" "}
              {K.roadStreakPerGame} each after the first {K.roadStreakFree} are free. Visiting
              altitude at a flagged venue (including Denver, Utah and Mexico City) multiplies by{" "}
              {K.altitudeMultiplier}. Schedule density compares games played across five windows
              {/* No cap is quoted here on purpose. SCHEDULE_STRESS_MAX_MULT is 1.42, but each
                  of the five windows is clamped before the curve is applied, so the multiplier
                  cannot structurally exceed ~1.33 and tops out at 1.307 on real schedules.
                  Printing 1.42 told readers density could multiply fatigue by half again as
                  much as it can. Verified 2026-08-03. */}{" "}
              against a normal pace. Extended rest earns a discount that starts accruing after{" "}
              {K.freshnessPlateauDays} days since the last game (first credited at{" "}
              {K.freshnessPlateauDays} full days off) and approaches{" "}
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
        title="What changes when each term is removed"
        descriptor={`Measured ${ABLATIONS_MEASURED_ON}`}
        disclosure
      >
        <Prose>
          The model always selects the home side when it identifies a game where the rested team is at home.
          Removing a term changes which games meet that threshold. Each term was neutralized
          in turn and the win rate recalculated against a baseline of{" "}
          <strong>
            {ABLATION_BASELINE.winPct}% across {ABLATION_BASELINE.called.toLocaleString()} games
          </strong>
          .
        </Prose>
        <Prose>
          Games selected by the back-to-back term but lost when it is removed won at{" "}
          {ABLATIONS.find((a) => a.term === "Back-to-back")!.foundWinPct.toFixed(2)}%.
          For recent workload, that rate is{" "}
          {ABLATIONS.find((a) => a.term === "Recent workload (decay)")!.foundWinPct.toFixed(2)}%.
          Removing travel drops{" "}
          {ABLATIONS[0].found.toLocaleString()}{" "}
          of the model&rsquo;s calls, far more than any other term (the next is{" "}
          {Math.max(...ABLATIONS.slice(1).map((a) => a.found)).toLocaleString()}). Those games won at{" "}
          {ABLATIONS[0].foundWinPct.toFixed(1)}%.
        </Prose>
        <DataTable
          rows={ABLATIONS}
          rowKey={(a) => a.term}
          minWidth={520}
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
              cell: (a) => `${a.foundWinPct.toFixed(1)}%`,
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
          only term whose removal improves this net count, by{" "}
          {-ABLATIONS[ABLATIONS.length - 1].edgeLost} calls. The ratified terms
          remain in place under the evaluation protocol in ADR 0006.
          Terms interact multiplicatively, so these figures do not sum to the total.
        </Note>
        <Note>
          The counts in this section are stated against a coin flip rather than against the{" "}
          {REST_SPLIT_BASELINE.homeWinPct}% home baseline used everywhere else on the site. That
          measures accuracy and coverage together, but it gives credit for home-court
          advantage too. It does not measure the model&rsquo;s improvement over home court;
          the rested team at home sits{" "}
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

      <Section label="WHERE THE DATA COMES FROM" title="Data sources and revisions" disclosure>
        <Prose>
          Schedules, scores and results for completed seasons come from the NBA&rsquo;s own
          feeds; the current season&rsquo;s schedule and nightly scores come from ESPN. Archived
          period scores and team minutes backfill confirmed historical overtime. Reviewed team
          records and contemporary reports resolve specific archive conflicts. NBA and venue
          records supply accepted arena corrections; unverified tips and results are not guessed.
        </Prose>
        <Prose>
          Actual arenas, modeled team bases and home-court status are separate. Known temporary
          venues use dated records, including the Raptors&rsquo; Tampa season and the Hornets&rsquo;
          different Katrina-era hosts. An alternate home such as Austin stays a designated home
          game while its actual travel endpoints are used. Played Cup finals and play-in games
          remain workload context without becoming regular-season outcome targets. Distances
          remain great-circle estimates.
        </Prose>
        <Note>
          Historical inputs come from different sources. Archived corrections restore verified
          overtime and venues; older tip times remain incomplete and use the existing fallback.
          A 1994 score and a 2024 score therefore are
          not built from identical information.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <Prose>
          The model reads schedules. It knows nothing about the teams playing.
        </Prose>
        <LimitList
          items={[
            "No injuries, rotations or minutes played. A rested team missing two starters scores the same as a healthy one.",
            "No team quality. The historical groups can differ in strength as well as rest, so their win rates do not isolate a causal rest effect.",
            "No actual itineraries. Mileage follows scheduled arena stops; flights, ground travel and intermediate returns home are not reconstructed.",
            "No load management. A star sitting a back-to-back is exactly the effect this model would want to capture, and it is invisible here.",
            "Playoff games are excluded from regular-season win-rate findings. Played games still belong in the workload history.",
            "The 2019-20 Orlando bubble is excluded from these findings. Its campus geography is represented, but the normal-travel model is not validated for bubble life. Pre-suspension games and the condensed 2020-21 season remain included.",
          ]}
        />
      </Section>

      <Section label="HOW THE MODEL IS SCORED" title="Evaluation protocol and model history" disclosure>
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
        <Prose>
          Refreshed research fits keep their original completed regular-season cohort,
          including neutral and bubble games. Published win-rate findings apply their own
          venue and abnormal-stretch exclusions, so the two sets of results have different
          denominators.
        </Prose>
        <Note>
          The October 20, 2026 refresh corrected historical inputs and regenerated these
          measurements. It did not adopt the research fit’s coefficients. ADR 0006 retains
          earlier dated results; they describe earlier inputs and are not current measurements.
        </Note>
      </Section>
    </BehindTheDataShell>
  );
}
