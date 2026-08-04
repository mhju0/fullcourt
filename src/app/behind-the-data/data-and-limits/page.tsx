import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  LimitList,
  Note,
  Prose,
  Section,
  ValueGrid,
} from "@/components/behind-the-data-parts";
import { NBA_SEASONS } from "@/lib/nba-season";
import { termTdStyle, termThStyle } from "@/lib/terminal-styles";

export const metadata: Metadata = {
  title: "Data & Limits — Behind the Data",
  description:
    "Where FullCourt's data comes from, which seasons carry which fields, what is excluded on purpose, what the site does not model, and the known gaps.",
};

const COVERAGE = [
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
    note: "Earlier seasons read 0, which means unknown — not 'no overtime'.",
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
    note: "Shot Value only. No defender or tracking fields exist in public data.",
  },
] as const;

export default function DataAndLimitsPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · DATA & LIMITS"
      title="Data and limits"
      description="Where the numbers come from, which seasons carry which fields, and what is left out on purpose. The gaps are stated because a model is only as good as the reader's ability to check it."
    >
      <Section label="COVERAGE" descriptor={`${NBA_SEASONS.length} SEASONS`}>
        {/* Deliberately says nothing about *why* three fields come from ESPN. The reason is
            operational, it identifies where this is run from, and no reader of this page is
            served by it. The sources themselves are the answer, and the table lists them. */}
        <Prose>
          Not every field reaches back as far as the schedule does. Three inputs come from ESPN
          rather than the NBA feeds, and the table says which seasons carry which.
        </Prose>
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={termThStyle}>FIELD</th>
                <th style={termThStyle}>FROM</th>
                <th style={termThStyle}>SOURCE</th>
                <th style={termThStyle}>NOTE</th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map((row) => (
                <tr key={row.field}>
                  <td style={{ ...termTdStyle, fontWeight: 700 }}>{row.field}</td>
                  <td style={{ ...termTdStyle, whiteSpace: "nowrap" }}>{row.from}</td>
                  <td style={{ ...termTdStyle, whiteSpace: "nowrap" }}>{row.source}</td>
                  <td style={{ ...termTdStyle, color: "var(--term-text-muted)" }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          The consequence, plainly: the fatigue model is a slightly different model before and
          after 2002. Terms are applied where their data exists rather than back-filled with
          guesses, so a 1994 score and a 2024 score are not built from identical information.
        </Note>
      </Section>

      <Section label="EXCLUDED ON PURPOSE" descriptor="AND WHY">
        <ValueGrid
          values={[
            { label: "Playoff games", value: "Excluded", sub: "from the fatigue model" },
            { label: "Orlando bubble", value: "Excluded", sub: "Jul–Oct 2020, every model" },
            { label: "Preseason", value: "Excluded", sub: "rotations are not real" },
          ]}
        />
        <Prose>
          Playoff games are excluded from the regular-season fatigue model because a fixed
          two-team series breaks its travel assumptions — the opponent never changes and the
          itinerary is known weeks ahead. They are modelled separately, at series grain, on the
          Playoff Rest page.
        </Prose>
        <Prose>
          The <strong>2019-20 Orlando bubble</strong> is excluded because every game was played
          at a single site: there is no travel to measure and no home crowd to weigh. That is a
          statement about roughly 88 games between 30 July and 11 October 2020, not about the
          season. The 971 games that season played before the 11 March suspension were reached by
          flying to them, and they are in.
        </Prose>
        <Note>
          <strong>This is narrower than it used to be.</strong> Until 30 July 2026 the whole of
          2019-20 was absent, and those ~970 ordinary games went with it. The rule was written as
          a calendar window — October to April — which caught the bubble only by coincidence of
          dates, and along the way dropped 179 legitimate games from seasons that did not run
          October to April: 135 from 2020-21, which ran to 16 May, and 44 from the 1998-99
          lockout season. Naming the abnormal stretch excludes exactly what it means to.
        </Note>
        <Prose>
          One surface still withholds the season in full. <strong>Schedule Edge</strong> ranks
          teams against each other within a single season, and 2019-20 stopped with teams having
          played between 63 and 67 games. A team with four fewer games has four fewer chances to
          accumulate an edge, so its total would move without the schedule having favoured
          anyone. That is a different objection from the bubble one — not how the games were
          played, but that there are unequal numbers of them — and it applies to no other
          season on record, where the widest spread is a single game.
        </Prose>
        <Note>
          The lockout seasons are kept for the same reason 2020-21 is: 1998-99 ran 50 games and
          2011-12 ran 66, both with normal travel and both complete. A short season is only a
          problem for this site when it is also <em>interrupted</em>.
        </Note>
      </Section>

      <Section label="ACCURACY OF THE TRAVEL FIGURE" descriptor="AN ESTIMATE WITH EXACT INPUTS">
        <Prose>
          Which cities a team played in, in what order, on what dates, is exact — it comes from
          the game log. What is assumed is the itinerary between them: teams are modelled as
          flying venue to venue, returning home only when the next game is at home. No public
          source records what they actually did.
        </Prose>
        <Note>
          The error is one-sided and bounded. A team that really did fly home mid-trip flew
          extra miles, but also slept at home — so the unmodelled distance arrives with
          unmodelled recovery, and the two partly cancel. Distances are great-circle rather
          than routed, and this is the same convention published travel studies use.
        </Note>
      </Section>

      {/* Separate from KNOWN GAPS on purpose, and the distinction is the point: a gap is
          something this site tried to have and does not. What follows is the opposite — inputs
          it could add and has decided against, because adding them would change what the site
          is. Filing them as gaps read as an apology for a choice. */}
      <Section label="WHAT THIS SITE DOES NOT DO" descriptor="A CHOICE, NOT A GAP">
        <Prose>
          FullCourt measures what the schedule does to teams. It is not a prediction service, so
          nothing here takes opponent strength, betting lines, or favourites and underdogs as an
          input to a pick, and it never forecasts who will be available tonight. Availability is
          measured only after the fact, once the box score says who actually played — see
          Availability cost, which prices an absence against the same schedule terms and uses
          team strength as a control rather than a signal.
        </Prose>
        <Note>
          Those inputs are what a forecast is built from, and adding them would make this a
          tipping site that happens to track rest. The historical win rates here are
          associational for the same reason: they describe what has followed a rest gap, not what
          causes a team to win.
        </Note>
      </Section>

      <Section label="KNOWN GAPS" descriptor="NOT YET FIXED">
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
