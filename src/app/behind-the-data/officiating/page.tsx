import type { Metadata } from "next";
import Link from "next/link";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import { Formula, Prose, Section } from "@/components/behind-the-data-parts";
import { DataTable } from "@/components/ui/data-table";
export const metadata: Metadata = { title: "Officiating · Behind the Data" };

const VERDICTS = [
  { code: "INC", name: "Incorrect non-call", meaning: "A missed call; counted as an error." },
  { code: "IC", name: "Incorrect call", meaning: "An incorrect whistle; counted as an error." },
  { code: "CC", name: "Correct call", meaning: "A correct whistle; retained in the report." },
  { code: "CNC", name: "Correct non-call", meaning: "Correctly allowing play to continue; retained in the report." },
];

export default function OfficiatingMethodPage() {
  return <BehindTheDataShell topic="officiating" eyebrow="BEHIND THE DATA · OFFICIATING" title="Officiating" description="How we count errors in the NBA's Last Two Minute reports.">
    <Section label="THE REVIEWED SAMPLE" title="Which games are reviewed">
      <Prose>Since 2017–18, the NBA publishes a report for every game within three points at any time in the last two minutes of the fourth quarter or overtime. Each report grades the calls, and the important non-calls, in that stretch. FullCourt shows regular-season reports only.</Prose>
      <Prose>Reports began on March 2, 2015, so 2014–15 is a partial season. Before 2017–18, a game qualified if it was within five points at the two-minute mark. The NBA has also changed how it presents calls over time, which limits comparisons across eras.</Prose>
      <Prose>We check that every report in the NBA&apos;s archive or season index was collected. We do not check whether that index lists every eligible game.</Prose>
      <Prose><a className="underline" href="https://official.nba.com/nba-last-two-minute-reports-frequently-asked-questions/">NBA report criteria and definitions ↗</a></Prose>
    </Section>
    <Section label="COUNTS AND COMPARISONS" title="What the verdicts mean">
      <DataTable wrapperClassName="reference-definitions" rows={VERDICTS} rowKey={(row) => row.code} columns={[
        { label: "Code", cell: (row) => row.code },
        { label: "NBA verdict", cell: (row) => row.name },
        { label: "Meaning", cell: (row) => row.meaning },
      ]} />
      <Formula>{`missed-call share = missed calls
                    ÷ all errors

errors per game   = all errors
                    ÷ reviewed games`}</Formula>
      <Prose>An error is an INC or an IC. Ungraded entries stay visible and are not counted as correct. Old labels &ldquo;Undetectable&rdquo;, &ldquo;NCI&rdquo; and &ldquo;NCC&rdquo; are kept separately and left out of error counts; we do not guess what NCI or NCC meant.</Prose>
      <details className="fc-disclosure"><summary>Limits of these comparisons</summary>
        <Prose>A game with no identified errors is not proof of perfect officiating. A reviewed decision may already reflect replay or a successful challenge. The headline measures the mix of errors, not how accurate the whistle was.</Prose>
        <Prose>The season strip plots each value on a labeled 50–100% scale. Each season covers different games and different amounts of overtime. These comparisons cannot show a change in referee intent, consistency or whole-game accuracy.</Prose>
      </details>
    </Section>
    <Section label="BROWSING AND SOURCES" title="Filters, quotations and source links" disclosure>
      <Prose>Team and call-type filters change the game browser only. Chip counts are league-wide errors for the selected season. Picking an error type hides games with no errors; filtering by team alone keeps them.</Prose>
      <Prose>Call categories keep the NBA&apos;s distinctions, with spacing cleaned up and a few labels shortened. Quoted verdicts keep the NBA&apos;s wording, without its HTML formatting.</Prose>
      <Prose>Early reports are PDFs. Their text keeps the NBA&apos;s wording, with line breaks removed. Each report records the original PDF link and hash. Video links inside PDFs have not been checked; the source PDF stays available.</Prose>
      <Prose>Crew names come from verified assignment data. Missing assignments are marked unavailable. Knowing the crew does not tell you which official made a call.</Prose>
      <Prose>Videos open on the NBA&apos;s own pages, which control playback. Team helped/hurt rankings are not shown: the NBA&apos;s summary totals disagree with its event-level data, and the event-level fields are incomplete.</Prose>
    </Section>
    <Section label="FRESHNESS AND REVISIONS" title="Data dates and report revisions" disclosure>
      <DataTable wrapperClassName="reference-definitions" rows={[
        { label: "Data through", meaning: "The latest reviewed game date." },
        { label: "Last successful refresh", meaning: "When collection finished for the published snapshot." },
      ]} rowKey={(row) => row.label} columns={[
        { label: "Date shown", cell: (row) => row.label },
        { label: "Meaning", cell: (row) => row.meaning },
      ]} />
      <Prose>A daily job collects new reports for review. The public snapshot changes only after review and deployment, and a failed or partial run leaves it untouched. A report that vanishes from the NBA&apos;s index must be reviewed before anything is published.</Prose>
      <Prose>Raw snapshots and manifests are saved with each refresh. Every published report keeps its source hash in its filename, so a revised report cannot quietly replace the one a page already showed.</Prose>
    </Section>
    <Section label="RESEARCH ARCHIVE" title="Earlier referee research" disclosure>
      <Prose>The foul-pattern table, timing comparisons and official-player studies use different samples from the Last Two Minute reports.</Prose>
      <Link className="reference-button" href="/behind-the-data/referees/archive">Open referee research archive →</Link>
    </Section>
  </BehindTheDataShell>;
}
