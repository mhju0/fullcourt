"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import styles from "@/components/home-court-study.module.css";
import { useBacktest } from "@/hooks/useBacktest";
import {
  homeCourtEraSummary,
  homeCourtTickIndices,
  restedHomeGap,
  type HomeCourtSeason,
} from "@/lib/home-court-study";
import { MIN_GAMES_FOR_INFERENCE } from "@/lib/season-report";
import { signedNumber } from "@/lib/signed-number";
import { WIDTH } from "@/lib/terminal-styles";

const muted = "text-[var(--term-text-muted)]";
const VIEW = { width: 900, height: 330, left: 56, right: 34, top: 22, bottom: 42 };

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function chartScale(rows: readonly HomeCourtSeason[]) {
  const values = rows.flatMap((row) => [
    row.homeBaselinePct,
    ...(row.games >= MIN_GAMES_FOR_INFERENCE ? [row.winPct] : []),
  ]);
  const low = values.length ? Math.min(...values) : 50;
  const high = values.length ? Math.max(...values) : 70;
  const minimum = Math.floor((low - 2) / 5) * 5;
  const maximum = Math.ceil((high + 2) / 5) * 5;
  const ticks = Array.from(
    { length: Math.round((maximum - minimum) / 5) + 1 },
    (_, index) => minimum + index * 5
  );
  return { minimum, maximum, ticks };
}

function chartPath(
  rows: readonly HomeCourtSeason[],
  value: (row: HomeCourtSeason) => number | null,
  x: (index: number) => number,
  y: (rate: number) => number
) {
  const segments: string[] = [];
  let points: string[] = [];
  rows.forEach((row, index) => {
    const rate = value(row);
    if (rate === null) {
      if (points.length > 1) segments.push(points.join(" "));
      points = [];
      return;
    }
    points.push(`${x(index)},${y(rate)}`);
  });
  if (points.length > 1) segments.push(points.join(" "));
  return segments;
}

function seasonAriaLabel(row: HomeCourtSeason) {
  const gap = restedHomeGap(row);
  const rest = gap === null
    ? `Rested-at-home rate is too early, with ${row.games} of ${MIN_GAMES_FOR_INFERENCE} games.`
    : `Rested-at-home teams won ${row.restedTeamWins} of ${row.games}, ${formatRate(row.winPct)}, ${signedNumber(gap, 1)} percentage points versus the home rate.`;
  return `${row.season}${row.isComplete ? "" : ", season to date"}. Home teams won ${row.homeWins} of ${row.homeGames}, ${formatRate(row.homeBaselinePct)}. ${rest}`;
}

