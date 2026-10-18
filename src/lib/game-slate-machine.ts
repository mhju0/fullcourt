import { NBA_REGULAR_MONTHS, pickDefaultGamesDate, seasonMonthOrder } from "@/lib/nba-season";
import type { GameDateCount, GameResponse } from "@/types";

/**
 * The game-slate state machine, with no React in it.
 *
 * Two ideas carry the whole design, and between them they delete four pieces of
 * machinery the previous inline version needed:
 *
 * 1. **`selectedDate` is the only stored position.** The calendar month is a
 *    *derived* value ({@link slateMonth}), never assigned. The old code stored
 *    `month` alongside `selectedDateKey` and reconciled them with a setState
 *    during render; two values that must agree can disagree, and that block
 *    existed to paper over it. A derivation cannot disagree with itself.
 *
 * 2. **Days are fetched per season, not per month.** The old code fetched
 *    `?season=&month=`, so clicking a month tab meant a round trip — which is
 *    why it needed `pendingSelectionResetRef` to stop the month-sync block from
 *    reverting the click mid-flight, and `isFirstDatesFetchRef` to special-case
 *    the one fetch that deliberately omitted `month`. With the season's dates in
 *    memory a month click resolves synchronously, so there is no race to arbitrate
 *    and the monthless fetch stops being a special case: it is the only case.
 *
 * Calendar requests and selected-slate requests have separate lifecycles: an
 * explicit URL date can finish loading before its season's calendar does.
 */

// ─── Value types ─────────────────────────────────────────────────

/** An authoritative game response with an optional score-change flash. */
export type SlateGame = GameResponse & { isScoreFlashing: boolean };

/** One day chip. Formatting is done here so callers never touch date-fns. */
export interface SlateDay {
  date: string;
  /** "25" */
  dayOfMonth: string;
  gameCount: number;
  /** "December 25, 2024" */
  label: string;
  /** "December 25, 2024, 11 games" */
  ariaLabel: string;
  isSelected: boolean;
}

/** One month tab. `dayCount` is 0 for months this season never played in. */
export interface MonthTab {
  value: number;
  /** "DEC" */
  label: string;
  dayCount: number;
  isSelected: boolean;
}

export type SlateStatus =
  | "loadingDays"
  | "daysError"
  | "noDays"
  | "loadingSlate"
  | "slateError"
  | "slateEmpty"
  | "slateReady";

// ─── State ───────────────────────────────────────────────────────

export interface SlateState {
  status: SlateStatus;
  /** The fetch key for the day list. Stored, because it is needed while no date exists. */
  season: string;
  /** Every day with games in `season`, all months, ascending. */
  days: readonly GameDateCount[];
  daysStatus: "loading" | "ready" | "error";
  daysMessage: string | null;
  /** Changes only when the calendar request is replaced, including A → B → A. */
  daysGeneration: number;
  /** The only stored position. `slateMonth` derives the month tab from it. */
  selectedDate: string | null;
  games: readonly GameResponse[];
  /** Non-null only for `daysError` / `slateError`. */
  message: string | null;
  /**
   * The month shown before any date exists. Captured once at init and never
   * written again — a constant, not state, so it cannot drift out of sync.
   */
  readonly fallbackMonth: number;
  /** "Today" in the NBA's Eastern calendar, frozen at init. */
  readonly todayKey: string;
  /** Retries the selected slate without restarting its season calendar request. */
  attempt: number;
  generation: number;
  refreshStatus: "idle" | "refreshing" | "error";
  refreshMessage: string | null;
  checkedAt: number | null;
}

// ─── Events ──────────────────────────────────────────────────────

/** What a user can do. This is the only surface the UI is given. */
export type SlateIntent =
  | { type: "SEASON_SELECTED"; season: string }
  | { type: "MONTH_SELECTED"; month: number }
  | { type: "DATE_SELECTED"; date: string }
  | { type: "DAY_SHIFTED"; delta: -1 | 1 }
  | { type: "WEEK_SHIFTED"; delta: -1 | 1 }
  | { type: "RETRY_REQUESTED" };

/**
 * Load outcomes. Deliberately kept out of {@link SlateIntent} so the UI cannot
 * fabricate one — only the fetch effects dispatch these.
 */
export type SlateResolution =
  | { type: "DAYS_RESOLVED"; season: string; generation: number; days: readonly GameDateCount[] }
  | { type: "DAYS_REJECTED"; season: string; generation: number; message: string }
  | { type: "SLATE_RESOLVED"; date: string; games: readonly GameResponse[]; generation?: number; checkedAt?: number }
  | { type: "SLATE_REJECTED"; date: string; message: string; generation?: number; background?: boolean };

export type SlateEvent = SlateIntent | SlateResolution
  | { type: "SLATE_REFRESH_STARTED"; date: string; generation: number }
  | { type: "LOCATION_RESTORED"; season: string; date: string | null };

// ─── Init ────────────────────────────────────────────────────────

