import { TransitionLink } from "@/components/transition-link";
import { wordmarkLetters } from "@/lib/brand/wordmark-kern";
import { NBA_SEASONS } from "@/lib/nba-season";
import { LEAD, TYPE, WIDTH } from "@/lib/terminal-styles";

const NAME_READINGS = [
  { term: "Full", copy: `Regular-season results since ${NBA_SEASONS[0]}, with comparison groups and sample sizes.` },
  { term: "Court", copy: "Home court provides the baseline for reading a rest advantage. It accounts for much of the raw win rate." },
  { term: "Full-court", copy: "The basketball name connects the schedule analysis with shooting, playoff, and officiating studies." },
];

export function AboutContent() {
  return <div className="flex flex-col gap-12" style={{ maxWidth: WIDTH.prose, fontSize: TYPE.body, lineHeight: LEAD.body }}>
    <section>
      <h2 aria-label="What FullCourt means" style={{ fontSize: TYPE.title, marginBottom: 24 }}>
        <span aria-hidden="true">{wordmarkLetters().map((letter, i) => <span key={i} style={{ color: letter.accent ? "var(--term-accent)" : undefined, marginLeft: `${letter.kernEm}em` }}>{letter.char}</span>)}</span>
      </h2>
      <dl className="flex flex-col gap-4">
        {NAME_READINGS.map((part) => <div key={part.term} className="grid gap-2 border-t border-[var(--term-border)] pt-4 sm:grid-cols-[8rem_1fr]">
          <dt className="font-semibold">{part.term}</dt><dd style={{ color: "var(--term-text-dim)" }}>{part.copy}</dd>
        </div>)}
      </dl>
    </section>
    <section className="flex flex-col gap-4">
      <h2 style={{ fontSize: TYPE.stat }}>What the project measures</h2>
      <p>Rest, travel and schedule density are FullCourt&apos;s central questions. Compare how teams arrive at a game, then check the results against their venue baselines.</p>
      <p>The fatigue score summarizes recent workload, travel, time zones, back-to-backs, altitude and schedule density. Its weights are estimates; a relationship in historical results does not establish a causal effect.</p>
      <TransitionLink href="/behind-the-data" className="inline-flex min-h-11 items-center underline underline-offset-4">Read the sources and calculations</TransitionLink>
    </section>
    <section className="flex flex-col gap-4">
      <h2 style={{ fontSize: TYPE.stat }}>How to read a finding</h2>
      <p>Look for the comparison group and sample size beside each result. Games and Model Results use the same fatigue calculation. Limitations and null results remain available with the analysis.</p>
      <TransitionLink href="/" className="inline-flex min-h-11 items-center underline underline-offset-4">Back to the rest and schedule findings</TransitionLink>
    </section>
  </div>;
}
