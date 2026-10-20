import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  LimitList,
  Note,
  Prose,
  Section,
} from "@/components/behind-the-data-parts";
import { NBA_SEASONS } from "@/lib/nba-season";
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
    note: `Cached player inputs through ${AVAILABILITY_INPUT_COVERAGE.lastCacheSeason}; shooting and availability apply different sample filters. Source coverage is not the regression sample.`,
  },
  {
    field: "Last Two Minute reports",
    from: officiatingData.seasons[0].season,
    source: "NBA Official",
    note: `Published regular-season reports through ${officiatingData.seasons.at(-1)?.season}; selected close-game endings only.`,
  },
  {
    field: "Schedules, scores, results",
    from: NBA_SEASONS[0],
    source: "NBA feeds; ESPN",
    note: "Completed seasons from NBA feeds. The current season's schedule and nightly scores come from ESPN.",
  },
  {
    field: "Overtime periods",
    from: NBA_SEASONS[0],
    source: "ESPN; NBA box scores; reviewed team records",
    note: "Period scores and team minutes confirm historical overtime. Retained NBA box scores and reviewed supporting records resolve the archive gaps and conflicts.",
  },
  {
    field: "Tip-off times",
    from: "Historical coverage varies",
    source: "NBA feeds; ESPN",
    note: "Without one, the back-to-back multiplier falls back to its flat value.",
  },
  {
    field: "Neutral-site venues",
    from: "Historical coverage varies",
    source: "ESPN; NBA and venue records",
    note: "Known earlier international games use their actual arenas. An alternate home arena is not automatically neutral.",
  },
  {
    field: "Shot locations",
    from: "1996-97",
    source: "NBA shot charts (nba_api)",
    note: "Expected Shot Value only. These records do not include defender or tracking fields.",
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
          Coverage depends on the field. The table lists each source and the earliest
          coverage used here; individual studies apply further sample filters.
        </Prose>
        <DataTable
          wrapperClassName="reference-definitions"
          rows={COVERAGE}
          rowKey={(row) => row.field}
          columns={[
            { label: "FIELD", style: { fontWeight: 700 }, cell: (row) => row.field },
            { label: "FROM", className: "whitespace-nowrap", cell: (row) => row.from },
            { label: "SOURCE", className: "whitespace-nowrap", cell: (row) => row.source },
            {
              label: "NOTE",
              style: { color: "var(--term-text-muted)" },
              cell: (row) => row.note,
            },
          ]}
        />
        <Note>
          Earlier input coverage remains uneven despite archived corrections. The same formula
          uses the fields available for each game, so a 1994 score and a 2024 score are not
          built from identical information.
        </Note>
      </Section>

      <Section label="EXCLUDED ON PURPOSE" title="Exclusion rules and their history" disclosure>
        <Prose>
          These rules describe the published regular-season rest findings and schedule
          comparisons. Individual research fits can use different cohorts; their methods
          identify those samples separately.
        </Prose>
        <DataTable wrapperClassName="reference-definitions" rows={[
          { games: "Playoffs", rule: "Excluded from regular-season rest win rates; series outcomes are modeled separately in Playoff Rest." },
          { games: "Orlando bubble", rule: "Excluded; the pre-suspension part of 2019-20 remains in regular-season analysis." },
          { games: "2019-20 in Schedule Edge", rule: "Entire season excluded from rankings because teams played unequal schedules." },
          { games: "Preseason", rule: "Excluded; rotations do not represent regular-season play." },
        ]} rowKey={(row) => row.games} columns={[
          { label: "Games", cell: (row) => row.games },
          { label: "Rule", cell: (row) => row.rule },
        ]} />
        <Prose>
          Playoff outcomes do not enter the regular-season rest win rates. Completed competitive
          games can still contribute to a team’s preceding workload when they fall inside the
          relevant window. Playoff Rest uses a separate model of whole series rather than
          treating its series probabilities as regular-season fatigue picks.
        </Prose>
        <Prose>
          The <strong>2019-20 Orlando bubble</strong> is excluded because every game was played
          at a single site: there is no travel to measure and no home crowd to weigh. That is a
          statement about roughly 88 games between 30 July and 11 October 2020, not about the
          season. The 971 games that season played before the 11 March suspension were reached by
          flying to them, and they are in.
        </Prose>
        <details className="fc-disclosure"><summary>Exclusion correction: July 2026</summary><Note>
          Until 30 July 2026 the whole of
          2019-20 was absent, and those ~970 ordinary games went with it. The rule was written as
          an October-to-April calendar window, which caught the bubble only by coincidence of
          dates, and along the way dropped 179 legitimate games from seasons that did not run
          October to April: 135 from 2020-21, which ran to 16 May, and 44 from the 1998-99
          lockout season. The exclusion now uses the bubble dates directly.
        </Note></details>
        <Prose>
          One surface still withholds the season in full. <strong>Schedule Edge</strong> ranks
          teams against each other within a single season, and teams finished 2019-20 with
          unequal numbers of games, including different access to the restart. Fewer games mean
          fewer chances to accumulate an edge, so raw totals would not be comparable. Schedule
          Edge applies its schedule-comparability checks before publishing rankings.
        </Prose>
        <Note>
          The lockout seasons are kept for the same reason 2020-21 is: 1998-99 ran 50 games and
          2011-12 ran 66, both with normal travel and equal scheduled lengths. A shorter season
          does not by itself make teams’ schedules incomparable.
        </Note>
      </Section>

      <Section label="ACCURACY OF THE TRAVEL FIGURE" title="How travel is estimated" disclosure>
        <Prose>
          Mileage estimates straight-line distance between scheduled arena stops. Dated venue
          records cover known temporary bases, alternate homes and international games. Two
          games listed at home can still involve travel when they use different arenas.
          The 2020 restart uses a campus-level location and remains excluded from the
          regular-season rest findings.
        </Prose>
        <Note>
          A season total counts each inbound leg once, starting from the team&rsquo;s modeled
          base, and omits a final trip home. A game&rsquo;s rolling Mileage covers its stated
          recent window. Actual flights, bus trips, intermediate stops at home and overnight
          locations are not observed; the model does not infer them from days off.
        </Note>
      </Section>

      {/* Separate from KNOWN GAPS on purpose, and the distinction is the point: a gap is
          something this site tried to have and does not. What follows is the opposite — inputs
          it could add and has decided against, because adding them would change what the site
          is. Filing them as gaps read as an apology for a choice. */}
      <Section label="WHAT THIS SITE DOES NOT DO" title="What each model includes" disclosure>
        <Prose>
          The regular-season fatigue score uses schedule inputs and excludes team strength,
          betting lines, and expected lineups. Playoff Rest uses a separate series model that
          includes regular-season team records. Availability cost uses team strength as a
          control and identifies missing players from completed games.
        </Prose>
        <Note>
          Historical rest splits describe associations. They do not isolate the causal
          effect of rest or account for every factor needed to forecast a game.
        </Note>
      </Section>

      <Section label="KNOWN GAPS" title="Known data gaps" disclosure>
        <LimitList
          items={[
            "Some archived box-score fields disagree. Reviewed corrections retain each source conflict and the evidence used to resolve the affected field.",
            "Known earlier neutral games and alternate home arenas use dated venue corrections. The register is not a complete audit of every historical arena; uncovered venues can still use the listed host’s modeled base.",
            "Arena locations reflect documented relocations and temporary bases. Straight-line Mileage does not observe the airport used, the actual flight route, overnight stays or intermediate trips home.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
