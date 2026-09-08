import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
  ValueGrid,
} from "@/components/behind-the-data-parts";
import { DataTable } from "@/components/ui/data-table";
import benchmark from "@/data/win-total-benchmark.json";
import {
  BIG_EDGE_FATIGUE_THRESHOLD,
  REST_DAYS_CAP,
} from "@/lib/schedule-disparity";
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence";
import {
  HOME_COURT_SPAN_PP,
  REST_SHARE_OF_HOME_COURT,
  REST_SPAN_PP,
  REST_STATE_LIFT_PP,
} from "@/lib/schedule-value";

export const metadata: Metadata = {
  title: "Schedule Edge · Behind the Data",
  description:
    "How a season's schedule is scored for and against each team: net edge games, what one edge is worth in wins, the two thresholds, why the count is games rather than days of rest, and the market check that came back null.",
};

/** Percent with one decimal from an over count — 47.9% styling, tabular in the table. */
function pct(overs: number, n: number): string {
  return `${((overs / n) * 100).toFixed(1)}%`;
}

export default function ScheduleEdgeMethodPage() {
  return (
    <BehindTheDataShell
      topic="schedule-edge"
      eyebrow="BEHIND THE DATA · SCHEDULE EDGE"
      title="Schedule edge"
      description="A within-season comparison of favourable and unfavourable rest gaps, with a win-equivalent estimate based on historical rates."
    >
      <Section label="THE HEADLINE" title="Counting favorable and unfavorable games">
        <Prose>
          For every game a team played, the fatigue gap against that night&rsquo;s opponent is
          the same rest advantage the rest of the site uses. A game counts
          as <strong>favourable</strong> when the opponent was the more tired side by at least{" "}
          {NEUTRAL_REST_ADVANTAGE_THRESHOLD}, and <strong>unfavourable</strong> when the team
          itself was. The season total is the difference.
        </Prose>
        <Formula>
          {`netEdgeGames = favourableGames − unfavourableGames

favourable    fatigue gap ≥ +${NEUTRAL_REST_ADVANTAGE_THRESHOLD} in the team's favour
unfavourable  fatigue gap ≥ ${NEUTRAL_REST_ADVANTAGE_THRESHOLD} against
big edge      the ≥ ${BIG_EDGE_FATIGUE_THRESHOLD} subset of either side`}
        </Formula>
        <Note>
          Because every game is counted once from each side, the league&rsquo;s net edge games
          sum to zero by construction. That is a useful check rather than a finding: a season
          where the totals did not cancel would mean a bug.
        </Note>
      </Section>

      <Section label="WHAT AN EDGE IS WORTH" title="What Worth means" disclosure>
        <Prose>
          <strong>Worth</strong>{" "}adds each game&rsquo;s historical rest-state win-rate difference
          from its venue baseline. This calculation does not fit a new model or use the
          team&rsquo;s results. Teams with the same schedule conditions receive the same
          estimate even if their win totals differ.
        </Prose>
        <ValueGrid
          values={[
            {
              label: "Fresher side, at home",
              value: `${REST_STATE_LIFT_PP.restedHome > 0 ? "+" : ""}${REST_STATE_LIFT_PP.restedHome.toFixed(2)}`,
              sub: "points of win probability",
            },
            {
              label: "Tireder side, at home",
              value: `${REST_STATE_LIFT_PP.tiredHome.toFixed(2)}`,
              sub: "facing a fresher visitor",
            },
            {
              label: "A rest edge, against home court",
              value: `${Math.round(REST_SHARE_OF_HOME_COURT * 100)}%`,
              sub: `${REST_SPAN_PP.toFixed(1)} points against ${HOME_COURT_SPAN_PP.toFixed(1)}`,
            },
          ]}
        />
        <Prose>
          The two rest groups sit at different distances from the home baseline. The gap
          between them is {REST_SPAN_PP.toFixed(1)} percentage points; the home-road gap is{" "}
          {HOME_COURT_SPAN_PP.toFixed(1)}. Rest is roughly{" "}
          {Math.round(REST_SHARE_OF_HOME_COURT * 100)}% of that home-road gap. These comparisons
          describe historical groups rather than causal effects.
        </Prose>
        <Note>
          Net season values are small because favourable and unfavourable games partly
          offset each other, and each game is priced at a small difference from its venue baseline.
        </Note>
        <Note>
          Worth includes season openers because a fatigue score exists for them. Rest-day
          comparisons exclude openers because there is no previous game.
        </Note>
        <details className="fc-disclosure"><summary>Season-opener revision</summary><Prose>Excluding openers previously made this page and Season Report disagree by a tenth of a win for the same team.</Prose></details>
      </Section>

      {/* Moved here whole from the foot of /schedule on 2026-08-24 (ADR 0009); the page keeps
          a one-paragraph sentry with the r. Both render the same committed benchmark JSON. */}
      <Section label="THE MARKET CHECK" title="Preseason win totals: no consistent relationship" disclosure>
        <Prose>
          Across {benchmark.seasonsCovered} seasons of archived lines, teams with more
          favorable schedules did not consistently beat their preseason win-total lines:
        </Prose>
        <DataTable
          wrapperClassName="overflow-x-auto"
          width="numeric"
          minWidth={360}
          rows={benchmark.buckets}
          rowKey={(b) => b.label}
          columns={[
            { label: "Net edge games", cell: (b) => b.label },
            {
              label: "Went over",
              unit: "percent of the bucket",
              numeric: true,
              style: { fontWeight: 700 },
              cell: (b) => pct(b.overs, b.n),
            },
            {
              label: "Team-seasons",
              numeric: true,
              style: { color: "var(--term-text-muted)" },
              cell: (b) => b.n,
            },
          ]}
        />
        <Prose>
          The correlation between a team&rsquo;s net edge
          games and its finish against the line is r&nbsp;=&nbsp;
          {benchmark.correlation.r.toFixed(2)} across {benchmark.correlation.n}{" "}
          team-seasons. The archive does not show
          a consistent relationship between net edge and beating the line. It does not prove
          that markets fully price the schedule or rule out every possible betting strategy.
        </Prose>
        <Note>
          Lines from the {benchmark.source}, {benchmark.firstSeason} through{" "}
          {benchmark.lastSeason}. No lines were published for the 1998-99 lockout, and 2019-20
          is skipped here because its season was suspended at 63 to 67 games; a preseason win
          total never got a full schedule to resolve against. {benchmark.pushes} pushes are
          excluded from the rates; overs hit {pct(benchmark.overall.overs, benchmark.overall.n)}{" "}
          overall in this archive. The archive&rsquo;s win
          count matched this site&rsquo;s own game records for every one of the{" "}
          {benchmark.teamSeasons} team-seasons before anything was computed.
        </Note>
      </Section>

      <Section label="THE THRESHOLDS" title="Thresholds and rest-day limits" disclosure>
        <ValueGrid
          values={[
            {
              label: "Counts as an edge",
              value: `${NEUTRAL_REST_ADVANTAGE_THRESHOLD}`,
              sub: "shared with every page",
            },
            {
              label: "Counts as a big edge",
              value: `${BIG_EDGE_FATIGUE_THRESHOLD}`,
              sub: "one tier above",
            },
            {
              label: "Rest days capped at",
              value: `${REST_DAYS_CAP}`,
              sub: "per side, before differencing",
            },
          ]}
        />
        <Prose>
          The {NEUTRAL_REST_ADVANTAGE_THRESHOLD} threshold is
          the same line the whole site uses to decide whether a game is worth calling at all.
          Using a different one here would let a game count as a schedule edge while the Games
          page called it too close to matter.
        </Prose>
        <Prose>
          The rest-days cap exists because of the All-Star break. The fatigue model already
          holds that rest stops helping after three days, and without a cap those few
          post-break games would swamp the other eighty: both teams get about a week off,
          rarely the exact same number of days, and the raw difference is enormous. Capping at{" "}
          {REST_DAYS_CAP} per side before differencing keeps the season total describing
          schedule disparity rather than calendar arithmetic.
        </Prose>
      </Section>

      <Section label="WHAT ELSE IS COUNTED" title="Back-to-backs and dense stretches" disclosure>
        <Prose>
          Alongside the headline, each team&rsquo;s season carries the raw structural burdens:
          back-to-backs played, games that were the third in four nights, and the fourth in six.
          These counts follow the dates on the schedule and do not use fatigue-score thresholds.
        </Prose>
        <Note>
          A dense-window flag describes the game that <em>closes</em> the window, not every game
          inside it. Counting each game in a 3-in-4 stretch as a 3-in-4 would treble the total.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Coverage and limitations" disclosure>
        <LimitList
          items={[
            "2019-20 is excluded from this ranking because teams stopped with 63 to 67 games played. Unequal schedule lengths give teams different numbers of opportunities to accumulate an edge.",
            "Rankings compare teams within a season. Schedule length, travel patterns, and back-to-back frequency change across eras.",
            "The NBA publishes only 80 of each team's 82 games before the season. The last two are added in December once NBA Cup group play resolves, so a forward-looking total is provisionally two games short.",
            "It inherits every limit of the fatigue model it is built on, including no injuries, no rotations and no knowledge of team quality.",
            "A favourable schedule is not a prediction. It says the calendar handed a team more rested nights than tired ones, not that they were good.",
            "The Worth column uses pooled historical rates since 1985-86. A displayed season's observed rates can differ, so this estimate does not explain that season's actual wins and losses.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