export function initSlate(args: {
  season: string;
  fallbackMonth: number;
  todayKey: string;
}): SlateState {
  return {
    status: "loadingDays",
    season: args.season,
    days: [],
    daysStatus: "loading",
    daysMessage: null,
    daysGeneration: 0,
    selectedDate: null,
    games: [],
    message: null,
    fallbackMonth: args.fallbackMonth,
    todayKey: args.todayKey,
    attempt: 0,
    generation: 0,
    refreshStatus: "idle",
    refreshMessage: null,
    checkedAt: null,
  };
}

// ─── Reducer ─────────────────────────────────────────────────────

const monthOf = (dateKey: string) => Number(dateKey.slice(5, 7));

/** Selecting a date always means "load that day", so both paths share this. */
function selectDate(state: SlateState, date: string): SlateState {
  return { ...state, status: "loadingSlate", selectedDate: date, games: [], message: null, generation: state.generation + 1, refreshStatus: "idle", refreshMessage: null, checkedAt: null };
}

function shiftDateKey(dateKey: string, delta: number): string {
  // UTC noon keeps the arithmetic away from DST, matching how the rest of the app
  // anchors a bare date key before handing it to date-fns.
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure. Every unhandled (state, event) pair returns the same state by identity —
 * React fires clicks from controls that were disabled a frame earlier, and a
 * machine that throws on those is a worse bug than one that ignores them.
 */
export function slateReducer(state: SlateState, event: SlateEvent): SlateState {
  switch (event.type) {
    case "LOCATION_RESTORED": {
      if (event.season !== state.season) {
        const next = {
          ...initSlate({ ...state, season: event.season }),
          generation: state.generation + 1,
          daysGeneration: state.daysGeneration + 1,
        };
        return event.date ? selectDate(next, event.date) : next;
      }
      if (event.date === state.selectedDate) return state;
      if (event.date) return selectDate(state, event.date);
      const next: SlateState = {
        ...state,
        status: state.daysStatus === "error" ? "daysError" : "loadingDays",
        selectedDate: null,
        games: [],
        message: state.daysMessage,
        generation: state.generation + 1,
        refreshStatus: "idle",
        refreshMessage: null,
        checkedAt: null,
      };
      return state.daysStatus === "ready"
        ? slateReducer(next, { type: "DAYS_RESOLVED", season: state.season, generation: state.daysGeneration, days: state.days })
        : next;
    }

    case "SEASON_SELECTED": {
      if (event.season === state.season) return state;
      // A new season invalidates the day list, so there is nothing to keep.
      return {
        ...state,
        status: "loadingDays",
        season: event.season,
        generation: state.generation + 1,
        refreshStatus: "idle",
        refreshMessage: null,
        checkedAt: null,
        days: [],
        daysStatus: "loading",
        daysMessage: null,
        daysGeneration: state.daysGeneration + 1,
        selectedDate: null,
        games: [],
        message: null,
      };
    }

    case "MONTH_SELECTED": {
      // Resolves from memory: no fetch, so nothing can arrive later and revert it.
      const first = state.days.find((d) => monthOf(d.date) === event.month);
      if (!first) return state; // months with no games are disabled in the UI
      if (first.date === state.selectedDate) return state;
      return selectDate(state, first.date);
    }

    case "DATE_SELECTED": {
      if (event.date === state.selectedDate) return state;
      return selectDate(state, event.date);
    }

    case "DAY_SHIFTED": {
      if (!state.selectedDate) return state;
      // Crossing a month boundary needs no special handling: the month is derived
      // from this date, so the tab strip follows on the next render by definition.
      return selectDate(state, shiftDateKey(state.selectedDate, event.delta));
    }

    case "WEEK_SHIFTED": {
      if (!state.selectedDate) return state;
      // Same weekday when it has games; otherwise the first day of that week that does, so a
      // week step lands on a slate rather than on an empty day whenever the week has one.
      const target = shiftDateKey(state.selectedDate, event.delta * 7);
      const played = new Set(state.days.map((d) => d.date));
      const next = played.has(target)
        ? target
        : weekDateKeys(target).find((date) => played.has(date)) ?? target;
      return selectDate(state, next);
    }

    case "RETRY_REQUESTED": {
      const daysFailed = state.daysStatus === "error";
      const slateFailed = state.status === "slateError";
      if (!daysFailed && !slateFailed) return state;
      return {
        ...state,
        daysStatus: daysFailed ? "loading" : state.daysStatus,
        daysMessage: daysFailed ? null : state.daysMessage,
        daysGeneration: state.daysGeneration + Number(daysFailed),
        status: slateFailed ? "loadingSlate" : !state.selectedDate ? "loadingDays" : state.status,
        message: null,
        attempt: state.attempt + Number(slateFailed),
        generation: state.generation + Number(slateFailed),
      };
    }

    case "DAYS_RESOLVED": {
      if (event.season !== state.season || event.generation !== state.daysGeneration) return state;
      const nextState: SlateState = { ...state, daysStatus: "ready", daysMessage: null, days: event.days };
      // Explicit selections include no-game days and survive late calendar responses.
      if (state.selectedDate) return nextState;
      const next = pickDefaultGamesDate(state.todayKey, event.days);
      if (!next) {
        return { ...nextState, status: "noDays", selectedDate: null, games: [], message: null };
      }
      return selectDate(nextState, next);
    }

    case "DAYS_REJECTED": {
      if (event.season !== state.season || event.generation !== state.daysGeneration) return state;
      return {
        ...state,
        daysStatus: "error",
        daysMessage: event.message,
        days: [],
        status: state.selectedDate ? state.status : "daysError",
        message: state.selectedDate ? state.message : event.message,
      };
    }

    case "SLATE_REFRESH_STARTED": {
      if (event.date !== state.selectedDate || event.generation !== state.generation) return state;
      return { ...state, refreshStatus: "refreshing" };
    }

    case "SLATE_RESOLVED": {
      // Out-of-order guard the old code lacked: an in-flight response for a date
      // the user has already navigated away from is dropped, not rendered.
      if (event.date !== state.selectedDate || (event.generation !== undefined && event.generation !== state.generation)) return state;
      return {
        ...state,
        status: event.games.length > 0 ? "slateReady" : "slateEmpty",
        games: event.games,
        message: null,
        refreshStatus: "idle",
        refreshMessage: null,
        checkedAt: event.checkedAt ?? state.checkedAt,
      };
    }

    case "SLATE_REJECTED": {
      if (event.date !== state.selectedDate || (event.generation !== undefined && event.generation !== state.generation)) return state;
      if (event.background) return { ...state, refreshStatus: "error", refreshMessage: event.message };
      return { ...state, status: "slateError", games: [], message: event.message };
    }
  }
}

// ─── Selectors ───────────────────────────────────────────────────

/** The active month tab. Derived, never stored — this is the whole trick. */
export function slateMonth(state: SlateState): number {
  return state.selectedDate ? monthOf(state.selectedDate) : state.fallbackMonth;
}

/** Days belonging to the derived month. */
export function daysInMonth(state: SlateState): readonly GameDateCount[] {
  const month = slateMonth(state);
  return state.days.filter((d) => monthOf(d.date) === month);
}

/** The Sunday-to-Saturday week holding `dateKey`, as seven date keys. */
function weekDateKeys(dateKey: string): string[] {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(dateKey, i - weekday));
}

