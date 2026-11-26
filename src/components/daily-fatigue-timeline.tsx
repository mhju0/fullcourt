"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { inspectionStep } from "@/lib/chart-inspection";
import { allStarBreak } from "@/lib/game-day-context";
import { formatFatigueScore } from "@/lib/rest-advantage-display";
import type { SeasonReportDay } from "@/lib/season-report";

const DAY_MS = 86_400_000;
const DAY_WIDTH = 24;
const INSET = 28;
const PLOT_TOP = 48;
const PLOT_BOTTOM = 184;
const CHART_HEIGHT = 216;
const exactDate = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", timeZone: "UTC",
});
const controlClass = "fc-control-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--term-radius)] border border-[var(--term-control-border)] bg-[var(--term-surface)] px-2 text-xs disabled:opacity-50";

const dayNumber = (date: string) => Date.parse(date) / DAY_MS;

export function DailyFatigueTimeline({
  season, days, availableFinalGames,
}: {
  season: string;
  days: readonly SeasonReportDay[];
  availableFinalGames: number;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="daily-fatigue-title">
      <h2 id="daily-fatigue-title" className="border-b border-[var(--term-border)] pb-3 text-lg font-semibold">
        League fatigue by day
      </h2>
      {days.length ? (
        <>
          <p className="text-[15px] text-[var(--term-text-muted)]">
            Average of both teams’ fatigue scores in completed games. Only games with both scores count.
          </p>
          <DailyFatiguePlot season={season} days={days} />
        </>
      ) : (
        <p className="text-[15px] text-[var(--term-text-muted)]">
          {availableFinalGames > 0
            ? "No completed games have fatigue scores for both teams yet."
            : "No completed games yet. The timeline fills in as the season is played."}
        </p>
      )}
    </section>
  );
}

