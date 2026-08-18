import { formatDataAsOf, type DataAsOf } from "@/lib/data-as-of"
import { WIDTH } from "@/lib/terminal-styles"

/**
 * Every page heading. Two pages used to hand-copy this markup — one because its
 * eyebrow has to sit inside a data-dependent branch, which is no reason to
 * duplicate a component, and one because it wants a narrower measure.
 *
 * The measure used to be a prop. It is now fixed at the one prose width in
 * {@link WIDTH}: the only override left in the tree asked for 46rem, and 4rem of
 * extra line length is not worth every reference page introducing itself on a
 * different measure from every product page.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  asOf,
}: {
  eyebrow: string
  title: string
  description: React.ReactNode
  /**
   * Which games the figures under this heading were computed from (2026-08-18). Optional
   * because most surfaces have no such population: /games is a live board, and the
   * season-scoped surfaces answer for one season, not for the final-game population this
   * describes — a page that cannot make the claim truthfully passes nothing.
   */
  asOf?: DataAsOf | null
}) {
  const stamp = formatDataAsOf(asOf)

  return (
    <div className="flex flex-col gap-2">
      <span
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-accent)", fontWeight: 600 }}
      >
        {eyebrow}
      </span>
      {/* 32px is the "hero stat value" slot in terminal-styles.ts. At 24px a page title was
          the same size as the stat numbers under it. Weight and tracking come from the base
          h1 rule — an explicit font-bold here would override it and only on these pages. */}
      <h1 className="text-[32px] leading-[1.05] text-[var(--term-text)]">{title}</h1>
      {/* Sentence case in the body face, not uppercase mono: caps remove word-shape
          cues and slow reading for anything longer than a label. */}
      <p
        style={{
          maxWidth: WIDTH.prose,
          fontSize: 15,
          color: "var(--term-text-muted)",
          lineHeight: 1.55,
        }}
      >
        {description}
      </p>
      {/* Under the description, not beside the title: it qualifies the figures on the page
          rather than naming the page. Same mono/11px/muted treatment as the PROVISIONAL line
          on /schedule, which is the same claim about a narrower population. */}
      {stamp ? (
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
        >
          {stamp}
        </p>
      ) : null}
    </div>
  )
}
