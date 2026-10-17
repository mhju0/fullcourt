/**
 * The Explore Games state machine, with no React in it.
 *
 * This is the second use of the shape `game-slate-machine.ts` proved. Explore
 * was carrying the construct that module was written to delete: eight
 * `useState` values, four of which had to be reset together, a chart drill-down
 * reconciled against a token, and the search URL and pagination arithmetic
 * assembled in the render body where no test could reach them.
 *
 * Two rules carry it:
 *
 * 1. **Any filter change resets to page 1.** Written once here, rather than in
 *    four `handleXChange` callbacks that each had to remember.
 * 2. **`page` is the only stored position; the page window is derived.**
 *    `pageWindow` computes total pages and the "showing X–Y of Z" range from
 *    `page` and the server's total, so those two cannot disagree.
 *
 * The result total lives outside the machine: it is the fetch's answer, not the
 * user's position, and storing it would mean a second source of truth for what
 * the URL already determines.
 */

import type { ExploreSide, GapRangeKey } from "@/lib/rest-advantage-evidence";

export type ExploreResult = "all" | "correct" | "incorrect";

/**
 * Where the explorer opens: the games the page's rates count, the rested team at home. A reader
 * who lands on 38,000 mixed rows under a rate measured on 27,000 has no way to tell the two
 * populations apart, which is how the bar click came to open different games from the bar.
 */
export const DEFAULT_SIDE: ExploreSide = "home";

/** A chart-bar click: the range it covers, and a token so a repeat click still applies. */
export type ExploreDrill = { gap: GapRangeKey; token: number };

export interface ExploreState {
  /** One gap range, or "" for every gap of 0.5 or more. */
  gap: GapRangeKey | "";
  side: ExploreSide;
  /** Team abbreviation, or "" for all. */
  team: string;
  /** Season label, or "" for all. */
  season: string;
  result: ExploreResult;
  page: number;
  /**
   * The chart-bar click already applied. Keyed on the token rather than the
   * range so a repeat click on the same bar still applies, and so a stale
   * signal never re-fires against a later dropdown change or CLEAR FILTERS.
   */
  appliedDrillToken: number;
  detailGameId: number | null;
  detailOpen: boolean;
}

/** What a user can do. This is the only surface the UI is given. */
export type ExploreIntent =
  | { type: "GAP_SELECTED"; gap: GapRangeKey | "" }
  | { type: "SIDE_SELECTED"; side: ExploreSide }
  | { type: "TEAM_SELECTED"; team: string }
  | { type: "SEASON_SELECTED"; season: string }
  | { type: "RESULT_SELECTED"; result: ExploreResult }
  | { type: "FILTERS_CLEARED" }
  /** `totalPages` comes from the fetch, so the clamp stays out of the JSX. */
  | { type: "PAGE_SHIFTED"; delta: -1 | 1; totalPages: number }
  /** A bar is a range of home-rested games, so a click sets both, exactly the bar's games. */
  | { type: "DRILL_APPLIED"; gap: GapRangeKey; token: number }
  | { type: "DETAIL_OPENED"; gameId: number }
  | { type: "DETAIL_CLOSED" };

export function initExplore(drill: ExploreDrill | null): ExploreState {
  return {
    gap: drill?.gap ?? "",
    side: DEFAULT_SIDE,
    team: "",
    season: "",
    result: "all",
    page: 1,
    appliedDrillToken: drill?.token ?? 0,
    detailGameId: null,
    detailOpen: false,
  };
}

/** Every filter change lands on page 1 — the old page number indexes a different result set. */
function filtered(state: ExploreState, change: Partial<ExploreState>): ExploreState {
  return { ...state, ...change, page: 1 };
}

/**
 * Pure. Every unhandled pair returns the same state by identity, including a
 * drill signal that has already been applied.
 */
export function exploreReducer(state: ExploreState, event: ExploreIntent): ExploreState {
  switch (event.type) {
    case "GAP_SELECTED":
      return filtered(state, { gap: event.gap });
    case "SIDE_SELECTED":
      return filtered(state, { side: event.side });
    case "TEAM_SELECTED":
      return filtered(state, { team: event.team });
    case "SEASON_SELECTED":
      return filtered(state, { season: event.season });
    case "RESULT_SELECTED":
      return filtered(state, { result: event.result });
    case "FILTERS_CLEARED":
      return filtered(state, { gap: "", side: DEFAULT_SIDE, team: "", season: "", result: "all" });
    case "DRILL_APPLIED":
      if (event.token === state.appliedDrillToken) return state;
      return filtered(state, { gap: event.gap, side: "home", appliedDrillToken: event.token });
    case "PAGE_SHIFTED": {
      const last = Math.max(1, event.totalPages);
      const next = Math.min(last, Math.max(1, state.page + event.delta));
      return next === state.page ? state : { ...state, page: next };
    }
    case "DETAIL_OPENED":
      return { ...state, detailGameId: event.gameId, detailOpen: true };
    case "DETAIL_CLOSED":
      return state.detailOpen || state.detailGameId !== null
        ? { ...state, detailGameId: null, detailOpen: false }
        : state;
  }
}

// ─── Selectors ───────────────────────────────────────────────────

/** The `/api/games/search` key. Absent filters are omitted, so the URL stays the cache key. */
export function exploreSearchKey(state: ExploreState, pageSize: number): string {
  const params = new URLSearchParams();
  if (state.gap) params.set("gap", state.gap);
  params.set("side", state.side);
  if (state.team) params.set("team", state.team);
  if (state.season) params.set("season", state.season);
  if (state.result !== "all") params.set("result", state.result);
  params.set("page", String(state.page));
  params.set("limit", String(pageSize));
  return `/api/games/search?${params}`;
}

export interface PageWindow {
  totalPages: number;
  /** 1-based, inclusive. Both are 0 when there is nothing to show. */
  start: number;
  end: number;
}

export function pageWindow(state: ExploreState, total: number, pageSize: number): PageWindow {
  if (total <= 0) return { totalPages: 0, start: 0, end: 0 };
  return {
    totalPages: Math.ceil(total / pageSize),
    start: (state.page - 1) * pageSize + 1,
    end: Math.min(state.page * pageSize, total),
  };
}

export function hasActiveFilters(state: ExploreState): boolean {
  return state.gap !== "" || state.side !== DEFAULT_SIDE || state.team !== "" || state.season !== "" || state.result !== "all";
}
