import { endOfMonth, format, startOfMonth } from "date-fns";

/**
 * Seasons the app and ingest pipeline support.
 *
 * 2019-20 is omitted **entirely** — not merely its bubble games. Teams had played 63-67 of
 * 82 before the March 2020 suspension, so roughly 970 normally-travelled games go with it.
 * That is deliberate: a truncated season where teams played different game counts cannot be
 * ranked at season grain, which is what Schedule Edge does, and the game-level gain would be
 * about 2.5% of the backtest. 2020-21 IS included (72 games, condensed).
 * 1985-86 … latest supported/current NBA season.
 * Oldest → newest for stable sort; UI often reverses for “latest first” dropdowns.
 *
 * This list means **"seasons with data"**. It is what `NBA_SEASONS.length` counts in the
 * "N-SEASON BACKTEST" claims (`src/app/page.tsx`, `src/app/opengraph-image.tsx`), so it must
 * never include a season that has not been played. To offer an upcoming season for browsing
 * before it starts, use {@link browsableSeasons} instead — see its comment for why the two
 * meanings are separate.
 */
export const NBA_SEASONS: readonly string[] = (() => {
  // ET calendar (the NBA's scheduling day) — formatEasternDateKey isn't declared yet here.
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })
    .format(new Date())
    .split("-")
    .map(Number);
  const currentSeasonStart = m >= 10 ? y : y - 1;
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
/**
 * The calendar window a season's regular-season games occupy: October 1 through April 30.
 *
 * This is the project's single **season-regime policy** — the answer to "which games of a
 * season may a model read". It matters beyond tidiness because it is what separates a
 * normally-played stretch from an abnormal one inside the same season label: the 2019-20
 * Orlando bubble ran 30 Jul – 11 Oct 2020, so it falls outside this window and is excluded
 * by the same rule that drops mis-tagged May/June playoff dates.
 *
 * The rule was previously written twice — here in TypeScript and again by hand in SQL in
 * `db/queries.ts` — and applied to only some readers, which is how a policy decision ends up
 * enforced at ingest instead. Both expressions now derive from these two constants.
 */
export const REGULAR_SEASON_START_MONTH_DAY = "10-01";
export const REGULAR_SEASON_END_MONTH_DAY = "04-30";

export function regularSeasonDateBounds(season: string): { from: string; to: string } {
  const y = parseSeasonStartYear(season);
  return {
    from: `${y}-${REGULAR_SEASON_START_MONTH_DAY}`,
    to: `${y + 1}-${REGULAR_SEASON_END_MONTH_DAY}`,
  };
}

/** Local calendar date as YYYY-MM-DD. Avoids UTC shifts from Date#toISOString(). */
export function formatLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// en-CA renders as YYYY-MM-DD; America/New_York is the NBA's scheduling day.
const EASTERN_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * US/Eastern calendar date as YYYY-MM-DD — the app's "basketball today".
 * `games.date` stores ET dates, so every "what day is it" decision (today's
 * slate, season defaults, offseason detection, the cron's live window) must use
 * this rather than the viewer's or server's local timezone. A viewer in Seoul at
 * 11 AM sees the US evening slate still in progress, not tomorrow's empty day.
 */
export function formatEasternDateKey(date = new Date()): string {
  return EASTERN_DATE_FMT.format(date);
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

/** Default month tab: current ET month if Oct–Apr, else October (off-season). */
export function defaultNbaCalendarMonth(): number {
  const m = Number(formatEasternDateKey().slice(5, 7));
  if (NBA_REGULAR_MONTHS.some((x) => x.value === m)) return m;
  return 10;
}

export function defaultNbaSeason(): NbaSeasonLabel {
  const currentSeason = seasonLabelForDateKey(formatEasternDateKey());
  if (NBA_SEASONS.includes(currentSeason)) return currentSeason as NbaSeasonLabel;
  return NBA_SEASONS[NBA_SEASONS.length - 1];
}

/**
 * Season to show as "current" for nav/labels/defaults: the in-progress season
 * while it's running (Oct–Apr), the most recently completed one otherwise.
 * Unlike `defaultNbaSeason`, not clamped to `NBA_SEASONS` — takes an explicit
 * date so callers (and tests) aren't tied to the real wall clock.
 */
export function currentDisplaySeason(todayKey: string = formatEasternDateKey()): string {
  return seasonLabelForDateKey(todayKey);
}

/** Season label immediately following the given one (e.g. "2025-26" → "2026-27"). */
export function nextSeasonLabel(season: string): string {
  const nextStartYear = parseSeasonStartYear(season) + 1;
  return `${nextStartYear}-${String(nextStartYear + 1).slice(-2)}`;
}

/** ET months in which an unplayed upcoming season may be browsed (Aug 1 → Sep 30). */
const UPCOMING_SEASON_BROWSE_MONTHS = new Set([8, 9]);

/**
 * Seasons a schedule-facing surface may browse: {@link NBA_SEASONS} plus the upcoming season
 * during August and September.
 *
 * Why this is separate from `NBA_SEASONS` rather than an extension of it: that constant does
 * two jobs — gatekeeping which seasons may be requested, and counting how many seasons of
 * evidence back the headline claim. Those coincide until schedule-release day, when the next
 * season exists as *data* but not yet as *calendar*: `NBA_SEASONS` derives its upper bound from
 * the ET clock and does not roll over until October 1. Widening it would make the site
 * advertise an "N-season backtest" one season larger than the evidence, trading a data gap for
 * a false claim. So the browsing meaning gets its own list and the counting meaning keeps
 * `NBA_SEASONS`.
 *
 * The window closes on October 1 because `NBA_SEASONS` itself rolls over then — after that the
 * upcoming season is simply the current one and needs no special case. Between schedule release
 * and ingest the extra season has no rows yet; that is a normal empty state, not an error.
 */
export function browsableSeasons(todayKey: string = formatEasternDateKey()): readonly string[] {
  const month = Number(todayKey.slice(5, 7));
  if (!UPCOMING_SEASON_BROWSE_MONTHS.has(month)) return NBA_SEASONS;
  const latest = NBA_SEASONS[NBA_SEASONS.length - 1];
  return [...NBA_SEASONS, nextSeasonLabel(latest)];
}

/** True between the end of the most recently completed regular season and the start of the next. */
export function isNbaOffSeason(todayKey: string = formatEasternDateKey()): boolean {
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
