import type { Metadata } from "next";
import Link from "next/link";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import { Prose, Section } from "@/components/behind-the-data-parts";
export const metadata: Metadata = { title: "Officiating · Behind the Data" };
export default function OfficiatingMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · OFFICIATING"
      title="Officiating"
      description="How we count errors in the NBA’s Last Two Minute reports."
    >
      <Section label="THE REVIEWED SAMPLE">
        <Prose>
          The NBA publishes Last Two Minute reports for games where the lead was
          three points or fewer at any point in the final two minutes of the
          fourth quarter or overtime. Reports assess calls and material
          non-calls. FullCourt currently displays regular-season reports only.
        </Prose>
        <Prose>
          We collect every report listed on each season’s NBA index. This
          verifies acquisition of indexed reports, not independent coverage of
          every eligible game. These are the NBA’s assessments, not an
          independent audit.
        </Prose>
        <Prose>
          <a
            className="underline"
            href="https://official.nba.com/nba-last-two-minute-reports-frequently-asked-questions/"
          >
            NBA report criteria and definitions ↗
          </a>
        </Prose>
      </Section>
      <Section label="COUNTS AND COMPARISONS">
        <Prose>
          Incorrect non-calls (INC) are missed calls. Incorrect calls (IC) are
          incorrect whistles. The headline divides INC by IC + INC. It is a
          share of identified errors, not a measure of whistle accuracy. Errors
          per reviewed game divides that same error count by the number of
          reviewed games.
        </Prose>
        <Prose>
          Correct calls (CC), correct non-calls (CNC), and ungraded assessments
          remain available inside each report. Ungraded rows are not counted as
          correct. A game with no identified errors does not establish perfect
          officiating. Reviewed decisions may reflect replay or a successful
          challenge.
        </Prose>
        <Prose>
          The season strip uses a labeled 50–100% range and prints each value.
          Seasons cover different games and may include different amounts of
          overtime. Comparisons are descriptive and do not establish a change in
          referee intent, consistency, or whole-game accuracy.
        </Prose>
      </Section>
      <Section label="BROWSING AND SOURCES">
        <Prose>
          Team and call-type filters affect the game browser only. Chip counts
          describe league-wide identified errors in the selected season. A
          specific error category excludes clean games; a team-only filter
          retains them. Call categories retain the NBA’s distinctions, with
          whitespace normalized and a few labels shortened for readability.
        </Prose>
        <Prose>
          Verdict quotations preserve the NBA’s wording, with HTML formatting
          removed and character entities decoded. Each report retains its source
          hash. Crew names come from the research’s verified assignment joins;
          missing assignments are labeled unavailable. Assignment does not
          identify which official was responsible for a call.
        </Prose>
        <Prose>
          Video links open the NBA’s own video pages. Playback and availability
          depend on the NBA. Team helped/hurt rankings are withheld because the
          source beneficiary summaries disagree with event totals and individual
          beneficiary fields are incomplete.
        </Prose>
      </Section>
      <Section label="FRESHNESS AND REVISIONS">
        <Prose>
          Data through is the latest reviewed game date. Last successful refresh
          is the collection completion date for the published snapshot. Daily
          collection prepares a data-update PR; the public snapshot changes
          after review and deployment. Failed or incomplete collection leaves
          the published snapshot intact. Reports that disappear from the source
          index require review before the publisher will proceed.
        </Prose>
        <Prose>
          Raw snapshots and manifests accompany refresh workflow artifacts.
          Published report files include their source hash in the filename, so a
          revised report cannot silently replace the evidence for a previously
          loaded page.
        </Prose>
      </Section>
      <Section label="RESEARCH ARCHIVE">
        <Prose>
          <Link className="underline" href="/behind-the-data/referees/archive">
            Referee foul patterns and historical research ↗
          </Link>
        </Prose>
        <Prose>
          The earlier foul-pattern table, timing comparisons, and
          official-player research remain available as a separate archive. Those
          studies use different samples from the seasonal L2M reports.
        </Prose>
      </Section>
    </BehindTheDataShell>
  );
}
