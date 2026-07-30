import { termCardStyle } from "@/lib/terminal-styles";

/**
 * Shared building blocks for the reference pages, so six pages cannot drift into six
 * different typographic treatments of the same kinds of content.
 *
 * Colour is load-bearing here, not decoration (2026-07-30). The pages were near-uniform
 * black-on-white and read as one undifferentiated wall, so each register now carries its
 * own accent and each register means one thing:
 *
 *   red    — the section header rail, and the limits list. What the model cannot do.
 *   blue   — the arithmetic: formulas and measured values. What the model is.
 *   gold   — asides and caveats attached to a claim above them.
 *
 * The accents are hairline rails and 4–6% tints, never filled blocks: the body text stays
 * the highest-contrast thing on the page, which is the point of a reference.
 */

/** The tints. Kept as literals rather than tokens — they exist only in this file. */
const RED_TINT = "rgba(220, 38, 38, 0.04)";
const BLUE_TINT = "rgba(37, 99, 235, 0.045)";
const GOLD_TINT = "rgba(161, 98, 7, 0.07)";

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
    <div style={{ ...termCardStyle, padding: 0, overflow: "hidden" }}>
      {/* A tinted header band with a red rail down its left edge, rather than a label
          floating on the same white as the body. Each card now has a visible top edge, which
          is what makes a page of six of them scan as six things. */}
      <div
        className="mono flex items-center gap-3 px-4 py-2.5"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          background: "var(--term-surface-2)",
          borderBottom: "1px solid var(--term-border)",
          boxShadow: "inset 3px 0 0 var(--term-red)",
        }}
      >
        <span style={{ fontWeight: 700, color: "var(--term-text)" }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
        {descriptor && (
          <span
            style={{
              fontWeight: 700,
              color: "var(--term-red)",
              background: RED_TINT,
              border: "1px solid rgba(220, 38, 38, 0.18)",
              borderRadius: "var(--term-radius-sm)",
              padding: "2px 7px",
              whiteSpace: "nowrap",
            }}
          >
            {descriptor}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
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
    <p
      style={{
        maxWidth: "46rem",
        fontSize: 14,
        color: "var(--term-text-muted)",
        lineHeight: 1.55,
        background: GOLD_TINT,
        borderLeft: "2px solid rgba(161, 98, 7, 0.5)",
        borderRadius: "0 var(--term-radius) var(--term-radius) 0",
        padding: "10px 13px",
      }}
    >
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
        background: BLUE_TINT,
        border: "1px solid rgba(37, 99, 235, 0.16)",
        borderLeft: "2px solid var(--term-blue)",
        borderRadius: "0 var(--term-radius) var(--term-radius) 0",
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
      style={{
        maxWidth: "46rem",
        fontSize: 15,
        color: "var(--term-text)",
        lineHeight: 1.55,
        background: RED_TINT,
        borderLeft: "2px solid var(--term-red)",
        borderRadius: "0 var(--term-radius) var(--term-radius) 0",
        padding: "12px 14px",
      }}
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
        // The tint is layered over the surface rather than used alone: these cells sit on a
        // 1px grid whose gaps are painted by the parent's background, and a translucent cell
        // let that border colour through, turning the whole grid grey.
        <div
          key={v.label}
          className="flex flex-col gap-[3px] px-[13px] py-[11px]"
          style={{ background: `linear-gradient(${BLUE_TINT}, ${BLUE_TINT}), var(--term-surface)` }}
        >
          <span
            className="mono"
            style={{ fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--term-text-muted)" }}
          >
            {v.label}
          </span>
          {/* The measured numbers are the reason these pages exist, so they carry the data
              accent rather than sitting in the same near-black as the prose around them. */}
          <span
            className="mono"
            style={{ fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--term-blue)" }}
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
