"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import useSWR from "swr";

import styles from "@/components/home-court-study.module.css";
import { ScrollCue } from "@/components/ui/scroll-cue";
import { apiFetcher } from "@/lib/fetcher";
import {
  homeCourtEraSummary,
  homeCourtChartSegments,
  homeCourtTickIndices,
  restedHomeGap,
  type HomeCourtStudySeason,
  type HomeCourtStudyData,
} from "@/lib/home-court-study";
import { MIN_GAMES_FOR_INFERENCE } from "@/lib/season-report";
import { liftOverBaseline } from "@/lib/rest-split-facts";
import { KeepTogether } from "@/components/ui/keep-together";
import { signedNumber } from "@/lib/signed-number";
import { termSelectClass, termSelectStyle, WIDTH } from "@/lib/terminal-styles";

const muted = "text-[var(--term-text-muted)]";
const VIEW = { width: 900, height: 330, left: 56, right: 34, top: 22, bottom: 42 };

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function largeRestGapVersusHome(row: HomeCourtStudySeason) {
  return row.largeRestGap.winPct === null
    ? null
    : liftOverBaseline(Number(row.largeRestGap.winPct.toFixed(1)), row.homeBaselinePct);
}

function chartScale(rows: readonly HomeCourtStudySeason[], showLarge: boolean) {
  const values = rows.flatMap((row) => [
    row.homeBaselinePct,
    ...(row.games >= MIN_GAMES_FOR_INFERENCE ? [row.winPct] : []),
    ...(showLarge && row.largeRestGap.winPct !== null ? [row.largeRestGap.winPct] : []),
  ]);
  const low = values.length ? Math.min(...values) : 50;
  const high = values.length ? Math.max(...values) : 70;
  const minimum = Math.max(0, Math.floor((low - 2) / 5) * 5);
  const maximum = Math.min(100, Math.ceil((high + 2) / 5) * 5);
  const ticks = Array.from(
    { length: Math.round((maximum - minimum) / 5) + 1 },
    (_, index) => minimum + index * 5
  );
  return { minimum, maximum, ticks };
}

function chartPath(
  rows: readonly HomeCourtStudySeason[],
  value: (row: HomeCourtStudySeason) => number | null,
  x: (index: number) => number,
  y: (rate: number) => number
) {
  return homeCourtChartSegments(rows.map(value))
    .map((points) => points.map(({ index, rate }) => `${x(index)},${y(rate)}`).join(" "));
}

function seasonAriaLabel(row: HomeCourtStudySeason, showLarge: boolean) {
  const gap = restedHomeGap(row);
  const rest = gap === null
    ? `The rate for the rested team at home is too early, with ${row.games} of ${MIN_GAMES_FOR_INFERENCE} games.`
    : `The rested team at home won ${row.restedTeamWins} of ${row.games}, ${formatRate(row.winPct)}, ${signedNumber(gap, 1)} percentage points versus the home rate.`;
  const large = row.largeRestGap;
  const largeGap = largeRestGapVersusHome(row);
  const largeLabel = showLarge ? ` Rested at home with a 5+ gap: ${large.winPct === null ? "no eligible games" : `${large.restedTeamWins} wins of ${large.games}, ${formatRate(large.winPct)}, ${signedNumber(largeGap!, 1)} percentage points versus the home rate`}.` : "";
  return `${row.season}${row.isComplete ? "" : ", season to date"}. Home teams won ${row.homeWins} of ${row.homeGames}, ${formatRate(row.homeBaselinePct)}. ${rest}${largeLabel}`;
}

