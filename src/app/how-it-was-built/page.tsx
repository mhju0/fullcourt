import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "How FullCourt was built",
  description: "From NBA schedules to inspectable findings: data pipelines, delivery choices, verification and limitations.",
};
const repo = "https://github.com/mhju0/fullcourt/blob/main";
const decisions = [
  {
    title: "Calculate schedule load before a visitor opens a page",
    problem: "A single game depends on both teams’ recent games, travel and rest. Repeating that work for every visitor would tie page delivery to historical calculations.",
    implementation: "The pipeline computes fatigue scores on the write path. Game pages read stored scores and attach the schedule facts needed to explain them.",
    tradeoff: "Reads stay simpler. A change to the calculation requires a deliberate data rebuild, and missing stored scores must remain visibly unavailable.",
    file: "src/lib/fatigue.ts", link: "Read the fatigue engine",
  },
  {
    title: "Choose delivery around how the data changes",
    problem: "A game slate, a historical player table and an NBA report do not need the same loading strategy.",
    implementation: "Database-backed views serve games and season comparisons. Shooting and other research views use generated artifacts. Officiating fetches each report’s detail when it is opened.",
    tradeoff: "Published research remains reproducible, with smaller initial report payloads. Refreshing it requires validation and deployment rather than an invisible live replacement.",
    file: "src/components/officiating-report.tsx", link: "Read report loading",
  },
  {
    title: "Make the evidence travel with the link",
    problem: "A shared finding is hard to inspect if its season, filters and selected game disappear when someone opens it.",
    implementation: "Selected views use URL state. Reports retain NBA source links and verdict text. Method articles preserve section anchors and open linked evidence.",
    tradeoff: "URLs require validation and reliable browser-history behavior. The payoff is a view that another person can inspect and revisit.",
    file: "e2e/officiating.spec.ts", link: "Read sharing and recovery tests",
  },
];
export default function HowItWasBuiltPage() {
  return <div className="flex flex-col gap-12">
    <PageHeader eyebrow="ENGINEERING WALKTHROUGH" title="How FullCourt was built" description="A public NBA research application by Michael Ju. Follow one finding from source data to a working interface." />
    <section className="build-section">
      <h2>The problem</h2>
      <p>“They looked tired” is easy to say after a loss. Checking that idea requires schedules, results and a fair comparison group. FullCourt brings those records together so a fan can inspect the conditions and see how much the historical pattern actually supports.</p>
      <p>This is a research application. Its comparisons do not isolate what rest caused, and its fatigue score is not a complete forecast of a winner.</p>
      <div className="flex flex-wrap gap-3"><Link className="build-action" href="/games">Inspect a game</Link><Link className="build-action" href="/about">About the project</Link><a className="build-action" href="https://github.com/mhju0/fullcourt">Source repository ↗</a></div>
    </section>
    <section className="build-section">
      <h2>How a record reaches the screen</h2>
      <ol className="build-flow">
        <li><strong>Collect</strong><span>NBA and other documented sources → Python and TypeScript pipelines</span></li>
        <li><strong>Calculate and validate</strong><span>PostgreSQL records, offline models and generated research artifacts</span></li>
        <li><strong>Inspect</strong><span>Next.js pages → filters, comparisons, source records and shareable views</span></li>
      </ol>
      <Link href="/behind-the-data/data-and-limits" className="method-link">Sources and coverage ↗</Link>
    </section>
    <section className="build-section">
      <h2>Three implementation decisions</h2>
      {decisions.map(d => <article className="build-decision" key={d.title}>
        <h3>{d.title}</h3><p>{d.problem}</p><p>{d.implementation}</p><p><strong>Tradeoff: </strong>{d.tradeoff}</p>
        <a href={`${repo}/${d.file}`} className="method-link">{d.link} ↗</a>
      </article>)}
    </section>
    <section className="build-section">
      <h2>What gets checked</h2>
      <p>Unit and Python contract tests check calculations and published artifacts. Browser tests exercise filters, keyboard behavior, deep links and failure recovery. CI runs lint, types, tests, the production build and a dependency audit.</p>
      <p>The browser suite runs separately against a populated environment. Passing automated tests is only part of verification: visible claims still need to match the source records.</p>
      <a className="method-link" href={`${repo}/docs/TESTING_AND_CICD.md`}>Verification workflow ↗</a>
    </section>
    <section className="build-section">
      <h2>A lesson from reviewing the product</h2>
      <p>A usability review found a schedule-density approximation presented as an exact game count, and altitude carryover described as a current location. These labels now distinguish the underlying facts. That review also found working mobile controls whose selected month was outside the visible area.</p>
      <p>The lesson is practical: a passing calculation test or accessibility scan cannot establish that a sentence is accurate or a control is easy to use. Check the complete path from record to interpretation.</p>
    </section>
    <section className="build-section">
      <h2>What remains uncertain</h2>
      <p>Historical comparisons include differences in team strength, venue and other conditions. Player rest splits can be noisy. NBA officiating reports cover selected late-game situations. FullCourt keeps those limits beside the findings and preserves tests that did not support a clear effect.</p>
      <p>The next product check is observation: can a first-time visitor find a game, interpret a comparison and locate its source without help?</p>
      <Link className="method-link" href="/behind-the-data">Read the evidence and limits ↗</Link>
    </section>
  </div>;
}
