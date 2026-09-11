import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TransitionLink } from "@/components/transition-link";
import { ArrowRight } from "lucide-react";
import { StudyLink } from "@/components/study-link";
import { LEAD, TYPE } from "@/lib/terminal-styles";

export const metadata: Metadata = { title: "Explore" };

const STUDIES = [
  { href: "/home-court", title: "Home-court Advantage", question: "Are home teams winning less often?", action: "See the season history", category: "Rest and fatigue" },
  { href: "/shooting", title: "Shooting by Rest", question: "Do players shoot differently with more rest?", action: "Compare shooting splits", category: "Rest and fatigue" },
  { href: "/playoffs", title: "Playoff Rest", question: "How does prior-round workload relate to a series?", action: "Compare playoff workload", category: "Rest and fatigue" },
  { href: "/availability", title: "Availability Cost", question: "What do historical absences tell us?", action: "Examine availability", category: "Other studies" },
  { href: "/shot-quality", title: "Expected Shot Value", question: "How does expected efficiency vary around the court?", action: "View the shot map", category: "Other studies" },
  { href: "/officiating", title: "Officiating", question: "What did the NBA identify in close-game endings?", action: "Browse reviewed games", category: "Other studies" },
  { href: "/analysis", title: "Model Results", question: "How does the rest model compare with history?", action: "See historical results", category: "Rest and fatigue" },
];

const RESEARCH = [
    { href: "/behind-the-data", title: "Behind the Data", question: "Sources, calculations and limitations." },
    { href: "/behind-the-data/referees/archive", title: "Referee research archive", question: "Historical foul patterns and folklore comparisons." },
];

export default function ExplorePage() {
  return <div className="flex flex-col gap-12">
    <PageHeader eyebrow="FINDINGS & EVIDENCE" title="Explore" description="Pick a basketball question. Compare players, inspect games, or follow a finding back to its evidence." />
    <ul aria-label="Basketball studies" className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2">
      {STUDIES.map((link) => (
        <li key={link.href}><StudyLink {...link} /></li>
      ))}
    </ul>
    <section className="flex flex-col gap-3 border-t border-[var(--term-border)] pt-6">
      <h2 style={{ fontSize: TYPE.body }}>Research &amp; sources</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RESEARCH.map((link) => <li key={link.href}>
          <TransitionLink href={link.href} className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-[var(--term-neutral)] bg-[var(--term-surface)] px-4 py-3 hover:border-[var(--term-accent)] active:bg-[var(--term-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--term-accent)]">
            <span><span className="font-semibold" style={{ fontSize: TYPE.body }}>{link.title}</span>
              <span className="mt-1 block" style={{ fontSize: TYPE.body, lineHeight: LEAD.body, color: "var(--term-text-muted)" }}>{link.question}</span>
            </span>
            <ArrowRight className="shrink-0" size={18} aria-hidden="true" />
          </TransitionLink>
        </li>)}
      </ul>
    </section>
  </div>;
}
