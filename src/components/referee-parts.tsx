/**
 * Shared furniture for the Referee Effect surface.
 *
 * Extracted when the folklore sections were added, so the page's two content files set prose and
 * section rules from one place rather than each keeping its own copy — the drift this repo has
 * already paid for twice with tiles and tables.
 */
import { LEAD, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles"

/** Any sentence on this surface. One prose measure, muted, on the body leading. */
export const BODY: React.CSSProperties = {
  fontSize: TYPE.body,
  color: "var(--term-text-muted)",
  lineHeight: LEAD.body,
  maxWidth: WIDTH.prose,
}

/** The opening clause of a paragraph that states a result, lifted out of the muted body colour. */
export const LEAD_IN = { color: "var(--term-text)", fontWeight: 600 } as const

/** A section rule: the label, then a hairline filling the remaining width. */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono flex items-center gap-3 py-1"
      style={{ fontSize: TYPE.label, letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}
    >
      <span style={{ fontWeight: 700 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
    </div>
  )
}
