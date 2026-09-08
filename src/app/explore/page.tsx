import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TransitionLink } from "@/components/transition-link";
import { LEAD, TYPE, WIDTH } from "@/lib/terminal-styles";

export const metadata: Metadata = { title: "Explore" };

const GROUPS = [
  { title: "Rest and fatigue", links: [
    { href: "/shooting", title: "Player Shooting", question: "Do players shoot differently with more rest?" },
    { href: "/playoffs", title: "Playoff Rest", question: "How does prior-round workload relate to a series?" },
    { href: "/analysis", title: "Model Results", question: "How does the rest model compare with history?" },
  ] },
  { title: "Other studies", links: [
    { href: "/availability", title: "Availability Cost", question: "What do historical absences tell us?" },
    { href: "/officiating", title: "Officiating", question: "What did the NBA identify in close-game endings?" },
    { href: "/shot-quality", title: "Shot Value", question: "How does expected efficiency vary around the court?" },
  ] },
  { title: "Research", links: [
    { href: "/behind-the-data", title: "Behind the Data", question: "Sources, calculations and limitations." },
    { href: "/behind-the-data/referees/archive", title: "Referee research archive", question: "Historical foul patterns and folklore comparisons." },
  ] },
];

export default function ExplorePage() {
  return <div className="flex flex-col gap-12">
    <PageHeader eyebrow="FINDINGS & EVIDENCE" title="Explore" description="Browse shooting by rest, playoff workload and other basketball studies. Each page links to the sources, calculations and limitations behind its findings." />
    {GROUPS.map((group) => <section key={group.title} className="flex flex-col gap-4" style={{ maxWidth: WIDTH.prose }}>
      <h2 style={{ fontSize: TYPE.stat }}>{group.title}</h2>
      <ul>{group.links.map((link) => <li key={link.href} className="border-t border-[var(--term-border)]">
        <TransitionLink href={link.href} className="group flex min-h-11 flex-col gap-1 py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--term-text)]">
          <span className="font-semibold group-hover:underline" style={{ fontSize: TYPE.emph }}>{link.title}</span>
          <span style={{ fontSize: TYPE.body, lineHeight: LEAD.body, color: "var(--term-text-muted)" }}>{link.question}</span>
        </TransitionLink>
      </li>)}</ul>
    </section>)}
  </div>;
}
