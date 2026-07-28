/**
 * Explore's transitions, previously reachable only through a rendered page.
 *
 * The cases that matter are the ones the inline version had to remember by hand:
 * every filter change resets the page, a drill signal applies once per token,
 * and the page window never disagrees with the page.
 */
import { describe, expect, it } from "vitest";
import {
  exploreReducer,
  exploreSearchKey,
  hasActiveFilters,
  initExplore,
  pageWindow,
  type ExploreIntent,
  type ExploreState,
} from "@/lib/explore-games-machine";

const PAGE_SIZE = 20;

function run(state: ExploreState, ...events: ExploreIntent[]): ExploreState {
  return events.reduce(exploreReducer, state);
}

describe("initExplore", () => {
  it("starts unfiltered on page 1", () => {
    const s = initExplore(null);
    expect(s).toMatchObject({ minRA: 0, team: "", season: "", result: "all", page: 1 });
    expect(hasActiveFilters(s)).toBe(false);
  });

  it("seeds from a drill signal so the first render already shows the clicked threshold", () => {
    const s = initExplore({ threshold: 5, token: 3 });
    expect(s.minRA).toBe(5);
    expect(exploreReducer(s, { type: "DRILL_APPLIED", threshold: 5, token: 3 })).toBe(s);
  });
});

describe("filters", () => {
  const onPage4 = run(initExplore(null), { type: "PAGE_SHIFTED", delta: 1, totalPages: 9 },
    { type: "PAGE_SHIFTED", delta: 1, totalPages: 9 }, { type: "PAGE_SHIFTED", delta: 1, totalPages: 9 });

  it.each<[string, ExploreIntent]>([
    ["rest advantage", { type: "MIN_RA_SELECTED", minRA: 5 }],
    ["team", { type: "TEAM_SELECTED", team: "BOS" }],
    ["season", { type: "SEASON_SELECTED", season: "2023-24" }],
    ["result", { type: "RESULT_SELECTED", result: "correct" }],
    ["clear", { type: "FILTERS_CLEARED" }],
  ])("returns to page 1 when the %s filter changes", (_label, event) => {
    expect(onPage4.page).toBe(4);
    expect(exploreReducer(onPage4, event).page).toBe(1);
  });

  it("clears every filter at once", () => {
    const filtered = run(initExplore(null),
      { type: "MIN_RA_SELECTED", minRA: 7 },
      { type: "TEAM_SELECTED", team: "LAL" },
      { type: "SEASON_SELECTED", season: "2019-20" },
      { type: "RESULT_SELECTED", result: "incorrect" }
    );
    expect(hasActiveFilters(filtered)).toBe(true);

    const cleared = exploreReducer(filtered, { type: "FILTERS_CLEARED" });
    expect(hasActiveFilters(cleared)).toBe(false);
    expect(cleared).toMatchObject({ minRA: 0, team: "", season: "", result: "all", page: 1 });
  });
});

describe("drill-down", () => {
  it("applies once per token, so a stale signal cannot fight a later change", () => {
    const drilled = exploreReducer(initExplore(null), {
      type: "DRILL_APPLIED",
      threshold: 5,
      token: 1,
    });
    expect(drilled.minRA).toBe(5);

    const cleared = exploreReducer(drilled, { type: "FILTERS_CLEARED" });
    // The same signal is still being passed down on every render.
    expect(exploreReducer(cleared, { type: "DRILL_APPLIED", threshold: 5, token: 1 })).toBe(cleared);
    expect(cleared.minRA).toBe(0);
  });

  it("re-applies when the same bar is clicked again, because the token moved", () => {
    const first = exploreReducer(initExplore(null), { type: "DRILL_APPLIED", threshold: 5, token: 1 });
    const cleared = exploreReducer(first, { type: "FILTERS_CLEARED" });
    const second = exploreReducer(cleared, { type: "DRILL_APPLIED", threshold: 5, token: 2 });
    expect(second.minRA).toBe(5);
  });
});

describe("paging", () => {
  it("clamps to the available pages in both directions", () => {
    const start = initExplore(null);
    expect(exploreReducer(start, { type: "PAGE_SHIFTED", delta: -1, totalPages: 5 })).toBe(start);

    const last = run(start, ...Array.from({ length: 9 }, () => ({
      type: "PAGE_SHIFTED" as const, delta: 1 as const, totalPages: 3,
    })));
    expect(last.page).toBe(3);
    expect(exploreReducer(last, { type: "PAGE_SHIFTED", delta: 1, totalPages: 3 })).toBe(last);
  });

  it("never advances past an empty result set", () => {
    const start = initExplore(null);
    expect(exploreReducer(start, { type: "PAGE_SHIFTED", delta: 1, totalPages: 0 })).toBe(start);
  });
});

describe("pageWindow", () => {
  it("reports the 1-based inclusive range shown", () => {
    const p2 = exploreReducer(initExplore(null), { type: "PAGE_SHIFTED", delta: 1, totalPages: 3 });
    expect(pageWindow(p2, 45, PAGE_SIZE)).toEqual({ totalPages: 3, start: 21, end: 40 });
  });

  it("stops the last page's end at the total", () => {
    const p3 = run(initExplore(null),
      { type: "PAGE_SHIFTED", delta: 1, totalPages: 3 },
      { type: "PAGE_SHIFTED", delta: 1, totalPages: 3 }
    );
    expect(pageWindow(p3, 45, PAGE_SIZE)).toEqual({ totalPages: 3, start: 41, end: 45 });
  });

  it("shows nothing rather than 1–0 of 0", () => {
    expect(pageWindow(initExplore(null), 0, PAGE_SIZE)).toEqual({ totalPages: 0, start: 0, end: 0 });
  });
});

describe("exploreSearchKey", () => {
  it("omits inactive filters so the URL stays the cache key", () => {
    expect(exploreSearchKey(initExplore(null), PAGE_SIZE)).toBe(
      "/api/games/search?page=1&limit=20"
    );
  });

  it("carries every active filter", () => {
    const s = run(initExplore(null),
      { type: "MIN_RA_SELECTED", minRA: 5 },
      { type: "TEAM_SELECTED", team: "BOS" },
      { type: "SEASON_SELECTED", season: "2023-24" },
      { type: "RESULT_SELECTED", result: "correct" },
      { type: "PAGE_SHIFTED", delta: 1, totalPages: 4 }
    );
    expect(exploreSearchKey(s, PAGE_SIZE)).toBe(
      "/api/games/search?minRA=5&team=BOS&season=2023-24&result=correct&page=2&limit=20"
    );
  });
});

describe("detail modal", () => {
  it("keeps the open flag and the game id in step", () => {
    const opened = exploreReducer(initExplore(null), { type: "DETAIL_OPENED", gameId: 42 });
    expect(opened).toMatchObject({ detailGameId: 42, detailOpen: true });

    const closed = exploreReducer(opened, { type: "DETAIL_CLOSED" });
    expect(closed).toMatchObject({ detailGameId: null, detailOpen: false });
    expect(exploreReducer(closed, { type: "DETAIL_CLOSED" })).toBe(closed);
  });

  it("does not disturb the filters or the page", () => {
    const filtered = run(initExplore(null),
      { type: "TEAM_SELECTED", team: "BOS" },
      { type: "PAGE_SHIFTED", delta: 1, totalPages: 5 }
    );
    const opened = exploreReducer(filtered, { type: "DETAIL_OPENED", gameId: 7 });
    expect(opened.page).toBe(2);
    expect(opened.team).toBe("BOS");
  });
});
