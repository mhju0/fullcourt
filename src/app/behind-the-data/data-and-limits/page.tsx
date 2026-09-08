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
import { AVAILABILITY_SAMPLE } from "@/lib/availability-facts";
import officiatingData from "@/data/officiating.json";

export const metadata: Metadata = {
  title: "Data & Limits · Behind the Data",
  description:
    "Where FullCourt's data comes from, which seasons carry which fields, what is excluded on purpose, what the site does not model, and the known gaps.",
};

const COVERAGE = [
  {
    field: "Player box scores",
    from: AVAILABILITY_SAMPLE.firstSeason,
    source: "NBA / hoopR",
    note: "Player-level shooting and availability inputs; each analysis applies its own filters.",
  },
  {
    field: "Last Two Minute reports",
    from: officiatingData.seasons[0].season,
    source: "NBA Official",
    note: `Published regular-season reports through ${officiatingData.seasons.at(-1)?.season}; selected close-game endings only.`,
  },
  {
    field: "Schedules, scores, results",
    from: "1985-86",
    source: "NBA feeds",
    note: "Complete across every covered season.",
  },
  {
    field: "Overtime periods",
    from: "~2002",
    source: "ESPN",
    note: "Earlier seasons read 0 because overtime is unknown.",
  },
  {
    field: "Tip-off times",
    from: "~2002",
    source: "ESPN",
    note: "Without one, the back-to-back multiplier falls back to its flat value.",
  },
  {
    field: "Neutral-site venues",
    from: "2013",
    source: "ESPN",
    note: "Earlier international games are scored at the listed host's arena.",
  },
  {
    field: "Shot locations",
    from: "1996-97",
    source: "hoopR / play-by-play",
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
      <Section label="COVERAGE" title="Data sources and coverage" descriptor={`${NBA_SEASONS.length} seasons; coverage varies by field`}>
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
          Input coverage changes around 2002. The same formula uses the fields available for
          each game, so a 1994 score and a 2024 score are not built from identical information.
        </Note>
      </Section>

      <Section label="EXCLUDED ON PURPOSE" title="Exclusion rules and their history" disclosure>
        <DataTable wrapperClassName="reference-definitions" rows={[
          { games: "Playoffs", rule: "Excluded from regular-season fatigue analysis; modeled separately in Playoff Rest." },
          { games: "Orlando bubble", rule: "Excluded; the pre-suspension part of 2019-20 remains in regular-season analysis." },
          { games: "2019-20 in Schedule Edge", rule: "Entire season excluded from rankings because teams played unequal schedules." },
          { games: "Preseason", rule: "Excluded; rotations do not represent regular-season play." },
        ]} rowKey={(row) => row.games} columns={[
          { label: "Games", cell: (row) => row.games },
          { label: "Rule", cell: (row) => row.rule },
        ]} />
        <Prose>
          Playoff games are excluded from the regular-season fatigue model because a fixed
          two-team series breaks its travel assumptions: the opponent never changes and the
          itinerary is known weeks ahead. They are modeled as whole series on the
          Playoff Rest page.
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
          teams against each other within a single season, and 2019-20 stopped with teams having
          played between 63 and 67 games. A team with four fewer games has four fewer chances to
          accumulate an edge, so its total would move without the schedule having favored
          anyone. This exclusion addresses unequal schedule lengths and applies to no other
          season on record, where the widest spread is a single game.
        </Prose>
        <Note>
          The lockout seasons are kept for the same reason 2020-21 is: 1998-99 ran 50 games and
          2011-12 ran 66, both with normal travel and both complete. A short season is only a
          problem for this site when it is also <em>interrupted</em>.
        </Note>
      </Section>

      <Section label="ACCURACY OF THE TRAVEL FIGURE" title="How travel is estimated" disclosure>
        <Prose>
          The game log records cities, dates, and game order. The model assumes the itinerary between them:
          teams are modelled as
          flying venue to venue, returning home only when the next game is at home. No public
          itinerary data is used to verify those assumptions.
        </Prose>
        <Note>
          Distances use great-circle routes. Actual flight paths, stops at home, and recovery
          time can differ from this estimate. The data here cannot quantify how those
          differences affect a team&rsquo;s fatigue.
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
            "Pre-2002 overtime is unknown rather than zero. Basketball-Reference carries it and could close this gap; it has not been done.",
            "Neutral-site games before 2013 are unmarked, so Mexico City games from 1997 and the 2011-12 London games are geolocated at the listed host's arena. Basketball-Reference marks them.",
            "Arena coordinates are era-correct for relocations, but neutral-site venues rely on a small hand-maintained list of cities.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
