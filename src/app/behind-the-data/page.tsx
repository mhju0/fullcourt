import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StudyLink } from "@/components/study-link";
import "@/components/reference.css";

export const metadata: Metadata = {
  title: "Behind the Data",
  description: "How FullCourt's findings are calculated, where the data comes from, and what each analysis can tell you.",
};

const METHODS = [
  { href: "/behind-the-data/rest-advantage", title: "Rest Advantage", category: "Rest and fatigue", question: "What goes into the fatigue score?", action: "Read rest methods" },
  { href: "/behind-the-data/schedule-edge", title: "Schedule Edge", category: "Rest and fatigue", question: "How are favorable schedules compared?", action: "Read schedule methods" },
  { href: "/behind-the-data/playoff-predictions", title: "Playoff Rest", category: "Rest and fatigue", question: "How does prior-round workload enter the model?", action: "Read playoff methods" },
  { href: "/behind-the-data/player-shooting", title: "Shooting by Rest", category: "Rest and fatigue", question: "How are rest splits and uncertainty measured?", action: "Read shooting methods" },
  { href: "/behind-the-data/availability", title: "Availability Cost", category: "Other studies", question: "How is a missing player's contribution estimated?", action: "Read availability methods" },
  { href: "/behind-the-data/shot-value", title: "Expected Shot Value", category: "Other studies", question: "What is a shot from each location worth?", action: "Read shot-value methods" },
  { href: "/behind-the-data/officiating", title: "Officiating", category: "Other studies", question: "What counts as an error in the NBA's reports?", action: "Read officiating methods" },
];

const NULL_RESULTS = [
  { title: "Season win totals", href: "/behind-the-data/schedule-edge#the-market-check", finding: "Favorable schedules did not consistently predict beating preseason win-total lines in the archived sample." },
  { title: "Time zones", href: "/behind-the-data/time-zones", finding: "Travel direction on short rest added no predictive value after accounting for team strength and other schedule factors." },
  { title: "Referee folklore", href: "/behind-the-data/referees", finding: "The tested pair records and home-favoring patterns did not exceed their chance comparisons. Foul volume did differ across officials' games." },
  { title: "Playoff winner selection", href: "/behind-the-data/playoff-predictions#what-the-model-actually-wins-at", finding: "Winner accuracy was close to always picking the home-court team. Probability estimates improved." },
];

export default function BehindTheDataPage() {
  return <div className="reference-page flex flex-col gap-12">
    <PageHeader eyebrow="BEHIND THE DATA" title="Behind the Data" description="See how each finding is calculated, where the data comes from, and what it can tell you." />
    <nav aria-label="Reference sections" id="sections">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">{METHODS.map((item) => <li key={item.href}><StudyLink {...item} compact /></li>)}</ul>
    </nav>
    <section id="how-to-read-any-number-here" className="flex flex-col gap-4">
      <p className="reference-limit">Read percentages with their sample sizes and comparison baseline. Muted differences have not cleared the stated uncertainty threshold. Each method explains its evaluation and limitations.</p>
      <Link className="reference-button justify-between" href="/behind-the-data/data-and-limits">Data sources and season coverage <span aria-hidden="true">→</span></Link>
    </section>
    <section id="tests-without-a-confirmed-effect" className="flex flex-col gap-4">
      <h2 className="text-[24px]">What the tests did not establish</h2>
      <p className="reference-limit">These findings have limits too. A test that finds no clear effect does not prove the effect is exactly zero.</p>
      <div data-testid="null-results" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {NULL_RESULTS.map((item) => <Link className="reference-finding reference-button flex-col gap-2" key={item.href} href={item.href}><span className="font-semibold">{item.title} <span aria-hidden="true">→</span></span><span className="text-[var(--term-text-muted)]">{item.finding}</span></Link>)}
      </div>
    </section>
    <nav className="reference-related" aria-label="Research archive">
      <Link href="/behind-the-data/referees/archive">Referee research archive →</Link>
      <Link href="/behind-the-data/referees">Archived referee methods →</Link>
    </nav>
  </div>;
}
