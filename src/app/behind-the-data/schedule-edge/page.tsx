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
  title: "Schedule Edge — Behind the Data",
  description:
    "How a season's schedule is scored for and against each team: net edge games, what one edge is worth in wins, the two thresholds, and why the count is games rather than days of rest.",
};

export default function ScheduleEdgeMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · SCHEDULE EDGE"
      title="Schedule edge"
      description="Which teams a season's schedule favoured, counted in games where the rest gap was large enough to matter. Scoped to one season at a time, always."
    >
      <Section label="THE HEADLINE" descriptor="NET EDGE GAMES">
        <Prose>
          For every game a team played, the fatigue gap against that night&rsquo;s opponent is
          already known — it is the same rest advantage the rest of the site uses. A game counts
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

      <Section label="WHAT AN EDGE IS WORTH" descriptor="THE SAME COUNT, IN WINS">
        <Prose>
          A count of games answers &ldquo;how often&rdquo;, not &ldquo;how much&rdquo;. The{" "}
          <strong>Worth</strong>{" "}
          column prices each game at the win probability its rest state is
          measured to carry, against that venue&rsquo;s own baseline, and adds them up. Nothing is
          fitted here and no score is read — a 64-win team and a 17-win team handed the same
          schedule get the same number.
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
          Note the asymmetry, which is real: facing a fresher opponent costs about twice what
          being the fresher one pays. And note the scale. Swapping which side is rested moves a
          home team {REST_SPAN_PP.toFixed(1)} points; swapping the venue moves it{" "}
          {HOME_COURT_SPAN_PP.toFixed(1)}. Rest is roughly{" "}
          {Math.round(REST_SHARE_OF_HOME_COURT * 100)}% of home court — real, and much smaller
          than the thing every fan already accounts for.
        </Prose>
        <Note>
          The resulting figure is small for every team — no season&rsquo;s schedule has been worth
          half a win either way — and the reason is the calendar, not fatigue. The league hands out
          rest edges evenly enough that the per-game effect never accumulates. Quoting the wins
          figure without the per-game one beside it invites the opposite reading.
        </Note>
        <Note>
          Unlike every other column, this one counts each team&rsquo;s season opener. The opener
          has no previous game and so no rest-<em>days</em> differential, which is why the counts
          above exclude it — but a fatigue score exists for it, so the rest gap is measured. Leaving
          it out made this page and the Season Report disagree by a tenth of a win on the same team.
        </Note>
      </Section>

      <Section label="THE THRESHOLDS" descriptor="WHY THESE NUMBERS">
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
          The {NEUTRAL_REST_ADVANTAGE_THRESHOLD} threshold is not chosen for this page — it is
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

      <Section label="WHAT ELSE IS COUNTED" descriptor="THE SUPPORTING COLUMNS">
        <Prose>
          Alongside the headline, each team&rsquo;s season carries the raw structural burdens:
          back-to-backs played, games that were the third in four nights, and the fourth in six.
          These are facts about the schedule rather than model output — they need no threshold
          and carry no judgement.
        </Prose>
        <Note>
          A dense-window flag describes the game that <em>closes</em> the window, not every game
          inside it. Counting each game in a 3-in-4 stretch as a 3-in-4 would treble the total.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            "2019-20 is the one season this page will not rank, and the only place on the site that withholds a whole season. It was suspended with teams having played between 63 and 67 games, and a team with four fewer games has four fewer chances to accumulate an edge — its total would move without the schedule having favoured anyone. Every other season is within a single game of even.",
            "No cross-era ranking. A season's totals are only comparable within that season — schedule structure, travel norms and the number of back-to-backs have all changed enormously across four decades.",
            "The NBA publishes only 80 of each team's 82 games before the season. The last two are added in December once NBA Cup group play resolves, so a forward-looking total is provisionally two games short.",
            "It inherits every limit of the fatigue model it is built on, including no injuries, no rotations and no knowledge of team quality.",
            "A favourable schedule is not a prediction. It says the calendar handed a team more rested nights than tired ones, not that they were good.",
            "The Worth column prices edges at their long-run rate across every season since 1985-86, not at the rate the displayed season happened to produce. Individual seasons swing hard around that rate — 2025-26's own rested-at-home games actually landed slightly below its home baseline — so a season-specific price would report noise as schedule luck, and would flip signs from year to year.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
