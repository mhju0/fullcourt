import { LEAD, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles";

const RED_TINT = "rgba(220, 38, 38, 0.04)";
const BLUE_TINT = "rgba(37, 99, 235, 0.045)";
const GOLD_TINT = "rgba(161, 98, 7, 0.07)";

export function Section({
  label,
  title,
  disclosure = false,
  descriptor,
  children,
}: {
  label: string;
  title?: string;
  disclosure?: boolean;
  descriptor?: string;
  children: React.ReactNode;
}) {
  const heading = <><h2>{title ?? label}</h2>{descriptor && <span className="reference-descriptor">{descriptor}</span>}</>;
  return <section id={sectionId(label)} className="reference-section" style={{ scrollMarginTop: 80 }}>
    {disclosure ? <details><summary>{heading}</summary><div className="reference-section-body">{children}</div></details>
      : <><header>{heading}</header><div className="reference-section-body">{children}</div></>}
  </section>;
}

export function sectionId(label: string) {
  // Labels remain stable URL anchors when the visible title changes.
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ maxWidth: WIDTH.prose, fontSize: TYPE.body, color: "var(--term-text)", lineHeight: LEAD.body }}>
      {children}
    </p>
  );
}

/** Secondary register — caveats, limits, and anything qualifying the claim above it. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        maxWidth: WIDTH.prose,
        fontSize: TYPE.body,
        color: "var(--term-text-muted)",
        lineHeight: LEAD.body,
        background: GOLD_TINT,
        borderLeft: "2px solid rgba(161, 98, 7, 0.5)",
        borderRadius: "0 var(--term-radius) var(--term-radius) 0",
        padding: 12,
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
      // Focusable for the same reason the table scroll wrapper is (see data-table.tsx): a
      // formula wider than a phone scrolls sideways, and without a tab stop the right-hand half
      // of the arithmetic is unreachable from a keyboard. Eight of the nine method pages tripped
      // axe's `scrollable-region-focusable` on this one element at 390px (audit, 2026-09-01).
      tabIndex={0}
      className="mono overflow-x-auto"
      style={{
        background: BLUE_TINT,
        border: "1px solid rgba(37, 99, 235, 0.16)",
        borderLeft: "2px solid var(--term-blue)",
        borderRadius: "0 var(--term-radius) var(--term-radius) 0",
        padding: "12px 16px",
        fontSize: 12,
        lineHeight: LEAD.body,
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
        maxWidth: WIDTH.prose,
        fontSize: TYPE.body,
        color: "var(--term-text)",
        lineHeight: LEAD.body,
        background: RED_TINT,
        borderLeft: "2px solid var(--term-red)",
        borderRadius: "0 var(--term-radius) var(--term-radius) 0",
        padding: "12px 16px",
      }}
    >
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mono" style={{ color: "var(--term-red-text)", flexShrink: 0 }}>
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
          className="flex flex-col gap-1 px-3 py-3"
          style={{ background: `linear-gradient(${BLUE_TINT}, ${BLUE_TINT}), var(--term-surface)` }}
        >
          <span
            className="mono"
            style={{ fontSize: 10, letterSpacing: TRACK.label, textTransform: "uppercase", color: "var(--term-text-muted)" }}
          >
            {v.label}
          </span>
          {/* The measured numbers are the reason these pages exist, so they carry the data
              accent rather than sitting in the same near-black as the prose around them. */}
          <span
            className="mono"
            style={{ fontSize: TYPE.emph, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--term-blue-text)" }}
          >
            {v.value}
          </span>
          {v.sub && (
            <span className="mono" style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)" }}>
              {v.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
