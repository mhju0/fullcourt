import { PlayoffGrindGap } from "@/components/playoff-grind-gap"
import { PLAYOFF_EQUAL_REST } from "@/lib/playoff-rest-facts"
import { LEAD, termCardStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles"
import { StatFigure } from "@/components/ui/stat-tile"

const BODY: React.CSSProperties = {
  fontSize: TYPE.body,
  color: "var(--term-text-muted)",
  lineHeight: LEAD.body,
  maxWidth: WIDTH.prose,
}
const LEAD_IN = { color: "var(--term-text)", fontWeight: 600 } as const

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono flex items-center gap-3 py-1" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}>
      <span style={{ fontWeight: 700 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
    </div>
  )
}

/**
 * Section A — the fact that justifies this page existing separately from /analysis.
 *
 * One number and one sentence. The claim is exact rather than rounded, which is why the facts
 * test asserts equality rather than a threshold.
 */
function NoRestSection() {
  const { laterGames, laterEqual, game1Games, game1Equal } = PLAYOFF_EQUAL_REST
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>THE POSTSEASON HAS NO REST</SectionHeading>
      {/* The figure and its explanation sit side by side rather than stacked.
          Stacked, the card ran the full 1040 column while its prose was capped at the 42rem
          measure, so the right ~336px of it was empty on every card — the number was the
          feature but got a third of the width, and the paragraph under it looked like it had
          been cut short. Side by side, the number keeps its own column and the prose keeps a
          readable line length, and the card is full because both columns are doing work.
          Stacks below `md`, where there is only room for one column anyway. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8" style={termCardStyle}>
        {/* 360px, not less: "2,545 of 2,545" is fourteen mono characters at 40px and wraps
            below this, which splits the one figure the section exists to state. */}
        <div className="shrink-0 md:basis-[360px]">
          <StatFigure
            value={`${laterEqual.toLocaleString()} of ${laterGames.toLocaleString()}`}
            tone="var(--term-text)"
            caption={
              <>
                PLAYOFF GAMES AFTER GAME 1
                <br />
                BOTH TEAMS ON THE SAME REST
              </>
            }
          />
        </div>
        <p className="m-0" style={BODY}>
          <span style={LEAD_IN}>Every single one.</span> Once a series starts the two teams share a
          schedule, so neither can be more rested. Playoff rest has exactly one place to exist:
          the wait before Game 1 — and only {game1Equal} of {game1Games} Game 1s were even.
        </p>
      </div>
    </section>
  )
}

/** Section B — the finding. The card carries it; the argument for it lives in Behind the Data. */
function GrindTaxSection() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>THE GRIND TAX</SectionHeading>
      <p style={BODY}>
        <span style={LEAD_IN}>Beating a team that just survived a long series is easier.</span> Going
        the distance to win one round leaves you worse off in the next.
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
