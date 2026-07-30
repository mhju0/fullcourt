import { termCardStyle } from "@/lib/terminal-styles";

/**
 * Shared building blocks for the reference pages, so six pages cannot drift into six
 * different typographic treatments of the same kinds of content.
 */

export function Section({
  label,
  descriptor,
  children,
}: {
  label: string;
  descriptor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={termCardStyle}>
      <div
        className="mono flex items-center gap-3 py-2"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
      >
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
        {descriptor && <span style={{ fontWeight: 600 }}>{descriptor}</span>}
      </div>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ maxWidth: "46rem", fontSize: 15, color: "var(--term-text)", lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

/** Secondary register — caveats, limits, and anything qualifying the claim above it. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ maxWidth: "46rem", fontSize: 14, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
      {children}
    </p>
  );
}

/** Monospace block — the actual arithmetic, not a paraphrase of it. */
export function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre
      className="mono overflow-x-auto"
      style={{
        background: "var(--term-surface-2)",
        border: "1px solid var(--term-border)",
        borderRadius: "var(--term-radius)",
        padding: "12px 14px",
        fontSize: 12,
        lineHeight: 1.7,
        color: "var(--term-text)",
      }}
    >
      {children}
    </pre>
  );
}

/** Dashed list for limits — what a model cannot see, stated plainly. */
export function LimitList({ items }: { items: readonly string[] }) {
  return (
    <ul
      className="flex flex-col gap-2"
      style={{ maxWidth: "46rem", fontSize: 15, color: "var(--term-text)", lineHeight: 1.55 }}
    >
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span className="mono" style={{ color: "var(--term-red)", flexShrink: 0 }}>
            —
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Term/value pairs — the "every value" part of the brief, in a scannable grid. */
export function ValueGrid({
  values,
}: {
  values: readonly { label: string; value: string; sub?: string }[];
}) {
  return (
    <div
      className="grid gap-px overflow-hidden"
      style={{
        background: "var(--term-border)",
        border: "1px solid var(--term-border)",
        borderRadius: "var(--term-radius)",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
      }}
    >
      {values.map((v) => (
        <div key={v.label} className="flex flex-col gap-[3px] bg-[var(--term-surface)] px-[13px] py-[11px]">
          <span
            className="mono"
            style={{ fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--term-text-muted)" }}
          >
            {v.label}
          </span>
          <span
            className="mono"
            style={{ fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--term-text)" }}
          >
            {v.value}
          </span>
          {v.sub && (
            <span className="mono" style={{ fontSize: 10.5, color: "var(--term-text-muted)" }}>
              {v.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
