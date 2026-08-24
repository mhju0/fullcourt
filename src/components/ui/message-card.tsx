import { termCardStyle, TRACK } from "@/lib/terminal-styles"

/**
 * The card a surface shows instead of its data: a failure, or an empty result worth explaining.
 *
 * Every content module used to decide this for itself, and they disagreed — five visual shapes
 * across eight sites, one discarding the error message entirely, and `role="alert"` on two of
 * them. This was already the right answer; it just lived inside shot-quality-content.
 *
 * `role="alert"` on the error tone is the point of having one of these: a failure a sighted
 * reader sees replace the page was previously silent to a screen reader on six of eight
 * surfaces. An empty result is not an alert — nothing went wrong — so the muted tone stays
 * quiet.
 *
 * Not for: the dashed in-place empties (`termDashedEmptyStyle`), which are deliberately quieter
 * than a card and often sit inside one; the table-row states in the Explore Games `<tbody>`,
 * which need a `<td colSpan>`; or any skeleton, each of which mirrors its own module's shape.
 */
export function MessageCard({
  tone,
  title,
  body,
}: {
  tone: "muted" | "error"
  title: string
  body?: string
}) {
  const accent = tone === "error" ? "var(--term-red-text)" : "var(--term-text-muted)"
  return (
    <div
      className="mono px-6 py-12 text-center"
      style={{ ...termCardStyle, borderLeft: `2px solid ${accent}` }}
      role={tone === "error" ? "alert" : undefined}
    >
      <p style={{ fontSize: 12, letterSpacing: TRACK.label, color: accent, fontWeight: 700 }}>
        {title}
      </p>
      {body ? (
        <p className="mt-1" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {body}
        </p>
      ) : null}
    </div>
  )
}
