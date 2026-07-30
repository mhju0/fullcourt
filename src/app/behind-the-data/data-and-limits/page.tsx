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
    "Where FullCourt's data comes from, which seasons carry which fields, what is excluded on purpose, and the known gaps.",
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
        <Prose>
          Not every field reaches back as far as the schedule does. Three inputs arrive from
          ESPN rather than the NBA, because the NBA endpoint that serves them is not reachable
          from outside the United States — a failure that went unnoticed long enough that the
          overtime term sat dormant across all 49,353 games before it was found.
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
          The consequence is worth stating plainly: the fatigue model is quietly a slightly
          different model before and after 2002. Terms are applied where their data exists
          rather than being back-filled with guesses or withheld from four decades of games,
          and the cost is that a 1994 score and a 2024 score are not built from identical
          information.
        </Note>
      </Section>

      <Section label="EXCLUDED ON PURPOSE" descriptor="AND WHY">
        <ValueGrid
          values={[
            { label: "Playoff games", value: "Excluded", sub: "from the fatigue model" },
            { label: "2019-20", value: "All of it", sub: "the season, not just the bubble" },
            { label: "Preseason", value: "Excluded", sub: "rotations are not real" },
          ]}
        />
        <Prose>
          Playoff games are excluded from the regular-season fatigue model because a fixed
          two-team series breaks its travel assumptions — the opponent never changes and the
          itinerary is known weeks ahead. They are modelled separately, at series grain, on the
          Playoff Predictions page.
        </Prose>
        <Prose>
          <strong>2019-20 is absent in full</strong>, which is worth stating precisely because
          the short version — &ldquo;the bubble is excluded&rdquo; — implies less than is true.
          Teams had played 63 to 67 of their 82 games before the March 2020 suspension, and
          those roughly 970 normally-travelled games are gone as well.
        </Prose>
        <Prose>
          Dropping them is deliberate rather than lazy. A truncated season in which teams played
          different numbers of games cannot be ranked at season grain, which is exactly what
          Schedule Edge does — a four-game difference in exposure would move a team&rsquo;s total
          without the schedule having favoured anyone. Against that, the games would add about
          2.5% to the backtest, which moves the measured edge in its third decimal.
        </Prose>
        <Note>
          Two asymmetries follow from it. <strong>2020-21 is included</strong> — its travel was
          ordinary, just compressed into a 72-game season between December and May, which means
          its schedule density runs hotter than the density anchors were calibrated against. And{" "}
          <strong>Shot Value does cover 2019-20</strong>: shot locations do not care about travel,
          so that surface has no reason to drop the season the fatigue model cannot use. It is the
          one place on the site where a season exists that the rest of it behaves as though it
          did not.
        </Note>
        <Note>
          The lockout seasons are kept for the same reason 2020-21 is: 1998-99 ran 50 games and
          2011-12 ran 66, both with normal travel. Short seasons are only a problem for this
          model when they are also <em>interrupted</em>.
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

      <Section label="KNOWN GAPS" descriptor="NOT YET FIXED">
        <LimitList
          items={[
            "Pre-2002 overtime is unknown rather than zero. Basketball-Reference could close this gap; it has not been done.",
            "Neutral-site games before 2013 are unmarked, so Mexico City games from 1997 and the 2011-12 London games are geolocated at the listed host's arena.",
            "No injury or availability data anywhere on the site. This is the largest single limitation across every model here.",
            "No opponent-strength control in any of the historical win rates. They are associational, not causal.",
            "Arena coordinates are era-correct for relocations, but neutral-site venues rely on a small hand-maintained list of cities.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
