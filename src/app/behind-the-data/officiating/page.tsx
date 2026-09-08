import type { Metadata } from "next";
import Link from "next/link";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import { Prose, Section } from "@/components/behind-the-data-parts";
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
      <Prose>Since 2017–18, the NBA publishes reports for games where the lead was three points or fewer at any point in the final two minutes of the fourth quarter or overtime. Reports assess calls and material non-calls. FullCourt displays regular-season reports only.</Prose>
      <Prose>Reports became public on March 2, 2015, covering games played from March 1. The 2014–15 sample is a partial season. Before 2017–18, eligibility was based on a five-point margin at the two-minute mark; the NBA also revised which non-calls it grades. Those changes limit comparisons across eras.</Prose>
      <Prose>We check that every report in the NBA&apos;s regular-season archive or season index was collected. We do not independently check whether that index includes every eligible game.</Prose>
      <Prose><a className="underline" href="https://official.nba.com/nba-last-two-minute-reports-frequently-asked-questions/">NBA report criteria and definitions ↗</a></Prose>
    </Section>
    <Section label="COUNTS AND COMPARISONS" title="What the verdicts mean">
      <DataTable wrapperClassName="reference-definitions" rows={VERDICTS} rowKey={(row) => row.code} columns={[
        { label: "Code", cell: (row) => row.code },
        { label: "NBA verdict", cell: (row) => row.name },
        { label: "Meaning", cell: (row) => row.meaning },
      ]} />
      <Prose>Missed-call share = missed calls ÷ all identified errors. Errors per reviewed game = all identified errors ÷ reviewed games. Ungraded assessments remain available and are not counted as correct. Historical labels “Undetectable”, “NCI” and “NCC” are preserved separately and excluded from identified-error counts; we do not guess what NCI or NCC was intended to mean.</Prose>
      <details className="fc-disclosure"><summary>Limits of these comparisons</summary>
        <Prose>A game with no identified errors does not establish perfect officiating. Reviewed decisions may reflect replay or a successful challenge. The headline measures the mix of identified errors, not whistle accuracy.</Prose>
        <Prose>The season strip prints each value on a labeled 50–100% scale. Each season covers different games and may include different amounts of overtime. Comparisons cannot establish a change in referee intent, consistency or whole-game accuracy.</Prose>
      </details>
    </Section>
    <Section label="BROWSING AND SOURCES" title="Filters, quotations and source links" disclosure>
      <Prose>Team and call-type filters affect the game browser only. Chip counts describe league-wide identified errors for the selected season. A specific error category excludes clean games; a team-only filter retains them.</Prose>
      <Prose>Call categories preserve the NBA&apos;s distinctions, with whitespace normalized and a few labels shortened. Verdict quotations preserve the NBA&apos;s wording; HTML formatting is removed and character entities are decoded.</Prose>
      <Prose>Early reports are PDFs. Their extracted text retains the NBA’s wording, with line wrapping removed. Each normalized report records the original PDF URL and hash. PDF video links have not been independently resolved; the source PDF remains available.</Prose>
      <Prose>Crew names come from verified assignment joins in the research data. Missing assignments are labeled unavailable. A crew assignment does not identify which official was responsible for a call.</Prose>
      <Prose>Videos open on the NBA&apos;s own pages, which control playback and availability. Team helped/hurt rankings are withheld because source beneficiary summaries disagree with event totals and individual beneficiary fields are incomplete.</Prose>
    </Section>
    <Section label="FRESHNESS AND REVISIONS" title="Data dates and report revisions" disclosure>
      <DataTable wrapperClassName="reference-definitions" rows={[
        { label: "Data through", meaning: "The latest reviewed game date." },
        { label: "Last successful refresh", meaning: "When collection finished for the published snapshot." },
      ]} rowKey={(row) => row.label} columns={[
        { label: "Date shown", cell: (row) => row.label },
        { label: "Meaning", cell: (row) => row.meaning },
      ]} />
      <Prose>Daily collection prepares an update for review. The public snapshot changes after review and deployment. Failed or incomplete collection leaves it intact. Reports that disappear from the source index require review before publication can proceed.</Prose>
      <Prose>Raw snapshots and manifests accompany the refresh workflow artifacts. Each published report retains its source hash in its filename, so a revised report cannot silently replace the evidence for a previously loaded page.</Prose>
    </Section>
    <Section label="RESEARCH ARCHIVE" title="Earlier referee research" disclosure>
      <Prose>The foul-pattern table, timing comparisons and official-player studies use different samples from the seasonal L2M reports.</Prose>
      <Link className="reference-button" href="/behind-the-data/referees/archive">Open referee research archive →</Link>
    </Section>
  </BehindTheDataShell>;
}
