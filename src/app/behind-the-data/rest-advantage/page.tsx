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
  Subhead,
  Term,
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
import { TYPE, termTdStyle } from "@/lib/terminal-styles";
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


/**
 * The highest density multiplier the model can produce. Each window's stress is capped before
 * the curve is applied, so the stated max multiplier (1.42) is never reached; printing it told
 * readers density could multiply fatigue by far more than it can.
 */
const DENSITY_CEILING = Math.min(
  K.densityMaxMultiplier,
  1 + K.densityCurve * K.densityWindows.length * K.densityWindowCap
);

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
      label: "At home",
      games: RESTED_AT_HOME.games,
      winPct: RESTED_AT_HOME.winPct,
      baseline: REST_SPLIT_BASELINE.homeWinPct,
    },
    {
      label: "On the road",
      games: RESTED_ON_ROAD.games,
      winPct: RESTED_ON_ROAD.winPct,
      baseline: REST_SPLIT_BASELINE.roadWinPct,
    },
  ];
  const muted = { ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" } as const;
  const total = { ...termTdStyle, borderTop: "1px solid var(--term-border)" } as const;

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.label}
      columns={[
        {
          label: "RESTED",
          unit: "GAMES",
          cell: (r) => <LabelWithGames label={r.label} games={r.games} />,
        },
        {
          label: "WON",
          unit: "WIN RATE",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (r) => `${r.winPct.toFixed(1)}%`,
        },
        {
          label: "BASE",
          unit: "same side %",
          numeric: true,
          style: { color: "var(--term-text-muted)" },
          cell: (r) => `${r.baseline.toFixed(1)}%`,
        },
        {
          label: "GAP",
          unit: "pp",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (r) => signedNumber(liftOverBaseline(r.winPct, r.baseline), 1),
        },
      ]}
    >
      {/* Two rows outside the split: the games with no gap to measure, and the population
          every rate above is read against. Neither is a rested-team row, so neither belongs
          in `rows`. */}
      <tr>
        <td style={termTdStyle}>
          <LabelWithGames label="No gap" games={NEUTRAL_GAMES} />
        </td>
        <td style={muted}>—</td>
        <td style={muted}>—</td>
        <td style={muted}>—</td>
      </tr>
      <tr>
        <td style={total}>
          <LabelWithGames label={`All games since ${REST_SPLIT_SAMPLE.firstSeason}`} games={REST_SPLIT_BASELINE.games} />
        </td>
        <td style={total} />
        <td colSpan={2} style={{ ...total, textAlign: "right", color: "var(--term-text-muted)" }}>
          {REST_SPLIT_BASELINE.homeWinPct}% home
          <br />
          {REST_SPLIT_BASELINE.roadWinPct}% road
        </td>
      </tr>
    </DataTable>
  );
}

/** A row label with its game count beneath it, so a phone keeps the rate columns on screen. */
function LabelWithGames({ label, games }: { label: React.ReactNode; games: number | string }) {
  return (
    <>
      {label}
      <br />
      <span className="mono" style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {games.toLocaleString()} games
      </span>
    </>
  );
}

