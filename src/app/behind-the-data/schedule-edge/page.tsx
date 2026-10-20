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
import { TYPE } from "@/lib/terminal-styles";
import { signedNumber } from "@/lib/signed-number";
import {
  HOME_COURT_SPAN_PP,
  REST_SHARE_OF_HOME_COURT,
  REST_SPAN_PP,
  REST_STATE_LIFT_PP,
} from "@/lib/schedule-value";

export const metadata: Metadata = {
  title: "Schedule Edge · Behind the Data",
  description:
    "How a season's schedule is scored for and against each team: net edge games, what one edge is worth in wins, the two thresholds, the rest-day cap, and the market check that came back null.",
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
      description="How each team's schedule is scored for and against it within one season, and what that is worth in wins."
    >
      <Section label="THE HEADLINE" title="Counting favorable and unfavorable games">
        <Prose>
          Every game has a rest advantage: the gap between the two teams&rsquo; fatigue scores.
          A game is <strong>favorable</strong> when the opponent is more tired by at least{" "}
          {NEUTRAL_REST_ADVANTAGE_THRESHOLD}, and <strong>unfavorable</strong> when the team is.
          The season total is one minus the other.
        </Prose>
        <Formula>
          {`net = favorable − unfavorable

favorable    gap ≥ ${NEUTRAL_REST_ADVANTAGE_THRESHOLD}, team fresher
unfavorable  gap ≥ ${NEUTRAL_REST_ADVANTAGE_THRESHOLD}, team tired
${BIG_EDGE_FATIGUE_THRESHOLD}+ edge      gap ≥ ${BIG_EDGE_FATIGUE_THRESHOLD}, either side`}
        </Formula>
        <Prose>
          Played and projected games both count. A game is left out when either team has no
          earlier game that season, because its fatigue score has nothing to build on. A missing
          score is not treated as an even game.
        </Prose>
        <Note>
          Every game is counted once from each side, so the league&rsquo;s net totals add up to
          zero. That is a check on the arithmetic, not a finding.
        </Note>
      </Section>

      <Section label="WHAT AN EDGE IS WORTH" title="What Worth means" disclosure>
        <Prose>
          <strong>Worth</strong> turns a schedule into wins. Each game puts the team in one of
          six groups: fresher, even or more tired, at home or on the road. Each group has a
          historical win rate. Worth adds up how far each game&rsquo;s group sits from its venue
          baseline.
        </Prose>
        <Formula>
          {`worth = sum of every game's lift

lift  = (group win % − venue win %)
        ÷ 100`}
        </Formula>
        <Prose>
          Worth does not use a team’s actual win record to award wins. It adds historical
          rest-group lifts for that schedule. Past game margins can affect the fatigue
          groups through the workload discount for blowouts.
        </Prose>
        <ValueGrid
          values={[
            {
              label: "Fresher side, at home",
              value: signedNumber(REST_STATE_LIFT_PP.restedHome, 2),
              sub: "points vs the home baseline",
            },
            {
              label: "More tired side, at home",
              value: signedNumber(REST_STATE_LIFT_PP.tiredHome, 2),
              sub: "points vs the home baseline",
            },
            {
              label: "Rest gap vs home court",
              value: `${Math.round(REST_SHARE_OF_HOME_COURT * 100)}%`,
              sub: `${REST_SPAN_PP.toFixed(1)} points against ${HOME_COURT_SPAN_PP.toFixed(1)}`,
            },
          ]}
        />
        <Prose>
          At home, going from more tired to fresher moves the win rate by{" "}
          {REST_SPAN_PP.toFixed(1)} points. Going from road to home moves it by{" "}
          {HOME_COURT_SPAN_PP.toFixed(1)}. So rest is worth about{" "}
          {Math.round(REST_SHARE_OF_HOME_COURT * 100)}% of home court. These are historical
          groups, not measured causes.
        </Prose>
        <Note>
          Season totals are small. Favorable and unfavorable games cancel each other out, and
          each game moves the total by only a fraction of a win.
        </Note>
        <Note>
          Worth includes season openers and leaves out neutral-site games, which have no home
          baseline. The net counts above still leave out games where either team has no earlier
          game that season.
        </Note>
        <details className="fc-disclosure">
          <summary>Season-opener revision</summary>
          <Prose>
            Worth used to leave out season openers too. That made this page and Season Report
            disagree by a tenth of a win for the same team.
          </Prose>
        </details>
      </Section>

      {/* Moved here whole from the foot of /schedule on 2026-08-24 (ADR 0009); the page keeps
          a one-paragraph sentry with the r. Both render the same committed benchmark JSON. */}
      <Section label="THE MARKET CHECK" title="Preseason win totals: no consistent relationship" disclosure>
        <Prose>
          Did teams with friendlier schedules beat their preseason win-total lines? Across{" "}
          {benchmark.seasonsCovered} seasons of archived lines, not consistently:
        </Prose>
        <DataTable
          wrapperClassName="overflow-x-auto"
          width="numeric"
          rows={benchmark.buckets}
          rowKey={(b) => b.label}
          columns={[
            { label: "Net edge", unit: "games", cell: (b) => <>{b.label}<br /><span style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)" }}>{b.n} team-seasons</span></> },
            {
              label: "Went over",
              unit: "share of teams",
              numeric: true,
              style: { fontWeight: 700 },
              cell: (b) => pct(b.overs, b.n),
            },
          ]}
        />
        <Prose>
          The correlation between net edge games and finishing over the line is
          r&nbsp;=&nbsp;{signedNumber(benchmark.correlation.r, 4)} across{" "}
          {benchmark.correlation.n} team-seasons. The archive does not show a consistent
          relationship between net edge and beating the line. That does not prove the market
          prices the schedule fully, or rule out every betting strategy.
        </Prose>
        <Note>
          Lines from the {benchmark.source}, {benchmark.firstSeason} through{" "}
          {benchmark.lastSeason}. The 1998-99 lockout had no lines. 2019-20 is skipped because
          it stopped at 63 to 67 games, so no win total could resolve. {benchmark.pushes} pushes
          are left out. Overs hit {pct(benchmark.overall.overs, benchmark.overall.n)} overall.
          Before anything was computed, the archive&rsquo;s win counts matched this site&rsquo;s
          records for all {benchmark.teamSeasons} team-seasons.
        </Note>
      </Section>

      <Section label="THE THRESHOLDS" title="Thresholds and rest-day limits" disclosure>
        <ValueGrid
          values={[
            {
              label: "Counts as an edge",
              value: `${NEUTRAL_REST_ADVANTAGE_THRESHOLD}`,
              sub: "fatigue points, same on every page",
            },
            {
              label: `Counts as a ${BIG_EDGE_FATIGUE_THRESHOLD}+ edge`,
              value: `${BIG_EDGE_FATIGUE_THRESHOLD}`,
              sub: "fatigue points: medium and large gaps",
            },
            {
              label: "Days off capped at",
              value: `${REST_DAYS_CAP - 1}`,
              sub: `per team (${REST_DAYS_CAP} days since the last game)`,
            },
          ]}
        />
        <Prose>
          The {NEUTRAL_REST_ADVANTAGE_THRESHOLD} line is the same one every page uses to decide
          whether a game has an edge at all. A different line here could count a game as a
          schedule edge that the Games page calls too close to matter.
        </Prose>
        <Prose>
          The days-off cap applies only to the separate net-days-off total. It stops long breaks,
          such as the All-Star break, from swamping that total. Each team&rsquo;s days off are
          capped at {REST_DAYS_CAP - 1} before the two are compared. Edge counts and Worth use
          fatigue scores and are not capped. The fatigue model itself keeps crediting rest past
          three days.
        </Prose>
      </Section>

      <Section label="WHAT ELSE IS COUNTED" title="Back-to-backs and dense stretches" disclosure>
        <Prose>
          The schedule breakdown also compares each team&rsquo;s back-to-backs and dense
          stretches with its opponents&rsquo;. A positive number means the opponents had more of
          them. These counts come straight from game dates, not fatigue scores, and skip the same
          opening games as above. NBA Cup finals and other unranked games still add to workload.
        </Prose>
        <Note>
          A dense-stretch flag goes on the game that <em>ends</em> the stretch, not every game in
          it. Flagging all three games of a 3-in-4 would count it three times.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Coverage and limitations" disclosure>
        <LimitList
          items={[
            "2019-20 is left out of the ranking. Teams played different numbers of games before the bubble, so they had different chances to build an edge.",
            "Rankings compare teams within one season. Schedule length, travel and back-to-back counts change across eras.",
            "Games after a team’s first unplayed date use projected fatigue from the published schedule. That first unplayed date can still use measured history. The page counts projected comparisons; rankings can change as games are played.",
            "In the current NBA Cup format, 80 of each team's 82 games are set in advance. The other two depend on Cup results, so a forward-looking total is incomplete until they are added. A Cup final adds workload but does not count as a regular-season game.",
            "It inherits every limit of the fatigue model: no injuries, no rotations, no team quality.",
            "A favorable schedule is not a prediction. It means more favorable than unfavorable fatigue gaps, nothing about how good the team is.",
            "Worth uses rates pooled since 1985-86. One season's real rates can differ, so Worth does not explain a season's actual record.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
