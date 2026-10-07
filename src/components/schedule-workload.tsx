"use client";

import { useState } from "react";
import useSWR from "swr";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DataTable } from "@/components/ui/data-table";
import { RankBadge } from "@/components/ui/rank-badge";
import { competitionRanks } from "@/lib/rank";
import { apiFetcher } from "@/lib/fetcher";
import { LEAD, TYPE, WIDTH, termCardStyle } from "@/lib/terminal-styles";
import type {
  SeasonReportResponse,
  SeasonReportTeamLabelled,
  SeasonReportWeek,
} from "@/lib/season-report";

function SectionDivider({
  label,
  descriptor,
}: {
  label: string;
  descriptor?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--term-border)] pb-3">
      <h2 className="text-lg font-semibold">{label}</h2>
      <span className="mono text-xs text-[var(--term-text-muted)]">
        {descriptor}
      </span>
    </div>
  );
}

function ScheduleTax({
  teams,
  basis,
}: {
  teams: SeasonReportTeamLabelled[];
  basis: SeasonReportResponse["basis"];
}) {
  const byMiles = [...teams].sort(
    (a, b) => b.travelMiles - a.travelMiles || a.teamId - b.teamId,
  );
  const most = byMiles[0];
  const least = byMiles[byMiles.length - 1];
  const b2bRanks = competitionRanks(byMiles, (t) => t.backToBacks);
  const threeInFourRanks = competitionRanks(byMiles, (t) => t.threeInFours);

  return (
    <div className="flex flex-col gap-3">
      {/* The descriptor has to move with the basis. "COMPLETED GAMES ONLY" over a season with
          no completed game describes an empty set, when what is actually shown is the whole
          published schedule. */}
      <SectionDivider
        label="Travel and workload"
        descriptor={
          basis === "schedule"
            ? "FULL PUBLISHED SCHEDULE"
            : "COMPLETED GAMES ONLY"
        }
      />
      <p
        style={{
          fontSize: TYPE.body,
          color: "var(--term-text-muted)",
          maxWidth: WIDTH.prose,
          lineHeight: LEAD.body,
        }}
      >
        Back-to-backs and dense stretches are demands on a team. The ranking
        above compares those demands with its opponents. Travel is estimated
        from venue locations; time-zone displacement is a modeled schedule
        measure, not a medical finding.
      </p>
      {most && least ? (
        <p
          className="mono"
          style={{ fontSize: 11, color: "var(--term-text-muted)" }}
        >
          {most.abbreviation} has the most estimated travel at{" "}
          {most.travelMiles.toLocaleString()} miles · {least.abbreviation} the
          least at {least.travelMiles.toLocaleString()}
        </p>
      ) : null}
      {/* Full for the same reason as the conversion table above: one row per team, the page's
          column is the measure. The zero-rest player list below stays numeric — a compact
          lookup, not a league table.

          The rank riders (ADR 0010, D1) sit on the two density columns and only those: the
          table is sorted by miles, so a rank there restates the row number, and JET LAG is a
          sibling measure rather than a key one. B2B and 3-IN-4 are the two figures a reader
          looks their own team up for, and they arrive out of sort order — the rider is what
          says "14 back-to-backs" is 3rd-most without making the reader re-sort by eye. Counts,
          not proportions, so ties are common and share a rank by construction. */}
      <DataTable
        wrapperClassName="fc-detail-table overflow-x-auto"
        width="full"
        minWidth={520}
        rows={byMiles}
        rowKey={(t) => t.teamId}
        rowAttrs={() => ({ "data-testid": "schedule-tax-row" })}
        columns={[
          { label: "TEAM", cell: (t) => t.abbreviation },
          {
            label: "TRAVEL MILES",
            numeric: true,
            cell: (t) => t.travelMiles.toLocaleString(),
          },
          {
            label: "BACK-TO-BACKS",
            unit: "GAMES · 1ST = MOST",
            numeric: true,
            cell: (t, i) => (
              <>
                {t.backToBacks}
                {b2bRanks[i] !== null ? (
                  <RankBadge
                    rank={b2bRanks[i]}
                    of={byMiles.length}
                    population="teams"
                  />
                ) : null}
              </>
            ),
          },
          {
            label: "3-IN-4",
            unit: "GAMES · 1ST = MOST",
            numeric: true,
            cell: (t, i) => (
              <>
                {t.threeInFours}
                {threeInFourRanks[i] !== null ? (
                  <RankBadge
                    rank={threeInFourRanks[i]}
                    of={byMiles.length}
                    population="teams"
                  />
                ) : null}
              </>
            ),
          },
          {
            label: "TIME-ZONE SHIFT",
            unit: "GAMES",
            numeric: true,
            cell: (t) => t.jetLagGames,
          },
        ]}
      />
    </div>
  );
}

