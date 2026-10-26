import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  LimitList,
  Note,
  Prose,
  Section,
} from "@/components/behind-the-data-parts";
import { NBA_SEASONS } from "@/lib/nba-season";
import { WIDTH } from "@/lib/terminal-styles";
import { DataTable } from "@/components/ui/data-table";
import { AVAILABILITY_INPUT_COVERAGE } from "@/lib/availability-facts";
import officiatingData from "@/data/officiating.json";

export const metadata: Metadata = {
  title: "Data & Limits · Behind the Data",
  description:
    "Where FullCourt's data comes from, which seasons carry which fields, what is excluded on purpose, what the site does not model, and the known gaps.",
};

const COVERAGE = [
  {
    field: "Player box scores",
    from: AVAILABILITY_INPUT_COVERAGE.firstCacheSeason,
    source: "NBA / hoopR",
    note: `Through ${AVAILABILITY_INPUT_COVERAGE.lastCacheSeason}. Shooting and Availability each filter this further, so source coverage is not the regression sample.`,
  },
  {
    field: "Last Two Minute reports",
    from: officiatingData.seasons[0].season,
    source: "NBA Official",
    note: `Regular-season reports through ${officiatingData.seasons.at(-1)?.season}. They cover only selected close-game endings.`,
  },
  {
    field: "Schedules, scores, results",
    from: NBA_SEASONS[0],
    source: "NBA feeds; ESPN",
    note: "Completed seasons come from NBA feeds; the current season's schedule and nightly scores from ESPN.",
  },
  {
    field: "Overtime periods",
    from: NBA_SEASONS[0],
    source: "ESPN; NBA box scores; reviewed team records",
    note: "Period scores and team minutes confirm overtime. Saved NBA box scores and reviewed records settle gaps and conflicts.",
  },
  {
    field: "Tip-off times",
    from: "Historical coverage varies",
    source: "NBA feeds; ESPN",
    note: "Without a tip time, the back-to-back multiplier uses its flat value.",
  },
  {
    field: "Neutral-site venues",
    from: "Historical coverage varies",
    source: "ESPN; NBA and venue records",
    note: "Known international games use their real arenas. An alternate home arena is not automatically neutral.",
  },
  {
    field: "Shot locations",
    from: "1996-97",
    source: "NBA shot charts (nba_api)",
    note: "Used only for Expected Shot Value. No defender or tracking data.",
  },
] as const;

