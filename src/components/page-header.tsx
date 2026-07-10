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
        style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}
      >
        {eyebrow}
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mono max-w-2xl" style={{ fontSize: 11, color: "var(--term-text-muted)", lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  )
}
