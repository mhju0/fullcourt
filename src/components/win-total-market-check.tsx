import { LEAD, SPACE, termCardStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles";
import benchmark from "@/data/win-total-benchmark.json";

/**
 * The market check's sentry on /schedule. The full evidence — the bucket table and the
 * archive's method prose — lives on /behind-the-data/schedule-edge since 2026-08-24 (ADR
 * 0009): a schedule-edge leaderboard invites exactly one misuse, betting season over/unders,
 * so the claim that closes that door stays where the temptation arises while the table lives
 * with the rest of the method. Both render from the same committed benchmark JSON, so the two
 * surfaces cannot drift apart.
 */
export function WinTotalGuardrail() {
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
        seasons of archived lines, they don&rsquo;t: the correlation between net edge games and
        a team&rsquo;s finish against the line is r&nbsp;=&nbsp;
        {benchmark.correlation.r.toFixed(2)} across {benchmark.correlation.n}{" "}
        team-seasons — statistically zero. A null result, published on purpose: season
        over/unders are not beatable from this page, and this site won&rsquo;t pretend
        otherwise.
      </p>

      <a
        data-testid="market-check-crosslink"
        href="/behind-the-data/schedule-edge"
        className="mono mt-4 block w-fit"
        style={{ fontSize: 12, letterSpacing: TRACK.sub, fontWeight: 700, color: "var(--term-blue)" }}
      >
        THE FULL MARKET CHECK, BEHIND THE DATA &rarr;
      </a>
    </div>
  );
}
