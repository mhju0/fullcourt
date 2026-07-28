/**
 * Every page heading. Two pages used to hand-copy this markup — one because its
 * eyebrow has to sit inside a data-dependent branch, which is no reason to
 * duplicate a component, and one because it wants a narrower measure. That
 * measure is the single knob; everything else is fixed here so the type scale
 * cannot drift between pages again.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  descriptionMaxWidth = "42rem",
}: {
  eyebrow: string
  title: string
  description: React.ReactNode
  /** Line length for the description. Defaults to the `max-w-2xl` the pages share. */
  descriptionMaxWidth?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 600 }}
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
          maxWidth: descriptionMaxWidth,
          fontSize: 15,
          color: "var(--term-text-muted)",
          lineHeight: 1.55,
        }}
      >
        {description}
      </p>
    </div>
  )
}