export default function DataAndLimitsPage() {
  return (
    <BehindTheDataShell
      topic="data-and-limits"
      eyebrow="BEHIND THE DATA · DATA & LIMITS"
      title="Data and limits"
      description="Data sources, season coverage, exclusions, and known gaps in FullCourt's analyses."
    >
      <Section label="COVERAGE" title="Data sources and coverage" descriptor={`Supported seasons: ${NBA_SEASONS[0]} to ${NBA_SEASONS.at(-1)}; field coverage varies`}>
        {/* Deliberately says nothing about *why* three fields come from ESPN. The reason is
            operational, it identifies where this is run from, and no reader of this page is
            served by it. The sources themselves are the answer, and the table lists them. */}
        <Prose>
          Coverage depends on the field. Each entry gives the source and the earliest season
          used here. Individual studies filter further.
        </Prose>
        <div className="reference-coverage" style={{ maxWidth: WIDTH.prose }}>
          {COVERAGE.map((row) => (
            <article key={row.field}>
              <h3>{row.field}</h3>
              <dl>
                <dt>From</dt><dd>{row.from}</dd>
                <dt>Source</dt><dd>{row.source}</dd>
                <dt>Note</dt><dd>{row.note}</dd>
              </dl>
            </article>
          ))}
        </div>
        <Note>
          Earlier input coverage remains uneven despite archived corrections. The same formula
          uses the fields available for each game, so a 1994 score and a 2024 score are not
          built from identical information.
        </Note>
      </Section>

      <Section label="EXCLUDED ON PURPOSE" title="Exclusion rules and their history" disclosure>
        <Prose>
          These rules apply to the published regular-season rest findings and schedule
          comparisons. Research fits can use other samples, and each says which.
        </Prose>
        <DataTable wrapperClassName="reference-definitions" rows={[
          { games: "Playoffs", rule: "Left out of regular-season rest win rates. Playoff Rest models series separately." },
          { games: "Orlando bubble", rule: "Left out. The part of 2019-20 before the suspension stays in." },
          { games: "2019-20 in Schedule Edge", rule: "Whole season left out of the rankings, because teams played unequal schedules." },
          { games: "Preseason", rule: "Left out. Rotations are not regular-season play." },
        ]} rowKey={(row) => row.games} columns={[
          { label: "Games", cell: (row) => row.games },
          { label: "Rule", cell: (row) => row.rule },
        ]} />
        <Prose>
          Playoff results never enter the regular-season win rates. Played playoff games can
          still add to a team&rsquo;s workload when they fall inside a window.
        </Prose>
        <Prose>
          The <strong>2019-20 Orlando bubble</strong> is left out because every game was at one
          site: no travel to measure and no home crowd. That covers the games between 30 July
          and 11 October 2020, not the season. The games played before the 11 March suspension
          involved normal travel, and they are in.
        </Prose>
        <details className="fc-disclosure"><summary>Exclusion correction: July 2026</summary><Note>
          Until 30 July 2026, all of 2019-20 was missing, including those ordinary games. The
          rule was an October-to-April date window. It caught the bubble only by coincidence,
          and it also dropped valid games from seasons that ran on other dates: the May games
          of 2020-21, which ended 16 May, and of the 1998-99 lockout season, which ended 5 May.
          The exclusion now uses the bubble dates directly.
        </Note></details>
        <Prose>
          One page still leaves out the whole season. <strong>Schedule Edge</strong> ranks teams
          within a season, and teams finished 2019-20 with different numbers of games and
          different access to the restart. Fewer games mean fewer chances to build an edge, so
          the totals would not compare.
        </Prose>
        <Note>
          The lockout seasons stay, for the same reason 2020-21 does: 1998-99 ran 50 games and
          2011-12 ran 66, both with normal travel and equal schedules for every team. A shorter
          season alone does not make schedules incomparable.
        </Note>
      </Section>

      <Section label="ACCURACY OF THE TRAVEL FIGURE" title="How travel is estimated" disclosure>
        <Prose>
          Mileage is the straight-line distance between scheduled arenas. Dated venue records
          cover temporary homes, alternate homes and international games, so two
          &ldquo;home&rdquo; games in different arenas can still involve travel. The 2020
          restart uses one campus location and stays out of the regular-season rest findings.
        </Prose>
        <Note>
          A season total counts each trip in once, starting from the team&rsquo;s home base, and
          leaves out the last trip home. A game&rsquo;s Mileage covers its recent window. Real
          flights, bus trips, stops at home and overnight stays are not observed, and the model
          does not guess them from days off.
        </Note>
      </Section>

      {/* Separate from KNOWN GAPS on purpose, and the distinction is the point: a gap is
          something this site tried to have and does not. What follows is the opposite — inputs
          it could add and has decided against, because adding them would change what the site
          is. Filing them as gaps read as an apology for a choice. */}
      <Section label="WHAT THIS SITE DOES NOT DO" title="What each model includes" disclosure>
        <Prose>
          The regular-season fatigue score uses the schedule only: no team strength, betting
          lines or expected lineups. Playoff Rest is a separate series model that does use
          team records. Availability cost uses team strength as a control and finds missing
          players from completed games.
        </Prose>
        <Note>
          Historical rest splits are associations. They do not isolate what rest causes, and
          they do not cover everything needed to forecast a game.
        </Note>
      </Section>

      <Section label="KNOWN GAPS" title="Known data gaps" disclosure>
        <LimitList
          items={[
            "Some archived box-score fields disagree. Reviewed corrections keep each conflict and the evidence used to settle it.",
            "Known neutral games and alternate home arenas use dated venue corrections. The list is not a full audit of every historical arena; a venue it misses can still use the host team's home base.",
            "Arena locations follow documented moves and temporary homes. Straight-line Mileage does not see the airport, the flight path, overnight stays or trips home in between.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
