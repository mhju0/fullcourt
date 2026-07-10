import { endOfMonth, format, startOfMonth } from "date-fns";

/**
 * Seasons the app and ingest pipeline support (2019-20 bubble omitted).
 * 1985-86 … latest supported/current NBA season.
 * Oldest → newest for stable sort; UI often reverses for “latest first” dropdowns.
 */
export const NBA_SEASONS: readonly string[] = (() => {
  const now = new Date();
  const currentSeasonStart = now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  const latestSupportedStart = Math.max(2025, currentSeasonStart);
  const out: string[] = [];
  for (let y = 1985; y <= latestSupportedStart; y++) {
    if (y === 2019) continue;
    out.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return out;
})();

export type NbaSeasonLabel = (typeof NBA_SEASONS)[number];

/** Regular-season calendar months (Oct–Apr) in tab order. */
export const NBA_REGULAR_MONTHS: readonly { value: number; label: string }[] = [
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
] as const;

const SEASON_RE = /^(\d{4})-\d{2}$/;

/**
 * First calendar year of an NBA season label (e.g. "2024-25" → 2024).
 */
export function parseSeasonStartYear(season: string): number {
  const m = season.match(SEASON_RE);
  if (!m) {
    throw new Error(`Invalid season label: ${season}`);
  }
  return parseInt(m[1], 10);
}

/**
 * Regular season spans Oct 1 (start year) through Apr 30 (start year + 1).
 */
export function regularSeasonDateBounds(season: string): { from: string; to: string } {
  const y = parseSeasonStartYear(season);
  return { from: `${y}-10-01`, to: `${y + 1}-04-30` };
}

/** Local calendar date as YYYY-MM-DD. Avoids UTC shifts from Date#toISOString(). */
export function formatLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function seasonLabelForDateKey(dateKey: string): string {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/**
 * Calendar year for a month tab within an NBA season (Oct–Dec → start year; Jan–Apr → start+1).
 */
export function calendarYearForSeasonMonth(season: string, month: number): number {
  const y = parseSeasonStartYear(season);
  if (month >= 10) return y;
  return y + 1;
}

/** First and last calendar dates for a month in season context. */
export function monthCalendarBounds(season: string, month: number): { from: string; to: string } {
  const year = calendarYearForSeasonMonth(season, month);
  const anchor = new Date(year, month - 1, 1);
  return {
    from: format(startOfMonth(anchor), "yyyy-MM-dd"),
    to: format(endOfMonth(anchor), "yyyy-MM-dd"),
  };
}

/** Intersection of two inclusive YYYY-MM-DD ranges; null if empty. */
export function intersectDateBounds(
  a: { from: string; to: string },
  b: { from: string; to: string }
): { from: string; to: string } | null {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  if (from > to) return null;
  return { from, to };
}

/** Default month tab: current month if Oct–Apr, else October (off-season). */
export function defaultNbaCalendarMonth(): number {
  const m = new Date().getMonth() + 1;
  if (NBA_REGULAR_MONTHS.some((x) => x.value === m)) return m;
  return 10;
}

export function defaultNbaSeason(): NbaSeasonLabel {
  const localSeason = seasonLabelForDateKey(formatLocalDateKey());
  if (NBA_SEASONS.includes(localSeason)) return localSeason as NbaSeasonLabel;
  return NBA_SEASONS[NBA_SEASONS.length - 1];
}

/**
 * Season to show as "current" for nav/labels/defaults: the in-progress season
 * while it's running (Oct–Apr), the most recently completed one otherwise.
 * Unlike `defaultNbaSeason`, not clamped to `NBA_SEASONS` — takes an explicit
 * date so callers (and tests) aren't tied to the real wall clock.
 */
export function currentDisplaySeason(todayKey: string = formatLocalDateKey()): string {
  return seasonLabelForDateKey(todayKey);
}

/** Season label immediately following the given one (e.g. "2025-26" → "2026-27"). */
export function nextSeasonLabel(season: string): string {
  const nextStartYear = parseSeasonStartYear(season) + 1;
  return `${nextStartYear}-${String(nextStartYear + 1).slice(-2)}`;
}

/** True between the end of the most recently completed regular season and the start of the next. */
export function isNbaOffSeason(todayKey: string = formatLocalDateKey()): boolean {
  const season = currentDisplaySeason(todayKey);
  const bounds = regularSeasonDateBounds(season);
  const nextBounds = regularSeasonDateBounds(nextSeasonLabel(season));
  return todayKey < bounds.from || (todayKey > bounds.to && todayKey < nextBounds.from);
}

export function pickDefaultGamesDate(
  todayKey: string,
  availableDates: readonly { date: string }[]
): string | null {
  const dates = Array.from(new Set(availableDates.map((d) => d.date))).sort();
  if (dates.length === 0) return null;

  if (dates.includes(todayKey)) return todayKey;

  const todayMonth = Number(todayKey.slice(5, 7));
  if (todayMonth === 10) {
    const octoberDates = dates.filter((date) => date.slice(5, 7) === "10");
    if (octoberDates.length > 0) {
      return octoberDates.find((date) => date >= todayKey) ?? octoberDates[0];
    }
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  if (todayKey <= firstDate) return firstDate;
  if (todayKey >= lastDate) return lastDate;

  return dates.find((date) => date >= todayKey) ?? lastDate;
}
