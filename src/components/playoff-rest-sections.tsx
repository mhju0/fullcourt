import { PlayoffGrindGap } from "@/components/playoff-grind-gap"
import { LEAD, TYPE, WIDTH } from "@/lib/terminal-styles"

const BODY: React.CSSProperties = {
  fontSize: TYPE.body,
  color: "var(--term-text-muted)",
  lineHeight: LEAD.body,
  maxWidth: WIDTH.prose,
}
const LEAD_IN = { color: "var(--term-text)", fontWeight: 600 } as const

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1" style={{ fontSize: 18, color: "var(--term-text)" }}>
      <span style={{ fontWeight: 700 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
    </div>
  )
}

function NoRestSection() {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>An early finish can mean more days off</SectionHeading>
      <p style={BODY}>
        A team that finishes its series early can get more days off before the next round.
        Once two teams start playing each other, they have the same days between games.
        Their minutes played, travel and recovery can still differ.
      </p>
    </section>
  )
}

/** Section B — the finding. The card carries it; the argument for it lives in Behind the Data. */
function GrindTaxSection() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Does the opponent’s prior round matter?</SectionHeading>
      <p style={BODY}>
        <span style={LEAD_IN}>Teams won more often against opponents coming off a long series.</span>{" "}
        The comparison below is historical; it does not separate fatigue from team quality.
      </p>
      <PlayoffGrindGap />
    </section>
  )
}

/**
 * Sections A-B: the finding, stated in two cards. A server component with no props and no data
 * fetching — every figure is a published constant, so none of this needs to reach the client.
 *
 * Trimmed to these two on 2026-08-01. The confound test, the layoff-bucket corroboration and the
 * model's round split were four screens of prose above the bracket; they now live in full at
 * /behind-the-data/playoff-predictions, which is where a reader who wants the argument goes.
 *
 * Kept as a sibling of the bracket rather than wrapping it, so reordering the page to put the
 * bracket first is a swap of two elements in `page.tsx` and nothing else.
 */
export function PlayoffRestArgument() {
  return (
    <div className="flex flex-col gap-12" style={{ maxWidth: WIDTH.wide }}>
      <NoRestSection />
      <GrindTaxSection />
    </div>
  )
}