export function HomeCourtStudy() {
  const { data, error, isLoading: loading } = useSWR<HomeCourtStudyData>("/api/home-court", apiFetcher, { revalidateOnFocus: false });
  const rows = data?.seasonWinRates ?? [];
  const compatible = rows.every((row) =>
    typeof row.homeGames === "number" &&
    typeof row.homeWins === "number" &&
    typeof row.latestEvidenceDate === "string" &&
    typeof row.isComplete === "boolean" &&
    typeof row.largeRestGap?.games === "number" &&
    typeof row.largeRestGap.restedTeamWins === "number" &&
    (row.largeRestGap.winPct === null || Number.isFinite(row.largeRestGap.winPct))
  );
  const [showLarge, setShowLarge] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const selected = rows.find((row) => row.season === selectedSeason) ?? rows.findLast((row) => row.isComplete) ?? rows.at(-1) ?? null;
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
                ? "Home teams win less often than they used to"
                : "Home win rate has changed across the historical record"}
            </h2>
            <p className="mt-3"><KeepTogether>
              Home teams won {formatRate(summary.first.winPct)} across {summary.first.games.toLocaleString()} games from {summary.first.from} through {summary.first.to},
              compared with {formatRate(summary.latest.winPct)} across {summary.latest.games.toLocaleString()} games from {summary.latest.from} through {summary.latest.to}.
            </KeepTogether></p>
          </div>
          <div className="fc-report-interpretation flex flex-col gap-3">
            <h3 className="text-lg font-semibold">Use each season’s home rate as the baseline</h3>
            <p className={muted}>
              Annual results rise and fall. These records describe a long-run pattern; they do not show a steady decline every year or explain what caused it.
            </p>
          </div>
        </section>
      ) : null}

      <section className="fc-report-section flex flex-col gap-4" aria-labelledby="home-court-chart-title">
        <div className={styles.chartHeader}>
          <h2 id="home-court-chart-title" className="text-2xl font-semibold">Home win rate by season</h2>
          <p className={`mt-2 ${muted}`}>
            FullCourt-eligible regular-season games, using the designated home team. The Orlando bubble is excluded.
          </p>
        </div>
        <div className={styles.chartControls}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={showLarge} onChange={(event) => setShowLarge(event.target.checked)} aria-describedby="home-court-caveat" />
            <span>Show large rest gaps (5+)</span>
          </label>
          <label className="flex w-full flex-col gap-2 sm:w-64">
            <span className="text-[15px]">Inspect season</span>
            <select className={`${termSelectClass} min-h-11 w-full`} style={{ ...termSelectStyle, fontSize: 16 }} value={selected?.season ?? ""} onChange={(event) => setSelectedSeason(event.target.value)}>
              {rows.map((row) => <option key={row.season} value={row.season}>{row.season}{row.isComplete ? "" : " · season to date"}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6" aria-label="Chart legend">
          <span className="inline-flex items-center gap-2"><span className={`${styles.swatch} ${styles.homeSwatch}`} aria-hidden="true" />Home win rate</span>
          <span className="inline-flex items-center gap-2"><span className={`${styles.swatch} ${styles.restSwatch}`} aria-hidden="true" />Rested at home · 0.5+</span>
          {showLarge ? <span className="inline-flex items-center gap-2"><span className={`${styles.swatch} ${styles.largeSwatch}`} aria-hidden="true" />Rested at home · 5+ (raw)</span> : null}
        </div>
        <HomeCourtChart rows={rows} selected={selected} onSelect={setSelectedSeason} showLarge={showLarge} />
        {selected ? <SeasonInspection row={selected} showLarge={showLarge} /> : null}
        <p id="home-court-caveat" className={muted}>Seasonal sample sizes vary; these are observed records, not precise estimates. Groups overlap, and the records do not establish that rest caused the difference.</p>
      </section>

      <details className="fc-disclosure">
        <summary>View season data</summary>
        <ScrollCue data-pinned="" className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--term-accent)]" role="region" aria-label="Home-court season data; scroll horizontally for all columns" tabIndex={0}>
          <table className="fc-table w-full min-w-[760px] text-left">
            <thead className="bg-[var(--term-surface-2)] text-[var(--term-text-muted)]">
              <tr>
                <th scope="col" className={styles.seasonCell}>Season</th>
                <th scope="col" className="text-right">Home wins{"\u00a0/\u00a0"}games</th>
                <th scope="col" className="text-right">Home win rate</th>
                <th scope="col" className="text-right">Rested at home wins{"\u00a0/\u00a0"}games</th>
                <th scope="col" className="text-right">Rested at home win rate</th>
                <th scope="col" className="text-right">Vs baseline</th>
                {showLarge ? <><th scope="col" className="text-right">5+ wins{"\u00a0/\u00a0"}games</th><th scope="col" className="text-right">5+ raw win rate</th></> : null}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => {
                const gap = restedHomeGap(row);
                return (
                  <tr key={row.season} className="border-b border-[var(--term-border)]">
                    <th scope="row" className={styles.seasonCell}>
                      <a className="fc-text-link inline-flex min-h-11 items-center" href={`/season?season=${row.season}`}>{row.season}</a>
                      {!row.isComplete ? <span className={`block text-xs font-normal ${muted}`}>Season to date</span> : null}
                    </th>
                    <td className="mono text-right tabular-nums">{row.homeWins.toLocaleString()}&nbsp;/&nbsp;{row.homeGames.toLocaleString()}</td>
                    <td className="mono text-right tabular-nums">{formatRate(row.homeBaselinePct)}</td>
                    <td className="mono text-right tabular-nums">{row.restedTeamWins.toLocaleString()}&nbsp;/&nbsp;{row.games.toLocaleString()}</td>
                    <td className="mono text-right tabular-nums">{gap === null ? "Too early" : formatRate(row.winPct)}</td>
                    <td className="mono text-right tabular-nums">{gap === null ? "Too early" : `${signedNumber(gap, 1)}\u00a0pp`}</td>
                    {showLarge ? <><td className="mono text-right tabular-nums">{row.largeRestGap.restedTeamWins.toLocaleString()}&nbsp;/&nbsp;{row.largeRestGap.games.toLocaleString()}</td><td className="mono text-right tabular-nums">{row.largeRestGap.winPct === null ? "No eligible games" : formatRate(row.largeRestGap.winPct)}</td></> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollCue>
        <p className="fc-scroll-hint" aria-hidden="true">Scroll sideways for more columns.</p>
      </details>

      <section className="fc-report-section flex flex-col gap-4" aria-labelledby="home-court-context">
        <h2 id="home-court-context" className="text-2xl font-semibold">What prior research adds</h2>
        <p>
          NBA studies have also reported a long-run decline, while showing that the answer depends on the period and measure. One study connected the change with shooting style; that association does not establish a cause for FullCourt’s series.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li><a className="fc-text-link" href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0220630">Harris and Roebber, 2019</a>: NBA home advantage and changes in shooting patterns.</li>
          <li><a className="fc-text-link" href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0152440">Ribeiro et al., 2016</a>: home win rate and scoring margin over 2001–2014.</li>
          <li><a className="fc-text-link" href="https://www.nature.com/articles/s41598-021-93533-w">Scientific Reports, 2021</a>: home advantage across four North American leagues around <span className="whitespace-nowrap">COVID-19</span>.</li>
        </ul>
        <p className={muted}>
          FullCourt’s rates are unadjusted records. Team strength, neutral venues, attendance, travel, and other conditions can differ across seasons and between the groups.
        </p>
      </section>
    </div>
  );
}

function HomeCourtChart({ rows, selected, onSelect, showLarge }: { rows: readonly HomeCourtStudySeason[]; selected: HomeCourtStudySeason | null; onSelect: (season: string) => void; showLarge: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
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
  const { minimum, maximum, ticks } = chartScale(rows, showLarge);
  const plotWidth = width - VIEW.left - VIEW.right;
  const plotHeight = VIEW.height - VIEW.top - VIEW.bottom;
  const x = (index: number) => VIEW.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = (rate: number) => VIEW.top + ((maximum - rate) / (maximum - minimum)) * plotHeight;
  const homePaths = chartPath(rows, (row) => row.homeBaselinePct, x, y);
  const restPaths = chartPath(rows, (row) => row.games >= MIN_GAMES_FOR_INFERENCE ? row.winPct : null, x, y);
  const largePaths = showLarge ? chartPath(rows, (row) => row.largeRestGap.winPct, x, y) : [];
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
      <p id="home-court-chart-help" className={`mb-3 text-[15px] ${muted}`}>Hover or tap to inspect a season. With the chart focused, use ← or → for adjacent seasons, or Home or End for the first or latest season.</p>
      <svg data-testid="home-court-chart" className={styles.chart} viewBox={`0 0 ${width} ${VIEW.height}`} role="group" aria-label={`Home win rate and the rested team at home's win rate by NBA season${showLarge ? ", including raw 5+ rest gaps" : ""}`} onPointerMove={inspectPointer} onClick={inspectPointer}>
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
        {largePaths.map((points, index) => <polyline data-series="large-rest-gap" key={`large-${index}`} points={points} fill="none" stroke="var(--term-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" aria-hidden="true" />)}
        {selected ? <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={VIEW.top} y2={VIEW.height - VIEW.bottom} stroke="var(--term-text-muted)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" aria-hidden="true" /> : null}
        {rows.map((row, index) => (
          <g key={row.season} pointerEvents="none" aria-hidden="true">
            <circle data-series="home" cx={x(index)} cy={y(row.homeBaselinePct)} r="2.5" fill="var(--term-text-dim)" />
            {row.games >= MIN_GAMES_FOR_INFERENCE ? <circle data-series="rested-home" cx={x(index)} cy={y(row.winPct)} r="2.5" fill="var(--term-blue)" /> : null}
            {showLarge && row.largeRestGap.winPct !== null ? <circle data-series="large-rest-gap" cx={x(index)} cy={y(row.largeRestGap.winPct)} r="2.5" fill="var(--term-accent)" /> : null}
          </g>
        ))}
        {selected ? (
          <g
            className={styles.point}
            role="button"
            tabIndex={0}
            aria-describedby="home-court-chart-help"
            aria-label={seasonAriaLabel(selected, showLarge)}
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
              }
            }}
          >
            <rect className={styles.focusTarget} x={x(selectedIndex) - 22} y={y(selected.homeBaselinePct) - 22} width="44" height="44" fill="transparent" stroke="transparent" />
            <circle data-selected-series="home" cx={x(selectedIndex)} cy={y(selected.homeBaselinePct)} r="4.5" fill="var(--term-text-dim)" />
            {selected.games >= MIN_GAMES_FOR_INFERENCE ? <circle data-selected-series="rested-home" cx={x(selectedIndex)} cy={y(selected.winPct)} r="4.5" fill="var(--term-blue)" /> : null}
            {showLarge && selected.largeRestGap.winPct !== null ? <circle data-selected-series="large-rest-gap" cx={x(selectedIndex)} cy={y(selected.largeRestGap.winPct)} r="4.5" fill="var(--term-accent)" /> : null}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function SeasonInspection({ row, showLarge }: { row: HomeCourtStudySeason; showLarge: boolean }) {
  const gap = restedHomeGap(row);
  const largeGap = largeRestGapVersusHome(row);
  return (
    <div className={styles.inspection} data-testid="home-court-season-inspection" aria-live="polite">
      <div className={styles.inspectionHeading}>
        <h3 className={`mono ${styles.season}`}>{row.season}</h3>
        {!row.isComplete ? <p className={styles.count}>Season to date · through {row.latestEvidenceDate}</p> : null}
      </div>
      <div className={styles.homeRegion} data-testid="home-court-home-inspection">
        <div><p className={styles.comparisonLabel}>Home win rate · venue baseline</p>
        <p className={styles.count}>{row.homeWins.toLocaleString()} wins /&nbsp;{row.homeGames.toLocaleString()} games</p></div>
        <p className={`mono ${styles.homeRate}`}>{formatRate(row.homeBaselinePct)}</p>
      </div>
      <div className={styles.comparisonRegion}>
        <SeasonComparison label="Rested at home · 0.5+" rate={gap === null ? "Too early" : formatRate(row.winPct)} wins={row.restedTeamWins} games={row.games} gap={gap === null ? "Too early" : `${signedNumber(gap, 1)}\u00a0pp`} kind="rest" />
        {showLarge ? <SeasonComparison label="Rested at home · 5+ (raw)" rate={row.largeRestGap.winPct === null ? "No eligible games" : formatRate(row.largeRestGap.winPct)} wins={row.largeRestGap.restedTeamWins} games={row.largeRestGap.games} gap={largeGap === null ? "Unavailable" : `${signedNumber(largeGap, 1)}\u00a0pp`} kind="large" /> : null}
      </div>
    </div>
  );
}

function SeasonComparison({ label, rate, wins, games, gap, kind }: { label: string; rate: string; wins: number; games: number; gap: string; kind: "rest" | "large" }) {
  return <div className={`${styles.comparisonRow} ${kind === "rest" ? styles.restComparison : styles.largeComparison}`} data-testid={`home-court-${kind}-inspection`}>
    <div>
      <h4 className={styles.comparisonLabel}>{label}</h4>
      <p className={styles.count}>{wins.toLocaleString()} wins /&nbsp;{games.toLocaleString()} games</p>
      <p className={styles.gap}><span className={styles.gapLabel}>Vs home rate </span><span className={`mono ${styles.gapValue}`}>{gap}</span></p>
    </div>
    <p className={`mono ${styles.rate} ${rate.endsWith("%") ? "" : styles.unavailableRate}`}>{rate}</p>
  </div>;
}