export function HomeCourtStudy() {
  const { data, error, loading } = useBacktest("/api/analysis?schema=home-court-v1");
  const rows = data?.seasonWinRates ?? [];
  const compatible = rows.every((row) =>
    typeof row.homeGames === "number" &&
    typeof row.homeWins === "number" &&
    typeof row.latestEvidenceDate === "string" &&
    typeof row.isComplete === "boolean"
  );
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const selected = rows.find((row) => row.season === selectedSeason) ?? rows.at(-1) ?? null;
  const summary = homeCourtEraSummary(rows);

  if (loading) {
    return <div className="h-80 bg-[var(--term-surface-2)]" role="status" aria-label="Loading home-court history" />;
  }
  if (error || !data || !compatible) {
    return <p role="status">Home-court history is unavailable right now. Please try again.</p>;
  }
  if (rows.length === 0) {
    return <p role="status">No eligible home-court season data is available yet.</p>;
  }

  return (
    <div className="flex flex-col gap-12 text-[15px] leading-relaxed" style={{ maxWidth: WIDTH.wide }}>
      {summary ? (
        <section aria-labelledby="home-court-finding" className="fc-report-summary">
          <div>
            <p className="mono text-xs text-[var(--term-text-muted)]">COMPLETED SEASONS · FIVE-SEASON ENDPOINTS</p>
            <h2 id="home-court-finding" className="mt-2 text-2xl font-semibold">
              {summary.latest.winPct < summary.first.winPct
                ? "Home teams win less often than they used to."
                : "Home win rate has changed across the historical record."}
            </h2>
            <p className="mt-3">
              Home teams won {formatRate(summary.first.winPct)} across {summary.first.games.toLocaleString()} games from {summary.first.from} through {summary.first.to},
              compared with {formatRate(summary.latest.winPct)} across {summary.latest.games.toLocaleString()} games from {summary.latest.from} through {summary.latest.to}.
            </p>
          </div>
          <div className="fc-report-interpretation flex flex-col gap-3">
            <h3 className="text-lg font-semibold">Use each season’s home rate as the baseline.</h3>
            <p className={muted}>
              Annual results rise and fall. These records describe a long-run pattern; they do not show a steady decline every year or explain what caused it.
            </p>
          </div>
        </section>
      ) : null}

      <section className="fc-report-section flex flex-col gap-4" aria-labelledby="home-court-chart-title">
        <div>
          <h2 id="home-court-chart-title" className="text-2xl font-semibold">Home win rate by season</h2>
          <p className={`mt-2 ${muted}`}>
            FullCourt-eligible regular-season games, using the designated home team. The Orlando bubble is excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Chart legend">
          <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 bg-[var(--term-text-dim)]" aria-hidden="true" />Home win rate</span>
          <span className="inline-flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-[var(--term-blue)]" aria-hidden="true" /><span className="inline-block h-2 w-2 rotate-45 bg-[var(--term-blue)]" aria-hidden="true" />Rested-at-home win rate</span>
          {rows.some((row) => !row.isComplete) ? <span className={muted}>○ Season to date</span> : null}
        </div>
        <HomeCourtChart rows={rows} selected={selected} onSelect={setSelectedSeason} />
        {selected ? <SeasonInspection row={selected} onSelect={setSelectedSeason} rows={rows} /> : null}
        <p className={muted}>
          The rested-at-home rate appears after {MIN_GAMES_FOR_INFERENCE} eligible games. Straight segments connect annual observations; no smoothing or fitted trend is applied.
        </p>
      </section>

      <details className="fc-disclosure">
        <summary>View season data</summary>
        <div className={`overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--term-accent)] ${styles.tableScroll}`} role="region" aria-label="Home-court season data; scroll horizontally for all columns" tabIndex={0}>
          <table className="fc-table w-full min-w-[760px] text-left">
            <thead className="bg-[var(--term-surface-2)] text-[var(--term-text-muted)]">
              <tr>
                <th scope="col" className={styles.seasonCell}>Season</th>
                <th scope="col" className="text-right">Home wins / games</th>
                <th scope="col" className="text-right">Home win rate</th>
                <th scope="col" className="text-right">Rested-home wins / games</th>
                <th scope="col" className="text-right">Rested-home win rate</th>
                <th scope="col" className="text-right">Gap</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => {
                const gap = restedHomeGap(row);
                return (
                  <tr key={row.season} className="border-b border-[var(--term-border)]">
                    <th scope="row" className={styles.seasonCell}>
                      <a className="fc-text-link" href={`/season?season=${row.season}`}>{row.season}</a>
                      {!row.isComplete ? <span className={`block text-xs font-normal ${muted}`}>Season to date</span> : null}
                    </th>
                    <td className="mono text-right tabular-nums">{row.homeWins.toLocaleString()} / {row.homeGames.toLocaleString()}</td>
                    <td className="mono text-right tabular-nums">{formatRate(row.homeBaselinePct)}</td>
                    <td className="mono text-right tabular-nums">{row.restedTeamWins.toLocaleString()} / {row.games.toLocaleString()}</td>
                    <td className="mono text-right tabular-nums">{gap === null ? "Too early" : formatRate(row.winPct)}</td>
                    <td className="mono text-right tabular-nums">{gap === null ? "Too early" : `${signedNumber(gap, 1)} pp`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <section className="fc-report-section flex flex-col gap-4" aria-labelledby="home-court-context">
        <h2 id="home-court-context" className="text-2xl font-semibold">What prior research adds</h2>
        <p>
          NBA studies have also reported a long-run decline, while showing that the answer depends on the period and measure. One study connected the change with shooting style; that association does not establish a cause for FullCourt’s series.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li><a className="fc-text-link" href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0220630">Harris and Roebber, 2019</a>: NBA home advantage and changes in shooting patterns.</li>
          <li><a className="fc-text-link" href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0152440">Ribeiro et al., 2016</a>: home win rate and scoring margin over 2001–2014.</li>
          <li><a className="fc-text-link" href="https://www.nature.com/articles/s41598-021-93533-w">Scientific Reports, 2021</a>: home advantage across four North American leagues around COVID-19.</li>
        </ul>
        <p className={muted}>
          FullCourt’s rates are unadjusted records. Team strength, neutral venues, attendance, travel, and other conditions can differ across seasons and between the two lines.
        </p>
      </section>
    </div>
  );
}

function HomeCourtChart({ rows, selected, onSelect }: { rows: readonly HomeCourtSeason[]; selected: HomeCourtSeason | null; onSelect: (season: string) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(VIEW.width);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setWidth(Math.max(300, Math.round(frame.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const { minimum, maximum, ticks } = chartScale(rows);
  const plotWidth = width - VIEW.left - VIEW.right;
  const plotHeight = VIEW.height - VIEW.top - VIEW.bottom;
  const x = (index: number) => VIEW.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = (rate: number) => VIEW.top + ((maximum - rate) / (maximum - minimum)) * plotHeight;
  const homePaths = chartPath(rows, (row) => row.homeBaselinePct, x, y);
  const restPaths = chartPath(rows, (row) => row.games >= MIN_GAMES_FOR_INFERENCE ? row.winPct : null, x, y);
  const xTicks = new Set(homeCourtTickIndices(rows.length, width < 560 ? 4 : 6));
  const selectedIndex = selected ? rows.indexOf(selected) : -1;
  const inspectPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (rows.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - bounds.left) / bounds.width) * width;
    const ratio = Math.max(0, Math.min(1, (localX - VIEW.left) / plotWidth));
    onSelect(rows[Math.round(ratio * (rows.length - 1))].season);
  };

  return (
    <div className={styles.chartFrame} ref={frameRef}>
      <p id="home-court-chart-help" className="sr-only">Use the chart button’s left and right arrow keys to inspect adjacent seasons. Use Home or End to jump to the first or latest season.</p>
      <svg data-testid="home-court-chart" className={styles.chart} viewBox={`0 0 ${width} ${VIEW.height}`} role="group" aria-label="Home and rested-at-home win rates by NBA season" onPointerMove={inspectPointer} onClick={inspectPointer}>
        {ticks.map((tick) => (
          <g key={tick} aria-hidden="true">
            <line x1={VIEW.left} x2={width - VIEW.right} y1={y(tick)} y2={y(tick)} stroke="var(--term-border)" strokeDasharray="3 4" />
            <text x={VIEW.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="12" fill="var(--term-text-muted)" className="mono">{tick}%</text>
          </g>
        ))}
        {rows.map((row, index) => xTicks.has(index) ? (
          <text key={row.season} x={x(index)} y={VIEW.height - 12} textAnchor="middle" fontSize="11" fill="var(--term-text-muted)" className="mono" aria-hidden="true">{row.season}</text>
        ) : null)}
        {homePaths.map((points, index) => <polyline key={`home-${index}`} points={points} fill="none" stroke="var(--term-text-dim)" strokeWidth="2" vectorEffect="non-scaling-stroke" aria-hidden="true" />)}
        {restPaths.map((points, index) => <polyline key={`rest-${index}`} points={points} fill="none" stroke="var(--term-blue)" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" aria-hidden="true" />)}
        {selected ? <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={VIEW.top} y2={VIEW.height - VIEW.bottom} stroke="var(--term-accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" aria-hidden="true" /> : null}
        {rows.map((row, index) => (
          <g key={row.season} pointerEvents="none" aria-hidden="true">
            <circle cx={x(index)} cy={y(row.homeBaselinePct)} r={row.isComplete ? 3 : 5} fill={row.isComplete ? "var(--term-text-dim)" : "var(--term-surface)"} stroke="var(--term-text-dim)" strokeWidth={row.isComplete ? 1 : 2} />
            {row.games >= MIN_GAMES_FOR_INFERENCE ? <rect x={x(index) - (row.isComplete ? 3 : 5)} y={y(row.winPct) - (row.isComplete ? 3 : 5)} width={row.isComplete ? 6 : 10} height={row.isComplete ? 6 : 10} transform={`rotate(45 ${x(index)} ${y(row.winPct)})`} fill={row.isComplete ? "var(--term-blue)" : "var(--term-surface)"} stroke="var(--term-blue)" strokeWidth={row.isComplete ? 1 : 2} aria-hidden="true" /> : null}
          </g>
        ))}
        {selected ? (
          <g
            ref={pointRef}
            className={styles.point}
            role="button"
            tabIndex={0}
            aria-describedby="home-court-chart-help"
            aria-label={seasonAriaLabel(selected)}
            onKeyDown={(event) => {
              const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              const destination = direction !== 0
                ? Math.max(0, Math.min(rows.length - 1, selectedIndex + direction))
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? rows.length - 1
                    : null;
              if (destination !== null) {
                event.preventDefault();
                onSelect(rows[destination].season);
                requestAnimationFrame(() => pointRef.current?.focus());
              }
            }}
          >
            <rect x={x(selectedIndex) - 22} y={y(selected.homeBaselinePct) - 22} width="44" height="44" fill="transparent" stroke="transparent" />
            <circle cx={x(selectedIndex)} cy={y(selected.homeBaselinePct)} r="7" fill="none" stroke="var(--term-accent)" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function SeasonInspection({ row, rows, onSelect }: { row: HomeCourtSeason; rows: readonly HomeCourtSeason[]; onSelect: (season: string) => void }) {
  const gap = restedHomeGap(row);
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <label className="fc-filter-field max-w-56">
        <span className="fc-control-label">Inspect season</span>
        <select className="fc-control" value={row.season} onChange={(event) => onSelect(event.target.value)}>
          {[...rows].reverse().map((option) => <option key={option.season} value={option.season}>{option.season}{option.isComplete ? "" : " · season to date"}</option>)}
        </select>
      </label>
      <div className={styles.inspection}>
        <div><p className="fc-control-label">Season</p><p className="mono mt-1 font-semibold">{row.season}</p>{!row.isComplete ? <p className={`text-xs ${muted}`}>Season to date · through {row.latestEvidenceDate}</p> : null}</div>
        <div><p className="fc-control-label">Home</p><p className="mono mt-1 font-semibold tabular-nums">{formatRate(row.homeBaselinePct)}</p><p className={`text-xs ${muted}`}>{row.homeWins.toLocaleString()} / {row.homeGames.toLocaleString()} games</p></div>
        <div><p className="fc-control-label">Rested at home</p><p className="mono mt-1 font-semibold tabular-nums">{gap === null ? "Too early" : formatRate(row.winPct)}</p><p className={`text-xs ${muted}`}>{row.restedTeamWins.toLocaleString()} / {row.games.toLocaleString()} games</p></div>
        <div><p className="fc-control-label">Gap</p><p className="mono mt-1 font-semibold tabular-nums">{gap === null ? "Too early" : `${signedNumber(gap, 1)} pp`}</p><p className={`text-xs ${muted}`}>versus that season’s home rate</p></div>
      </div>
    </div>
  );
}