/** A week this far under the season's median is drawn lighter and explained in the caption. */
const LOW_WEEK_RATIO = 0.75;

const weekDate = (startDate: string, pattern: string) =>
  format(parseISO(`${startDate}T12:00:00`), pattern);

/**
 * League-wide fatigue, one bar per week. It was a week-number axis with a slider that moved a
 * line of text and nothing on the chart (owner phone review, 2026-10-07, D-79): the axis now
 * names months, the picked week is the highlighted bar, and the low weeks are explained.
 */
function FatigueCalendar({ weeks }: { weeks: SeasonReportWeek[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const heading = (
    <SectionDivider
      label="League fatigue by week"
      descriptor="Completed games · every team · 0 to 10"
    />
  );
  if (weeks.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <p style={{ color: "var(--term-text-muted)" }}>
          No completed games yet, so there is no weekly average to show. This
          fills in as the season is played.
        </p>
      </div>
    );
  }
  const peakIndex = weeks.reduce(
    (best, w, i) => (w.avgFatigue > weeks[best].avgFatigue ? i : best),
    0,
  );
  const index = Math.min(picked ?? peakIndex, weeks.length - 1);
  const selected = weeks[index];
  const peak = weeks[peakIndex];
  const sorted = weeks.map((w) => w.avgFatigue).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const monthStarts = weeks
    .filter((w, i) => i === 0 || w.startDate.slice(0, 7) !== weeks[i - 1].startDate.slice(0, 7))
    .map((w) => w.startDate);
  const stepButton =
    "fc-control-button inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--term-radius)] border border-[var(--term-border)] bg-[var(--term-surface)] disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      {heading}
      <p
        style={{
          fontSize: TYPE.body,
          color: "var(--term-text-muted)",
          maxWidth: WIDTH.prose,
          lineHeight: LEAD.body,
        }}
      >
        Each bar is one week: the average fatigue score of every team that
        played. This is the whole league, not a comparison between teams.
        Lighter bars are weeks well below the usual level, when most teams came
        in rested, such as opening week or the week after a league break.
      </p>
      <p
        className="mono"
        style={{ fontSize: 11, color: "var(--term-text-muted)" }}
      >
        PEAK: WEEK OF {weekDate(peak.startDate, "MMM d, yyyy").toUpperCase()} ·{" "}
        {peak.avgFatigue.toFixed(2)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous week"
          disabled={index === 0}
          onClick={() => setPicked(index - 1)}
          className={stepButton}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <p
          className="mono min-w-0 flex-1 text-center text-xs tabular-nums"
          role="status"
          data-testid="fatigue-week-readout"
        >
          Week of {weekDate(selected.startDate, "MMM d, yyyy")} ·{" "}
          {selected.avgFatigue.toFixed(2)} · {selected.games} games
        </p>
        <button
          type="button"
          aria-label="Next week"
          disabled={index === weeks.length - 1}
          onClick={() => setPicked(index + 1)}
          className={stepButton}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div
        data-testid="fatigue-calendar"
        style={{ ...termCardStyle, height: 220, padding: 12 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={weeks}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          >
            <XAxis
              dataKey="startDate"
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              ticks={monthStarts}
              tickFormatter={(d: string) => weekDate(d, "MMM").toUpperCase()}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              width={32}
            />
            <Bar
              dataKey="avgFatigue"
              maxBarSize={28}
              isAnimationActive={false}
              onClick={(_, i) => setPicked(i)}
              className="cursor-pointer"
            >
              {weeks.map((w, i) => (
                <Cell
                  key={w.week}
                  fill={
                    i === index
                      ? "var(--term-accent)"
                      : w.avgFatigue < median * LOW_WEEK_RATIO
                        ? "color-mix(in srgb, var(--term-hardwood) 45%, var(--term-surface))"
                        : "var(--term-hardwood)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ScheduleWorkload({ season }: { season: string }) {
  const { data, error, isLoading } = useSWR<SeasonReportResponse>(
    `/api/season-report?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false },
  );
  return (
    <section className="flex flex-col gap-6" aria-busy={isLoading}>
      {error ? (
        <p role="status">
          Workload refresh unavailable
          {data ? "; showing the last loaded report." : ". Try again later."}
        </p>
      ) : null}
      {isLoading ? (
        <div
          className="h-24 bg-[var(--term-surface-2)]"
          aria-label="Loading schedule workload"
        />
      ) : null}
      {data && data.teams.length > 0 ? (
        <>
          <details className="fc-disclosure">
            <summary>Show travel and workload</summary>
            <div className="pt-4">
              <ScheduleTax teams={data.teams} basis={data.basis} />
            </div>
          </details>
          <FatigueCalendar key={season} weeks={data.weeks} />
        </>
      ) : !isLoading && !error ? (
        <p>No workload data for this season.</p>
      ) : null}
    </section>
  );
}