/** "Medium 3–5": a gap size as every table on the site names it. */
function gapSizeLabel(range: RestGapRange): React.ReactNode {
  const span = gapRangeByKey(range.key);
  return <>{span.label} <span style={{ whiteSpace: "nowrap" }}>{gapRangeSpan(span)}</span></>;
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
    { key: "all", label: <>All gaps <span style={{ whiteSpace: "nowrap" }}>({GAP_RANGES[0].min}+)</span></>, games: RESTED_ON_ROAD.games, winPct: RESTED_ON_ROAD.winPct },
    ...RESTED_ON_ROAD.ranges.map((r) => ({
      key: r.key as string,
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
      rowKey={(r) => r.key}
      columns={[
        { label: "REST GAP", unit: "SIZE", cell: (r) => <LabelWithGames label={r.label} games={r.games} /> },
        {
          label: "WON",
          unit: "WIN RATE",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (r) => <span style={{ color: thin(r) }}>{r.winPct.toFixed(1)}%</span>,
        },
        {
          label: `VS ${REST_SPLIT_BASELINE.roadWinPct}%`,
          unit: "PCT POINTS",
          numeric: true,
          cell: (r) => (
            <span style={{ color: thin(r) }}>
              {signedNumber(liftOverBaseline(r.winPct, REST_SPLIT_BASELINE.roadWinPct), 1)}
            </span>
          ),
        },
      ]}
    />
  );
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
      columns={[
        {
          label: "ERA",
          unit: "GAMES",
          cell: (era) => <LabelWithGames label={era.label} games={era.games} />,
        },
        {
          label: "WON",
          unit: "WIN RATE",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (era) => `${era.winPct.toFixed(1)}%`,
        },
        {
          label: "BASE",
          unit: "era %",
          numeric: true,
          style: { color: "var(--term-text-muted)" },
          cell: (era) => `${era.roadBaselinePct.toFixed(1)}%`,
        },
        {
          label: "GAP",
          unit: "pp",
          numeric: true,
          style: { fontWeight: 700 },
          cell: (era) => signedNumber(era.liftPp, 1),
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
      description="How the fatigue score is built, term by term, and how its results compare with home court."
    >
      <Section label="THE SCORE" title="How the score works">
        <Prose>
          Each team gets a fatigue score from its schedule before tip-off. A higher score means
          a more tired team. The <strong>rest advantage</strong> is the gap between the two
          teams&rsquo; scores.
        </Prose>
        {/* Every line stays inside 38 characters so the whole equation is visible on a phone
            without scrolling the block sideways. */}
        <Formula>
          {`load  = workload + travel + road

score = load × backToBack
             × altitude × density
        + freshness + overtime

edge  = awayScore − homeScore`}
        </Formula>
        <Prose>
          The three loads are added together. Back-to-back, altitude and density multiply that
          total. Freshness and overtime are added last, and a score never goes below 0. A
          positive edge means the home team is fresher.
        </Prose>
        <Note>
          A gap under {NEUTRAL_REST_ADVANTAGE_THRESHOLD} counts as no edge. That covers{" "}
          {NEUTRAL_GAMES} games ({(REST_SPLIT_SAMPLE.neutral / REST_SPLIT_SAMPLE.scoredGames * 100).toFixed(1)}%
          of this sample), which make no rest claim either way.
        </Note>
      </Section>

      <Section label="THE TERMS" title="Each term and its formula" disclosure>
        <Subhead>Loads: added together</Subhead>
        <Term
          name="Workload"
          formula={`workload = sum of cost, games in
           the last ${K.decayLookbackDays} days
cost     = ${K.gameBaseCost} × e^(−${K.decayRate} × d)
           × blowout
d        = days since that game
blowout  = 1 up to a ${K.blowoutFloor}-point margin,
           down to ${1 - K.blowoutMaxDiscount} at ${K.blowoutFloor + K.blowoutRange}+ points`}
        >
          Each game in the last {K.decayLookbackDays} days adds load that fades quickly, so
          last night counts far more than last week. A blowout costs less, because starters
          usually sit late. The model uses the final margin for this; it does not see who
          actually played.
        </Term>
        <Term
          name="Travel"
          formula={`travel = ${K.travelScale} × ln(1 + miles / ${K.travelReferenceMiles})
miles  = arena to arena, last ${K.travelLookbackDays} days`}
        >
          Straight-line miles between the arenas a team played in over the last{" "}
          {K.travelLookbackDays} days. Each extra mile adds a little less than the one before.
          Trips home between road games are not counted, and these are distances, not
          recorded flights.
        </Term>
        <Term
          name="Road"
          formula={`road = ${K.roadStreakPerGame} × max(0, roadGames − ${K.roadStreakFree})
       + bodyClock`}
        >
          Each straight road game past the first {K.roadStreakFree} adds {K.roadStreakPerGame}.
          Tonight counts if it is a road game. The body-clock charge below is part of this term.
        </Term>
        <Term
          name="Body clock"
          formula={`bodyClock = ${K.displacementBonus} × direction × fade
direction = ${K.eastwardMultiplier} east, ${K.westwardMultiplier} west
fade      = 1 − gamesInZone ÷ zones
            (never below 0)`}
        >
          A charge for a road game at least {K.displacementMinHours} hours from home on the
          clock. Going east costs more than going west. The charge fades with each game the
          team has already played in tonight&rsquo;s time zone, a stand-in for getting used to
          it. These are assumptions: the Time Zones study did not find that they improve
          predictions.
        </Term>

        <Subhead>Multipliers: scale the load</Subhead>
        <Term
          name="Back-to-back"
          formula={`backToBack = ${K.b2bMultiplier}
             + ${K.b2bPerHour} × (${K.b2bNominalHours} − hours)
             range ${K.b2bMin.toFixed(2)} to ${K.b2bMax.toFixed(2)}
hours      = tip-off to tip-off
otherwise  = 1`}
        >
          Applies when the team played last night. A shorter turnaround raises it. The hours
          run from one tip-off to the next, so they include the first game itself. Without
          both tip times it is {K.b2bMultiplier}.
        </Term>
        <Term
          name="Altitude"
          formula={`altitude = ${K.altitudeMultiplier} at high altitude
           1 everywhere else`}
        >
          Applies to a visitor in Denver or Utah, and to both teams at a neutral site at
          altitude, such as Mexico City. Only tonight&rsquo;s arena counts.
        </Term>
        <Term
          name="Density"
          formula={`density = 1 + ${K.densityCurve} × stress
stress  = sum of each window's excess
excess  = (games − normal)
          ÷ (tough − normal)
          kept between 0 and ${K.densityWindowCap}`}
        >
          Counts games in {K.densityWindows.length} recent windows and compares each count
          with a normal pace and a tough one. Only windows busier than normal add stress. It
          never exceeds ×{DENSITY_CEILING.toFixed(2)}.
        </Term>
        <DataTable
          wrapperClassName="reference-definitions"
          rows={K.densityWindows}
          rowKey={(w) => String(w.days)}
          columns={[
            { label: "WINDOW", unit: "DAYS BEFORE", cell: (w) => `${w.days} days` },
            { label: "NORMAL", unit: "GAMES", numeric: true, cell: (w) => w.baseline },
            { label: "TOUGH", unit: "GAMES", numeric: true, cell: (w) => w.tough },
          ]}
        />

        <Subhead>Adjustments: added last</Subhead>
        <Term
          name="Freshness"
          formula={`d         = days since last game
freshness = 0 while d ≤ ${K.freshnessPlateauDays}, then
            ${signedNumber(K.freshnessMaxBonus, 1)} × (1 − e^(−(d−${K.freshnessPlateauDays})/${K.freshnessPlateauDays}))`}
        >
          {/* A true minus sign, and one decimal, so these read as the quantities the model
              uses rather than as bare integers. */}
          A credit for a long rest. Nothing for the first {K.freshnessPlateauDays} days after a
          game; after that it grows toward {signedNumber(K.freshnessMaxBonus, 1)}.
        </Term>
        <Term
          name="Overtime"
          formula={`overtime = +${K.overtimeSingle.toFixed(1)} after one overtime
           +${K.overtimeMulti.toFixed(1)} after two or more`}
        >
          Extra load when the team&rsquo;s previous game went to overtime.
        </Term>
      </Section>

      <Section label="HOME COURT AND REST" title="Rest and home court" disclosure>
        <Prose>
          Rest and home court are tangled together. In{" "}
          {RESTED_AT_HOME.games.toLocaleString()} of the{" "}
          {REST_SPLIT_SAMPLE.decided.toLocaleString()} games with a measurable gap, the fresher
          team was the home team. Two terms only apply away from home: road (with its body-clock
          charge) and altitude. The rest follow the schedule and give no bonus for playing at
          home.
        </Prose>
        <Prose>
          Home court holds up even when the home team also traveled. In{" "}
          {(HOME_REST_CONFOUND.bothTravelledIn.games / HOME_REST_CONFOUND.population * 100).toFixed(1)}%
          of games, both teams arrived from somewhere else (a modeled trip of at least one mile).
          The average rest edge in those games is{" "}
          {Math.round(
            (1 -
              HOME_REST_CONFOUND.meanRestEdge.bothTravelledIn /
                HOME_REST_CONFOUND.meanRestEdge.allGames) *
              100
          )}
          % smaller, and the home team still won{" "}
          {HOME_REST_CONFOUND.bothTravelledIn.homeWinPct.toFixed(1)}%. It won{" "}
          {HOME_REST_CONFOUND.homeFlewFarther.homeWinPct.toFixed(1)}% when it had traveled
          farther than its opponent, and{" "}
          {HOME_REST_CONFOUND.homeTravelledInOnBackToBack.homeWinPct.toFixed(1)}% when it
          traveled in on a back-to-back.
        </Prose>
        <Note>
          So each rest group is compared with its own venue&rsquo;s baseline. Home teams win{" "}
          {REST_SPLIT_BASELINE.homeWinPct}% of the {REST_SPLIT_BASELINE.games.toLocaleString()}{" "}
          eligible games and road teams {REST_SPLIT_BASELINE.roadWinPct}%. A rested home team
          beats its baseline by{" "}
          {signedNumber(liftOverBaseline(RESTED_AT_HOME.winPct, REST_SPLIT_BASELINE.homeWinPct))}{" "}
          points and a rested road team by{" "}
          {signedNumber(liftOverBaseline(RESTED_ON_ROAD.winPct, REST_SPLIT_BASELINE.roadWinPct))}.
          Both are small next to the{" "}
          {(REST_SPLIT_BASELINE.homeWinPct - REST_SPLIT_BASELINE.roadWinPct).toFixed(1)} points
          between the two baselines.
        </Note>

        <RestRowTable />

        <Prose>
          These are historical win rates, not the chance of winning a given game. A large rest
          advantage ({gapRangeSpan(gapRangeByKey("large"))}) is a fatigue-score gap of at
          least {gapRangeByKey("large").min}, not {gapRangeByKey("large").min} days of rest.
          Each game falls into one of three gap sizes: small, medium or large.{" "}
          <Link href="/analysis" className="underline underline-offset-4">Model Results</Link>{" "}
          has the live counts by gap size.
        </Prose>
        <Note>
          The tables on this page are fixed snapshots of {REST_SPLIT_SAMPLE.firstSeason} through{" "}
          {REST_SPLIT_SAMPLE.lastSeason}, refreshed with the October 20, 2026 input corrections.
          They cover completed regular-season games with both fatigue scores and a known home
          team, without the Orlando bubble, and do not change as new games are played.
        </Note>

        <Subhead>Rested visitors</Subhead>
        <Prose>
          The headline only counts a rested team at home, so it includes home court as well as
          rest. Rested visitors are counted separately. They won {RESTED_ON_ROAD.winPct}%:
          better than the road baseline, but still under 50%.
        </Prose>
        <RoadGapSizeTable />
        <Note>
          Large road edges are rare: {LARGE_ROAD.games.toLocaleString()} games in{" "}
          {REST_SPLIT_SAMPLE.seasons} seasons. Read that row with caution.
        </Note>

        <Prose>
          Home court has weakened over time, so the era table compares rested visitors with
          the road baseline of their own era.
        </Prose>
        <RoadEraTable />
        <Note>
          Rested visitors climbed from {RESTED_ON_ROAD_BY_ERA[0].winPct}% to{" "}
          {RESTED_ON_ROAD_BY_ERA[2].winPct}%. That looks like rest mattering more, but most of
          it is home court fading: the road baseline rose from{" "}
          {RESTED_ON_ROAD_BY_ERA[0].roadBaselinePct}% to{" "}
          {RESTED_ON_ROAD_BY_ERA[2].roadBaselinePct}% over the same span. The gap over baseline
          moved much less, from {signedNumber(RESTED_ON_ROAD_BY_ERA[0].liftPp)} to{" "}
          {signedNumber(RESTED_ON_ROAD_BY_ERA[2].liftPp)} points.
        </Note>
        {ROAD_ABOVE_EVEN ? (
          <Note>
            In the {ROAD_ABOVE_EVEN.era.label.toLowerCase()}, rested visitors with a{" "}
            {gapRangeByKey(ROAD_ABOVE_EVEN.range.key).label.toLowerCase()} gap (
            {gapRangeSpan(gapRangeByKey(ROAD_ABOVE_EVEN.range.key))}) won{" "}
            {ROAD_ABOVE_EVEN.range.winPct}% of {ROAD_ABOVE_EVEN.range.games} games. So it is not
            true that rested visitors always lose more often than they win. This is a look back,
            not a new prediction rule.
          </Note>
        ) : null}

        <Subhead>Adding home court to the score</Subhead>
        <Prose>
          We also tried adding a {HOME_BAR_COUNTERFACTUAL.homeBar}-point home bonus to the score
          and letting the combined number pick. It picked{" "}
          {HOME_BAR_COUNTERFACTUAL.coveragePct}% of games and was right{" "}
          {HOME_BAR_COUNTERFACTUAL.accuracyPct}% of the time, which is worse than picking the
          home team in all {REST_SPLIT_BASELINE.games.toLocaleString()}. It made{" "}
          {HOME_BAR_COUNTERFACTUAL.roadCalls.toLocaleString()} road picks and lost{" "}
          {HOME_BAR_COUNTERFACTUAL.roadLosses.toLocaleString()} of them.
        </Prose>
      </Section>

      <Section
        label="WHAT EACH TERM IS WORTH"
        title="What each term adds"
        descriptor={`Measured ${ABLATIONS_MEASURED_ON}`}
        disclosure
      >
        <Prose>
          The headline picks the rested home team whenever the gap is big enough. Taking a term
          out changes which games make the cut. Each term was removed in turn and the games
          recounted, starting from the full model:{" "}
          <strong>
            {ABLATION_BASELINE.winPct}% across {ABLATION_BASELINE.called.toLocaleString()} games
          </strong>
          .
        </Prose>
        <Prose>
          Games that only the back-to-back term picks won{" "}
          {ABLATIONS.find((a) => a.term === "Back-to-back")!.foundWinPct.toFixed(2)}%.
          For recent workload, that rate is{" "}
          {ABLATIONS.find((a) => a.term === "Recent workload (decay)")!.foundWinPct.toFixed(2)}%.
          Travel picks far more games on its own than any other term:{" "}
          {ABLATIONS[0].found.toLocaleString()}, against{" "}
          {Math.max(...ABLATIONS.slice(1).map((a) => a.found)).toLocaleString()} for the next.
          Those games won {ABLATIONS[0].foundWinPct.toFixed(1)}%.
        </Prose>
        <DataTable
          rows={ABLATIONS}
          rowKey={(a) => a.term}
          columns={[
            { label: "TERM", cell: (a) => a.term },
            {
              label: "FOUND ALONE",
              unit: "GAMES",
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
              label: "THEY WON",
              unit: "WIN RATE",
              numeric: true,
              cell: (a) => `${a.foundWinPct.toFixed(1)}%`,
            },
            {
              label: "IF REMOVED",
              unit: "HEADLINE, PP",
              numeric: true,
              style: { color: "var(--term-text-muted)" },
              cell: (a) => `${signedNumber(a.delta)}pp`,
            },
          ]}
        />
        <Note>
          Removing travel or road <em>raises</em>{" "}the headline rate, because the games they
          add win less often than the model&rsquo;s overall {ABLATION_BASELINE.winPct}%. It
          also costs coverage. Without travel the model has {ABLATIONS[0].edgeLost} fewer net
          correct calls above a coin flip and drops{" "}
          {ABLATIONS[0].found.toLocaleString()} called games. Those are all dropped calls,
          including losses, not a count of winning predictions.
        </Note>
        <Note>
          The full model is {ABLATION_BASELINE.edge.toLocaleString()} correct calls above a coin
          flip across {ABLATION_BASELINE.called.toLocaleString()} games. Freshness is the only
          term whose removal improves that count, by{" "}
          {-ABLATIONS[ABLATIONS.length - 1].edgeLost} calls. Every term stays in place under the
          evaluation protocol in ADR 0006. The terms multiply each other, so these figures do
          not add up to the total.
        </Note>
        <Note>
          This section counts against a coin flip, not against the{" "}
          {REST_SPLIT_BASELINE.homeWinPct}% home baseline used everywhere else. That gives the
          model credit for home court too, so it measures accuracy and coverage together, not
          improvement over home court. Against the home baseline, the rested home team is{" "}
          {signedNumber(liftOverBaseline(RESTED_AT_HOME.winPct, REST_SPLIT_BASELINE.homeWinPct))}{" "}
          points, as Model Results shows.
        </Note>
        <Note>
          A separate out-of-sample fit found travel adds little <em>independent</em> information
          once the other terms are known. This table answers a different question: which games
          cross the threshold when travel is included. A change in coverage does not show that
          travel improves a fitted model.
        </Note>
      </Section>

      <Section label="WHERE THE DATA COMES FROM" title="Data sources and revisions" disclosure>
        <Prose>
          Completed seasons come from the NBA&rsquo;s own feeds. The current season&rsquo;s
          schedule and nightly scores come from ESPN. Archived period scores and team minutes
          confirm historical overtime, and reviewed team records settle conflicts between
          archives. Arena corrections come from NBA and venue records. Missing tip times and
          results are left missing, not guessed.
        </Prose>
        <Prose>
          The model tracks the actual arena, the team&rsquo;s home base and which team was at
          home as three separate facts. Temporary homes use dated records, such as the
          Raptors&rsquo; season in Tampa and the Hornets&rsquo; Katrina-era hosts. A game at an
          alternate home such as Austin stays a home game, with travel measured to where it was
          actually played. Cup finals and play-in games count toward workload but are not
          regular-season results.
        </Prose>
        <Note>
          Older seasons have less complete inputs. Corrections restore verified overtime and
          venues, but many older games have no tip time and use the fallback. A 1994 score and
          a 2024 score are not built from identical information.
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
            "The 2019-20 Orlando bubble is left out of these findings, because the travel model was not built for life on one campus. Games before the suspension, and the condensed 2020-21 season, are included.",
          ]}
        />
      </Section>

      <Section label="HOW THE MODEL IS SCORED" title="Evaluation protocol and model history" disclosure>
        <Prose>
          The constants were set by reasoning about the physical effect and reviewed before the
          backtest ran. None was tuned to raise this win rate, because choosing constants from
          the test results would overstate how well the model does.
        </Prose>
        <Prose>
          Two changes have been made since, both recorded in ADR 0006. On 2026-08-02 the
          altitude multiplier went from 1.15 to 1.29, to match altitude&rsquo;s measured size
          next to a back-to-back on final margin. That is a different target from the win rates
          here, though the same historical games were used, so it is not an independent test.
          On 2026-10-17 a smaller altitude charge for the game after an altitude visit was
          removed, because it measured no effect.
        </Prose>
        <Note>
          Research fits keep their original sample, which includes neutral-site and bubble
          games. The published win rates apply their own exclusions, so the two use different
          denominators. The October 20, 2026 refresh corrected historical inputs and
          regenerated these figures, without adopting the research fit&rsquo;s coefficients.
          Earlier dated results in ADR 0006 describe earlier inputs.
        </Note>
      </Section>
    </BehindTheDataShell>
  );
}
