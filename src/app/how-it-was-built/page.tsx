import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ReadingRail } from "@/components/reading-rail";
import styles from "@/components/reading.module.css";

export const metadata: Metadata = {
  title: "How FullCourt was built",
  description: "From NBA schedules to inspectable findings: data pipelines, delivery choices, verification and limitations.",
};
const repo = "https://github.com/mhju0/fullcourt/blob/main";

const SECTIONS: { id: string; label: string; title?: string }[] = [
  { id: "problem", label: "The problem" },
  { id: "data-flow", label: "How a record reaches the screen" },
  { id: "decisions", label: "Three implementation decisions" },
  { id: "checks", label: "What gets checked" },
  { id: "lesson", label: "A lesson from review", title: "A lesson from reviewing the product" },
  { id: "limits", label: "What remains uncertain" },
];

const flow = [
  { title: "Collect", text: "NBA and other documented sources feed Python and TypeScript pipelines." },
  { title: "Calculate and validate", text: "PostgreSQL records, offline models and generated research artifacts." },
  { title: "Inspect", text: "Next.js pages with filters, comparisons, source records and shareable views." },
];

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

const checks = [
  { title: "Calculations and artifacts", text: "Unit and Python contract tests check calculations and published artifacts." },
  { title: "Browser behavior", text: "Browser tests exercise filters, keyboard behavior, deep links and failure recovery. The suite runs separately against a populated environment." },
  { title: "Every change", text: "CI runs lint, types, tests, the production build and a dependency audit." },
];

const findings = [
  { found: "A schedule-density approximation", detail: "It was presented as an exact game count. The label now distinguishes the underlying facts." },
  { found: "Altitude carryover", detail: "It was described as a current location. The label now distinguishes the underlying facts." },
  { found: "Mobile month controls", detail: "The controls worked, but the selected month was outside the visible area." },
];

const limits = [
  { subject: "Historical comparisons", limit: "They include differences in team strength, venue and other conditions." },
  { subject: "Player rest splits", limit: "They can be noisy." },
  { subject: "NBA officiating reports", limit: "They cover selected late-game situations." },
];

function Chapter({ index, children }: { index: number; children: ReactNode }) {
  const { id, label, title } = SECTIONS[index];
  return <section id={id} className={styles.chapter} aria-labelledby={`${id}-title`}>
    <div className={styles.heading}>
      <span className={`mono ${styles.number}`} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <h2 id={`${id}-title`}>{title ?? label}</h2>
    </div>
    {children}
  </section>;
}

export default function HowItWasBuiltPage() {
  return <div className="flex flex-col gap-12">
    <PageHeader eyebrow="ENGINEERING WALKTHROUGH" title="How FullCourt was built" description="A public NBA research application by Michael Ju. Follow one finding from source data to a working interface." />
    <div className={`${styles.layout} ${styles.withRail}`}>
      <ReadingRail sections={SECTIONS} />
      <div className={styles.chapters}>
        <Chapter index={0}>
          <p className={styles.lead}>“They looked tired” is easy to say after a loss. Checking that idea requires schedules, results and a fair comparison group.</p>
          <p className={styles.text}>FullCourt brings those records together so a fan can inspect the conditions and see how much the historical pattern actually supports.</p>
          <p className={styles.note}><strong className="mono">Scope</strong>This is a research application. Its comparisons do not isolate what rest caused, and its fatigue score is not a complete forecast of a winner.</p>
          <div className={styles.actions}><Link className="build-action" href="/games">Inspect a game</Link><Link className="build-action" href="/about">About the project</Link><a className="build-action" href="https://github.com/mhju0/fullcourt">Source repository ↗</a></div>
        </Chapter>
        <Chapter index={1}>
          <ol className={styles.grid3}>
            {flow.map((step, index) => <li key={step.title} className={`${styles.card} ${styles.step}`}>
              <span className={`mono ${styles.chip}`} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div><h3>{step.title}</h3><p>{step.text}</p></div>
            </li>)}
          </ol>
          <Link href="/behind-the-data/data-and-limits" className={styles.link}>Sources and coverage →</Link>
        </Chapter>
        <Chapter index={2}>
          {decisions.map((d, index) => <article className={`${styles.card} ${styles.decision}`} key={d.title}>
            <div className={styles.decisionHead}>
              <span className={`mono ${styles.chip}`} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3>{d.title}</h3>
            </div>
            <dl className={styles.parts}>
              <dt className="mono">Problem</dt><dd>{d.problem}</dd>
              <dt className="mono">Built</dt><dd>{d.implementation}</dd>
              <dt className="mono">Tradeoff</dt><dd>{d.tradeoff}</dd>
            </dl>
            <a href={`${repo}/${d.file}`} className={styles.file}>{d.link} <code className="mono">{d.file} ↗</code></a>
          </article>)}
        </Chapter>
        <Chapter index={3}>
          <ul className={styles.grid3}>
            {checks.map((check) => <li key={check.title} className={styles.card}><h3>{check.title}</h3><p>{check.text}</p></li>)}
          </ul>
          <p className={styles.note}><strong className="mono">Not enough alone</strong>Passing automated tests is only part of verification: visible claims still need to match the source records.</p>
          <a className={styles.link} href={`${repo}/docs/TESTING_AND_CICD.md`}>Verification workflow ↗</a>
        </Chapter>
        <Chapter index={4}>
          <p className={styles.text}>A usability review found three problems.</p>
          <ul className={styles.rows}>
            {findings.map((item) => <li key={item.found}><strong>{item.found}</strong><span>{item.detail}</span></li>)}
          </ul>
          <p className={styles.lead}>A passing calculation test or accessibility scan cannot establish that a sentence is accurate or a control is easy to use. Check the complete path from record to interpretation.</p>
        </Chapter>
        <Chapter index={5}>
          <ul className={styles.rows}>
            {limits.map((item) => <li key={item.subject}><strong>{item.subject}</strong><span>{item.limit}</span></li>)}
          </ul>
          <p className={styles.text}>FullCourt keeps those limits beside the findings and preserves tests that did not support a clear effect.</p>
          <p className={styles.note}><strong className="mono">Next check</strong>Observation: can a first-time visitor find a game, interpret a comparison and locate its source without help?</p>
          <Link className={styles.link} href="/behind-the-data">Read the evidence and limits →</Link>
        </Chapter>
      </div>
    </div>
  </div>;
}
