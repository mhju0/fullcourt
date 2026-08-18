import { LEAD, SPACE, termCardStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles";
import { DataTable } from "@/components/ui/data-table";
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
        style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
      >
        The market check — season win totals
      </p>

      <p style={{ marginTop: SPACE.sm, maxWidth: WIDTH.prose, fontSize: TYPE.body, color: "var(--term-text)", lineHeight: LEAD.body }}>
        If a schedule edge compounded over a season, the teams at the top of this page should
        beat their preseason win-total lines. Across {benchmark.seasonsCovered}{" "}
        seasons of archived lines, they don&rsquo;t:
      </p>

      <DataTable
        wrapperClassName="mt-3 overflow-x-auto"
        width="numeric"
        minWidth={360}
        rows={benchmark.buckets}
        rowKey={(b) => b.label}
        columns={[
          { label: "Net edge games", cell: (b) => b.label },
          {
            label: "Went over",
            unit: "percent of the bucket",
            numeric: true,
            style: { fontWeight: 700 },
            cell: (b) => pct(b.overs, b.n),
          },
          {
            label: "Team-seasons",
            numeric: true,
            style: { color: "var(--term-text-muted)" },
            cell: (b) => b.n,
          },
        ]}
      />

      <p style={{ marginTop: SPACE.md, maxWidth: WIDTH.prose, fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body }}>
        No gradient, in either direction. The correlation between a team&rsquo;s net edge games
        and its finish against the line is r&nbsp;=&nbsp;{benchmark.correlation.r.toFixed(2)}{" "}
        across {benchmark.correlation.n}{" "}
        team-seasons — statistically zero. The rest edge is real
        game to game, and that record lives on the Model Results page. But over a full season it
        amounts to a few possessions here and there, and the market&rsquo;s win totals already
        price the schedule. This is a null result, published on purpose: season over/unders are
        not beatable from this page, and this site won&rsquo;t pretend otherwise.
      </p>

      <p style={{ marginTop: SPACE.md, maxWidth: WIDTH.prose, fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body }}>
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
