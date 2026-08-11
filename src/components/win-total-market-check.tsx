import { termCardStyle, termTdStyle, termThStyle, termThUnitStyle } from "@/lib/terminal-styles";
import benchmark from "@/data/win-total-benchmark.json";

/** Percent with one decimal from an over count — 47.9% styling, tabular in the table. */
function pct(overs: number, n: number): string {
  return `${((overs / n) * 100).toFixed(1)}%`;
}

/**
 * The market check: does net edge games predict season win-total over/unders? No — and the
 * section exists to say so. A null result published on purpose is the difference between an
 * analytics site and a tout page, so this renders static, pre-computed history (see
 * scripts/fetch_win_totals.ts) rather than anything live or season-scoped.
 */
export function WinTotalMarketCheck() {
  return (
    <div style={termCardStyle}>
      <p
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
      >
        The market check — season win totals
      </p>

      <p style={{ marginTop: 8, maxWidth: "44rem", fontSize: 15, color: "var(--term-text)", lineHeight: 1.55 }}>
        If a schedule edge compounded over a season, the teams at the top of this page should
        beat their preseason win-total lines. Across {benchmark.seasonsCovered}{" "}
        seasons of archived lines, they don&rsquo;t:
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="fc-table" style={{ borderCollapse: "collapse", minWidth: 360 }}>
          <thead>
            <tr>
              <th style={{ ...termThStyle, textAlign: "left" }}>Net edge games</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>
                Went over
                <span style={termThUnitStyle}>percent of the bucket</span>
              </th>
              <th style={{ ...termThStyle, textAlign: "right" }}>Team-seasons</th>
            </tr>
          </thead>
          <tbody>
            {benchmark.buckets.map((b) => (
              <tr key={b.label}>
                <td className="mono" style={termTdStyle}>{b.label}</td>
                <td
                  className="mono"
                  style={{ ...termTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
                >
                  {pct(b.overs, b.n)}
                </td>
                <td
                  className="mono"
                  style={{ ...termTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--term-text-muted)" }}
                >
                  {b.n}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, maxWidth: "44rem", fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
        No gradient, in either direction. The correlation between a team&rsquo;s net edge games
        and its finish against the line is r&nbsp;=&nbsp;{benchmark.correlation.r.toFixed(2)}{" "}
        across {benchmark.correlation.n}{" "}
        team-seasons — statistically zero. The rest edge is real
        game to game, and that record lives on the Model Results page. But over a full season it
        amounts to a few possessions here and there, and the market&rsquo;s win totals already
        price the schedule. This is a null result, published on purpose: season over/unders are
        not beatable from this page, and this site won&rsquo;t pretend otherwise.
      </p>

      <p style={{ marginTop: 10, maxWidth: "44rem", fontSize: 12.5, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
        Lines from the {benchmark.source}, {benchmark.firstSeason} through {benchmark.lastSeason}.
        No lines were published for the 1998-99 lockout, and 2019-20 is skipped here
        because its season was suspended at 63 to 67 games — a preseason win total never got a
        full schedule to resolve against. {benchmark.pushes} pushes are excluded from the rates; overs hit{" "}
        {pct(benchmark.overall.overs, benchmark.overall.n)} overall — win totals lean under
        league-wide, edge or no edge. The archive&rsquo;s win count matched this site&rsquo;s own
        game records for every one of the {benchmark.teamSeasons} team-seasons before anything
        was computed.
      </p>
    </div>
  );
}
