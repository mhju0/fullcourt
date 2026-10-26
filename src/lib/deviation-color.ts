/**
 * Green above the baseline, red below — the shared better/worse pair (D-140), with
 * a neutral midpoint. A rate exactly at the baseline is a real result, not missing data.
 *
 * Kept outside `analysis-content.tsx` so server-rendered method pages can colour a gap the
 * same way Model Results does (D-144); a client module's exports cannot be called on the server.
 */
export function deviationFill(deviation: number): string {
  if (deviation === 0) return "var(--term-neutral)"
  return deviation < 0 ? "var(--term-worse)" : "var(--term-better)"
}

/** The same pair at text grade — tooltip prose is small text and needs 4.5:1, chart fills do not. */
export function deviationText(deviation: number): string {
  if (deviation === 0) return "var(--term-neutral)"
  return deviation < 0 ? "var(--term-worse-text)" : "var(--term-better-text)"
}