function withCounts(state: SlateState, dates: readonly string[]): GameDateCount[] {
  const counts = new Map(state.days.map((d) => [d.date, d.gameCount]));
  return dates.map((date) => ({ date, gameCount: counts.get(date) ?? 0 }));
}

/**
 * The week strip a phone shows instead of the full date row: seven days around the selected
 * date. Unlike {@link daysInMonth} it includes days with no games, at a count of 0, because a
 * week with holes in it cannot be read as a week.
 */
export function weekDays(state: SlateState): readonly GameDateCount[] {
  return state.daysStatus === "ready" && state.selectedDate ? withCounts(state, weekDateKeys(state.selectedDate)) : [];
}

/**
 * Every calendar day of the selected date's month, for the phone's month grid. `leadingBlanks`
 * is how many cells precede the 1st in a Sunday-first grid.
 */
export function monthCalendar(state: SlateState): { leadingBlanks: number; days: readonly GameDateCount[] } {
  if (state.daysStatus !== "ready" || !state.selectedDate) return { leadingBlanks: 0, days: [] };
  const prefix = state.selectedDate.slice(0, 8);
  const first = `${prefix}01`;
  const dates: string[] = [];
  for (let date = first; date.startsWith(prefix); date = shiftDateKey(date, 1)) dates.push(date);
  return { leadingBlanks: new Date(`${first}T12:00:00Z`).getUTCDay(), days: withCounts(state, dates) };
}

/**
 * Month tabs with their day counts. A season-wide day list means we know which
 * months were never played (1998-99, 2011-12 lockouts), so those tabs disable
 * instead of round-tripping to an empty result.
 *
 * Months outside the ordinary Oct-Apr span appear only when that season played in them, which
 * is why they are read off the days rather than listed as constants: 2020-21 needs a May tab
 * for its 135 games and 2019-20 needs Jul through Oct, while the other 38 seasons would show
 * five permanently-empty tabs if the union were hardcoded.
 */
export function monthTabs(state: SlateState): MonthTab[] {
  const selected = slateMonth(state);
  const core = new Set(NBA_REGULAR_MONTHS.map((m) => m.value));
  const extra = [...new Set(state.days.map((d) => monthOf(d.date)))]
    .filter((m) => !core.has(m))
    .sort((a, b) => seasonMonthOrder(a) - seasonMonthOrder(b))
    .map((value) => ({ value, label: MONTH_LABELS[value - 1] }));

  return [...NBA_REGULAR_MONTHS, ...extra].map(({ value, label }) => ({
    value,
    label,
    dayCount: state.days.filter((d) => monthOf(d.date) === value).length,
    isSelected: value === selected,
  }));
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type CalendarView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "days" };

export function calendarView(state: SlateState): CalendarView {
  switch (state.daysStatus) {
    case "loading":
      return { kind: "loading" };
    case "error":
      return { kind: "error", message: state.daysMessage ?? "Failed to load dates" };
    case "ready":
      return daysInMonth(state).length > 0 ? { kind: "days" } : { kind: "empty" };
  }
}
