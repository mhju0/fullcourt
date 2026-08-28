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
 * Status is a single tagged value rather than four independent booleans. The
 * previous shape allowed `loadingDates && !loadingGames && errorDates && !errorGames`,
 * a real combination that rendered nothing under its own MATCHUPS header and had to
 * be patched with `errorGames ?? errorDates`. Here that state has no name, so it
 * cannot be reached.
 */

// ─── Value types ─────────────────────────────────────────────────

/** A game with the Realtime overlay already applied. */
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
}

// ─── Events ──────────────────────────────────────────────────────

/** What a user can do. This is the only surface the UI is given. */
export type SlateIntent =
  | { type: "SEASON_SELECTED"; season: string }
  | { type: "MONTH_SELECTED"; month: number }
  | { type: "DATE_SELECTED"; date: string }
  | { type: "DAY_SHIFTED"; delta: -1 | 1 };

/**
 * Load outcomes. Deliberately kept out of {@link SlateIntent} so the UI cannot
 * fabricate one — only the fetch effects dispatch these.
 */
export type SlateResolution =
  | { type: "DAYS_RESOLVED"; days: readonly GameDateCount[] }
  | { type: "DAYS_REJECTED"; message: string }
  | { type: "SLATE_RESOLVED"; date: string; games: readonly GameResponse[] }
  | { type: "SLATE_REJECTED"; date: string; message: string };

export type SlateEvent = SlateIntent | SlateResolution;

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
    selectedDate: null,
    games: [],
    message: null,
    fallbackMonth: args.fallbackMonth,
    todayKey: args.todayKey,
  };
}

// ─── Reducer ─────────────────────────────────────────────────────

const monthOf = (dateKey: string) => Number(dateKey.slice(5, 7));

/** Selecting a date always means "load that day", so both paths share this. */
function selectDate(state: SlateState, date: string): SlateState {
  return { ...state, status: "loadingSlate", selectedDate: date, games: [], message: null };
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
    case "SEASON_SELECTED": {
      if (event.season === state.season) return state;
      // A new season invalidates the day list, so there is nothing to keep.
      return {
        ...state,
        status: "loadingDays",
        season: event.season,
        days: [],
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

    case "DAYS_RESOLVED": {
      if (event.days.length === 0) {
        return { ...state, status: "noDays", days: [], selectedDate: null, games: [], message: null };
      }
      // A date the user already chose survives the day list arriving. Without this, a
      // deep jump (the EDGES AHEAD strip sends SEASON_SELECTED then DATE_SELECTED while
      // the season's days are still in flight) would be silently reverted to the default
      // date a moment later. Only a date the list actually contains is kept — anything
      // else falls through to the default pick.
      if (state.selectedDate && event.days.some((d) => d.date === state.selectedDate)) {
        return { ...state, days: event.days };
      }
      const next = pickDefaultGamesDate(state.todayKey, event.days);
      if (!next) {
        return { ...state, status: "noDays", days: event.days, selectedDate: null, games: [], message: null };
      }
      return { ...selectDate(state, next), days: event.days };
    }

    case "DAYS_REJECTED":
      return {
        ...state,
        status: "daysError",
        days: [],
        selectedDate: null,
        games: [],
        message: event.message,
      };

    case "SLATE_RESOLVED": {
      // Out-of-order guard the old code lacked: an in-flight response for a date
      // the user has already navigated away from is dropped, not rendered.
      if (event.date !== state.selectedDate) return state;
      return {
        ...state,
        status: event.games.length > 0 ? "slateReady" : "slateEmpty",
        games: event.games,
        message: null,
      };
    }

    case "SLATE_REJECTED": {
      if (event.date !== state.selectedDate) return state;
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

/**
 * The chip region has four renderings, not seven. Keeping this mapping here —
 * where it is total over `SlateStatus` — is what stops the caller writing the
 * exhaustive switch twice.
 */
export type CalendarView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "days" };

export function calendarView(state: SlateState): CalendarView {
  switch (state.status) {
    case "loadingDays":
      return { kind: "loading" };
    case "daysError":
      return { kind: "error", message: state.message ?? "Failed to load dates" };
    case "noDays":
      return { kind: "empty" };
    default:
      // Days are loaded; the month may still legitimately hold none of them.
      return daysInMonth(state).length > 0 ? { kind: "days" } : { kind: "empty" };
  }
}
