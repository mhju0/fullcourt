export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}
      >
        {eyebrow}
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--term-text)]">{title}</h1>
      {/* Sentence case in the body face, not uppercase mono: caps remove word-shape
          cues and slow reading for anything longer than a label. */}
      <p className="max-w-2xl" style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
        {description}
      </p>
    </div>
  )
}
