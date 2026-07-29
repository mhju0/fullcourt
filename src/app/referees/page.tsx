import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { termCardStyle, termTdStyle, termThStyle } from "@/lib/terminal-styles";
import whistle from "@/data/referee-whistle.json";

export const metadata: Metadata = {
  title: "Referee Effect",
};

/**
 * Officials below this many games are left out of the table: at small samples the
 * per-referee numbers are pure noise, and a table of noise invites reading names into it.
 */
const MIN_GAMES_SHOWN = 300;

/** |z| beyond this renders at full strength; inside it, muted — indistinguishable from chance. */
const NOISE_Z = 2;

function StatCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-[3px] bg-[var(--term-surface)] px-[13px] py-[11px]">
      <span
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--term-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{ fontSize: 21, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--term-text)" }}
      >
        {value}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--term-text-muted)" }}>
        {sub}
      </span>
    </div>
  );
}

/** Full-strength when the deviation clears the noise bar, muted otherwise. */
function zStyle(z: number): React.CSSProperties {
  return Math.abs(z) >= NOISE_Z
    ? { color: "var(--term-text)", fontWeight: 700 }
    : { color: "var(--term-text-muted)" };
}

const signed = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2).replace("-", "−"));

export default function RefereesPage() {
  const shown = whistle.officials.filter((o) => o.games >= MIN_GAMES_SHOWN);
  const excluded = whistle.officials.length - shown.length;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="REFEREE EFFECT · THE HOME WHISTLE"
        title="Referee Effect"
        description="Free-throw attempts by referee assignment, scored against the league baseline the same way everything else on this site is scored: with sample sizes, and with noise called noise. Whistles belong to three-person crews, so nothing here attributes a call to an individual — each game counts once for each official who worked it."
      />

      <div
        className="grid gap-px overflow-hidden"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          background: "var(--term-border)",
          border: "1px solid var(--term-border)",
          borderRadius: "var(--term-radius)",
        }}
      >
        <StatCell
          label="Home whistle, league-wide"
          value={signed(whistle.league.homeFtaEdge)}
          sub="home FTA minus away, per game"
        />
        <StatCell
          label="Home win rate"
          value={`${whistle.league.homeWinPct}%`}
          sub="across every counted game"
        />
        <StatCell
          label="Free throws per game"
          value={String(whistle.league.totalFta)}
          sub="both teams' attempts combined"
        />
        <StatCell
          label="Games counted"
          value={whistle.league.n.toLocaleString()}
          sub={`${whistle.firstSeason} – ${whistle.lastSeason}`}
        />
      </div>

      <div style={termCardStyle}>
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
        >
          What the data says
        </p>
        <p style={{ marginTop: 8, maxWidth: "44rem", fontSize: 15, color: "var(--term-text)", lineHeight: 1.55 }}>
          Two findings, and they point in different directions. Referees genuinely differ in{" "}
          <strong>how much they whistle</strong>: the tightest regulars sit around 43 combined
          free-throw attempts per game and the loosest near 48, and five of the sixty shown are
          more than three standard errors from the league mean — spreads chance does not produce.
          But on the question this page exists to ask — does any referee tilt the whistle toward
          the <strong>home</strong> team? — the signal thins out. A home-FTA edge needs to clear
          roughly ±1 attempt at these sample sizes before it means anything; fifty of sixty
          don&rsquo;t clear it, and of the ten that do, one clears the stricter three-error bar
          that whistle volume clears five times. Officiating style is real; a personal home
          whistle, mostly, is not.
        </p>
      </div>

      <div style={termCardStyle}>
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
        >
          Officials with {MIN_GAMES_SHOWN}+ games worked
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...termThStyle, textAlign: "left" }}>#</th>
                <th style={{ ...termThStyle, textAlign: "left" }}>Referee</th>
                <th style={{ ...termThStyle, textAlign: "right" }}>Games</th>
                <th style={{ ...termThStyle, textAlign: "right" }}>FT att / game</th>
                <th style={{ ...termThStyle, textAlign: "right" }}>Home FTA edge</th>
                <th style={{ ...termThStyle, textAlign: "right" }}>Home win %</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o, i) => (
                <tr key={o.name}>
                  <td
                    className="mono"
                    style={{ ...termTdStyle, fontSize: 10, textAlign: "right", color: "var(--term-text-muted)" }}
                  >
                    {i + 1}
                  </td>
                  <td className="mono whitespace-nowrap" style={{ ...termTdStyle, fontWeight: 600 }}>
                    {o.name}
                  </td>
                  <td
                    className="mono"
                    style={{ ...termTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--term-text-muted)" }}
                  >
                    {o.games}
                  </td>
                  <td
                    className="mono"
                    style={{ ...termTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", ...zStyle(o.totalFtaZ) }}
                  >
                    {o.totalFta.toFixed(1)}
                  </td>
                  <td
                    className="mono"
                    style={{ ...termTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", ...zStyle(o.homeFtaEdgeZ) }}
                  >
                    {signed(o.homeFtaEdge)}
                  </td>
                  <td
                    className="mono"
                    style={{ ...termTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", ...zStyle(o.homeWinPctZ) }}
                  >
                    {o.homeWinPct.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 12, maxWidth: "44rem", fontSize: 13, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
          Ordered by games worked. A value prints bold only when it deviates from the league
          baseline by more than chance would produce at that referee&rsquo;s sample size (|z| ≥{" "}
          {NOISE_Z}); muted values are indistinguishable from noise, whatever their sign. Even the
          bold ones come with a caveat: crews are assigned, not drawn at random — marquee games get
          senior officials — so a real deviation is a tendency of the assignment as much as of the
          person.
        </p>
      </div>

      <div style={termCardStyle}>
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
        >
          Method and limits
        </p>
        <p style={{ marginTop: 8, maxWidth: "44rem", fontSize: 13, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
          Officials and box scores from {whistle.source}, regular season only,{" "}
          {whistle.firstSeason} through {whistle.lastSeason} ({whistle.seasonsCovered} seasons;
          2019-20 sits outside this site&rsquo;s dataset). Free-throw attempts are the whistle
          metric because they are the whistle&rsquo;s direct scoreboard consequence and are present
          throughout the source, where foul counts are not. {whistle.gamesSkipped} of{" "}
          {(whistle.league.n + whistle.gamesSkipped).toLocaleString()} games are excluded because
          the source has no box statistics for them — a hole concentrated in 2015–2017 and
          unrelated to who officiated. {excluded} further officials worked fewer than{" "}
          {MIN_GAMES_SHOWN} games and are not shown. None of this measures intent, and none of it
          predicts a game: it describes assignments after the fact.
        </p>
      </div>
    </div>
  );
}
