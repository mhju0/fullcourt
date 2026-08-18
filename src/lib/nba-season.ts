import { endOfMonth, format, startOfMonth } from "date-fns";

/**
 * Seasons the app and ingest pipeline support.
 *
 * Every season that has been played, 2019-20 included. It was omitted here until 2026-07-30,
 * which took the ~970 games played normally before the March 2020 suspension with it and cost
 * Player Shooting a season because Schedule Edge could not rank one. What a given surface may
 * use is now decided per surface: `ABNORMAL_STRETCHES` (season-regime.ts) drops the bubble
 * games from every model, and {@link rankableSeasons} withholds seasons whose teams played
 * unequal numbers of games from the one module that ranks them.
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
    out.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return out;
})();

export type NbaSeasonLabel = (typeof NBA_SEASONS)[number];

/**
 * The months every season gets a tab for, in tab order.
 *
 * Oct-Apr is the ordinary span, and these are shown even when empty so a lockout's missing
 * months read as disabled rather than vanishing. Seasons that overrun it — 2020-21 into May,
 * 2019-20 into October 2020 — get their extra months appended by `monthTabs`, which only shows
 * a month outside this list when games were actually played in it.
 */
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
 * The months a regular season *typically* occupies: October 1 through April 30.
 *
 * **Typically, not actually.** Seasons overrun this window — 2020-21 ran to 16 May, 1998-99 to
 * 5 May, and 2019-20 to 11 October 2020 — so this is a rule of thumb about the NBA calendar and
 * nothing may filter games by it. Its one job is telling {@link isNbaOffSeason} roughly when
 * basketball is not being played.
 *
 * It used to describe itself as the project's single season-regime policy, and was used as one.
 * That was wrong twice over: it excluded the 2019-20 bubble only by coincidence of dates, and it
 * silently dropped 179 legitimate games from the seasons that overran it. Which games a model
 * may read is now `season-regime.ts`, which names the abnormal stretches instead of guessing at
 * them from the calendar.
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

/**
 * Season-calendar ordering for a month: October first through September last.
 *
 * Not the calendar-year order. A season's May comes after its January, so sorting by month
 * number would file the overrun months at the front of the season they end.
 */
export function seasonMonthOrder(month: number): number {
  return month >= 10 ? month - 10 : month + 2;
}

/** Default month tab: current ET month if Oct–Apr, else October (off-season). */
export function defaultNbaCalendarMonth(): number {
  const m = Number(formatEasternDateKey().slice(5, 7));
  if (NBA_REGULAR_MONTHS.some((x) => x.value === m)) return m;
  return 10;
}

/**
 * The season a schedule-facing surface opens on: the newest one {@link browsableSeasons} offers.
 *
 * Deliberately not `currentDisplaySeason()`, and not the last entry of `NBA_SEASONS`. Between a
 * schedule release and October 1 both of those name the season that has just *ended*, so on the
 * day the NBA publishes the next calendar the Games board opened on last season's results and
 * the new slate was reachable only by changing the dropdown. Deriving it from the browsable list
 * instead means the board follows the release with no dated special case of its own: through
 * August and September it is the upcoming season, and from October 1 that same season is simply
 * the current one, because `NBA_SEASONS` has rolled over by then.
 *
 * Surfaces that *count* evidence rather than browse it still read `NBA_SEASONS` — the two
 * meanings are separate on purpose, and {@link browsableSeasons} says why.
 */
export function defaultNbaSeason(todayKey: string = formatEasternDateKey()): NbaSeasonLabel {
  const seasons = browsableSeasons(todayKey);
  return seasons[seasons.length - 1];
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