function DailyFatiguePlot({ season, days }: { season: string; days: readonly SeasonReportDay[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [showBreak, setShowBreak] = useState(false);
  const [edges, setEdges] = useState({ start: false, end: true });
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const lastIndex = days.length - 1;
  const found = picked === null ? -1 : days.findIndex(day => day.date >= picked);
  const index = found < 0 ? lastIndex : found;
  const selected = days[index];
  const firstDate = days[0].date;
  const lastDate = days[lastIndex].date;
  const firstNumber = dayNumber(firstDate);
  const x = (date: string) => INSET + (dayNumber(date) - firstNumber) * DAY_WIDTH;
  const width = x(lastDate) + INSET;
  const tickStep = Math.max(2, Math.ceil(Math.max(...days.map(day => day.avgFatigue)) / 5));
  const ticks = [0, 1, 2, 3, 4, 5].map(value => value * tickStep);
  const plotY = (value: number) => PLOT_BOTTOM - value * (PLOT_BOTTOM - PLOT_TOP) / (5 * tickStep);
  const leagueBreak = allStarBreak(season);
  const breakIndex = leagueBreak ? days.findIndex((day, i) =>
    dayNumber(day.date) === dayNumber(leagueBreak.end) + 1 &&
    i > 0 && dayNumber(days[i - 1].date) === dayNumber(leagueBreak.start) - 1,
  ) : -1;

  function updateEdges(viewport: HTMLDivElement) {
    const start = viewport.scrollLeft <= 1;
    const end = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
    setEdges(previous => previous.start === start && previous.end === end ? previous : { start, end });
  }

  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => updateEdges(viewport));
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (viewport && picked === null) {
      viewport.scrollLeft = viewport.scrollWidth;
    }
  }, [lastDate, picked]);

  function select(next: number) {
    const day = days[next];
    setPicked(day.date);
    const viewport = scroll.current;
    if (viewport) viewport.scrollLeft = x(day.date) - viewport.clientWidth / 2;
  }

  function page(direction: -1 | 1) {
    const viewport = scroll.current;
    if (!viewport) return;
    const target = viewport.scrollLeft + direction * viewport.clientWidth;
    if (target <= 0) return select(0);
    if (target >= viewport.scrollWidth - viewport.clientWidth) return select(lastIndex);
    const center = target + viewport.clientWidth / 2;
    const next = days.reduce((best, day, i) =>
      Math.abs(x(day.date) - center) < Math.abs(x(days[best].date) - center) ? i : best, 0);
    select(next);
  }

  const dateTicks = Array.from(
    { length: Math.floor((dayNumber(lastDate) - firstNumber) / 4) + 1 },
    (_, i) => ({ timestamp: (firstNumber + i * 4) * DAY_MS, x: INSET + i * 4 * DAY_WIDTH }),
  );
  const breakCenter = breakIndex > 0
    ? (x(days[breakIndex - 1].date) + x(days[breakIndex].date)) / 2
    : 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous game day" disabled={index === 0}
          className={controlClass} onClick={() => select(index - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <p role="status" data-testid="fatigue-day-readout"
          className="mono flex min-w-0 flex-1 flex-wrap items-baseline justify-center gap-x-3 text-center text-xs tabular-nums">
          <time className="w-full font-semibold" dateTime={selected.date}>{exactDate.format(Date.parse(selected.date))} ET</time>
          <span><strong className="text-[var(--term-red-text)]">{formatFatigueScore(selected.avgFatigue)}</strong> mean fatigue</span>
          <span>{selected.games} completed {selected.games === 1 ? "game" : "games"}</span>
        </p>
        <button type="button" aria-label="Next game day" disabled={index === lastIndex}
          className={controlClass} onClick={() => select(index + 1)}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-w-0 rounded-[var(--term-radius)] border border-[var(--term-border)] bg-[var(--term-surface)]">
        <svg width="30" height={CHART_HEIGHT} className="shrink-0 text-[var(--term-text-muted)]" aria-hidden="true">
          {ticks.map(value => (
            <text key={value} x="24" y={plotY(value) + 4} textAnchor="end" fill="currentColor" className="mono text-xs">{value}</text>
          ))}
        </svg>
        <div
          ref={scroll}
          role="region"
          tabIndex={0}
          aria-label="League average fatigue by day"
          aria-describedby="daily-fatigue-help"
          data-testid="fatigue-calendar"
          className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain rounded-r-[var(--term-radius)] focus-visible:outline-2 focus-visible:outline-[var(--term-accent)]"
          onScroll={event => updateEdges(event.currentTarget)}
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return;
            const next = inspectionStep(event.key, index, days.length);
            if (next !== null) {
              event.preventDefault();
              select(next);
            } else if (event.key === "PageUp" || event.key === "PageDown") {
              event.preventDefault();
              page(event.key === "PageUp" ? -1 : 1);
            }
          }}
          onPointerDown={event => {
            if (event.pointerType === "mouse" && event.button === 0 && !(event.target instanceof HTMLButtonElement)) {
              drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
            }
          }}
          onPointerMove={event => {
            const start = drag.current;
            if (!start || event.buttons !== 1) return;
            const offset = start.x - event.clientX;
            if (!start.moved && Math.abs(offset) < 5) return;
            start.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.scrollLeft = start.left + offset;
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          <div className="relative min-w-full select-none" style={{ width }}>
            <svg width="100%" height={CHART_HEIGHT} className="block text-[var(--term-text-muted)]" aria-hidden="true">
              {ticks.map(value => (
                <line key={value} x1="0" x2="100%" y1={plotY(value)} y2={plotY(value)} stroke="var(--term-border)" />
              ))}
              {breakIndex > 0 && leagueBreak ? (
                <rect x={x(leagueBreak.start) - DAY_WIDTH / 2} y={PLOT_TOP}
                  width={(dayNumber(leagueBreak.end) - dayNumber(leagueBreak.start) + 1) * DAY_WIDTH}
                  height={PLOT_BOTTOM - PLOT_TOP} fill="var(--term-surface-2)" />
              ) : null}
              {days.slice(1).map((day, i) => {
                const before = days[i];
                const gap = dayNumber(day.date) - dayNumber(before.date) > 1;
                return (
                  <line key={day.date} data-gap={gap ? before.date + "/" + day.date : undefined}
                    x1={x(before.date)} y1={plotY(before.avgFatigue)} x2={x(day.date)} y2={plotY(day.avgFatigue)}
                    stroke="var(--term-red-text)" strokeWidth="1.5"
                    strokeDasharray={gap ? "4 4" : undefined} />
                );
              })}
              <line x1={x(selected.date)} x2={x(selected.date)} y1={PLOT_TOP} y2={PLOT_BOTTOM}
                stroke="var(--term-accent)" strokeDasharray="2 3" />
              {days.map((day, i) => (
                <g key={day.date}>
                  <circle cx={x(day.date)} cy={plotY(day.avgFatigue)} r={i === index ? 5 : 3}
                    fill={i === index ? "var(--term-accent)" : "var(--term-red-text)"} stroke="var(--term-surface)" />
                  <rect data-fatigue-date={day.date} className="cursor-pointer"
                    x={x(day.date) - DAY_WIDTH / 2} y={plotY(day.avgFatigue) - 22}
                    width={DAY_WIDTH} height="44" fill="transparent"
                    onClick={() => select(i)} />
                </g>
              ))}
              {dateTicks.map(tick => (
                <text key={tick.timestamp} x={tick.x} y="206" textAnchor="middle" fill="currentColor" className="mono text-xs">
                  {shortDate.format(tick.timestamp)}
                </text>
              ))}
            </svg>
            {breakIndex > 0 ? (
              <button type="button" className={`${controlClass} absolute top-0 -translate-x-1/2 whitespace-nowrap text-[var(--term-accent)]`}
                style={{ left: breakCenter }} aria-expanded={showBreak} aria-controls="daily-fatigue-break"
                onClick={() => setShowBreak(value => !value)}>
                All-Star Break
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {breakIndex > 0 && leagueBreak ? (
        <p id="daily-fatigue-break" hidden={!showBreak} className="text-[15px] text-[var(--term-text-muted)]">
          All-Star Break · {shortDate.format(Date.parse(leagueBreak.start))}–{exactDate.format(Date.parse(leagueBreak.end))} ET
        </p>
      ) : null}
      <p className="flex items-baseline gap-2 text-xs text-[var(--term-text-muted)]">
        <span aria-hidden="true" className="w-6 shrink-0 border-t-2 border-dashed border-[var(--term-red-text)]" />
        Dashed lines cross dates without a measured slate.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button type="button" className={controlClass} disabled={edges.start} onClick={() => page(-1)}>Earlier dates</button>
        <button type="button" className={controlClass} disabled={edges.end} onClick={() => page(1)}>Later dates</button>
        <button type="button" className={controlClass} onClick={() => select(0)}>First game day</button>
        <button type="button" className={controlClass} onClick={() => select(lastIndex)}>Latest game day</button>
      </div>
      <p id="daily-fatigue-help" className="text-[15px] text-[var(--term-text-muted)]">
        Scroll or swipe sideways. Select a dot for its game day.
        With the chart focused, use Left or Right for adjacent game days, Page Up or Page Down to move the view,
        or Home or End for the season bounds.
      </p>
    </>
  );
}
