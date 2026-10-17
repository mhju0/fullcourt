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
  it("opens on the games the page's rates count, home team rested, every gap, page 1", () => {
    const s = initExplore(null);
    expect(s).toMatchObject({ gap: "", side: "home", team: "", season: "", result: "all", page: 1 });
    expect(hasActiveFilters(s)).toBe(false);
  });

  it("seeds from a drill signal so the first render already shows the clicked range", () => {
    const s = initExplore({ gap: "large", token: 3 });
    expect(s).toMatchObject({ gap: "large", side: "home" });
    expect(exploreReducer(s, { type: "DRILL_APPLIED", gap: "large", token: 3 })).toBe(s);
  });
});

describe("filters", () => {
  const onPage4 = run(initExplore(null), { type: "PAGE_SHIFTED", delta: 1, totalPages: 9 },
    { type: "PAGE_SHIFTED", delta: 1, totalPages: 9 }, { type: "PAGE_SHIFTED", delta: 1, totalPages: 9 });

  it.each<[string, ExploreIntent]>([
    ["gap", { type: "GAP_SELECTED", gap: "medium" }],
    ["side", { type: "SIDE_SELECTED", side: "away" }],
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
      { type: "GAP_SELECTED", gap: "large" },
      { type: "SIDE_SELECTED", side: "either" },
      { type: "TEAM_SELECTED", team: "LAL" },
      { type: "SEASON_SELECTED", season: "2019-20" },
      { type: "RESULT_SELECTED", result: "incorrect" }
    );
    expect(hasActiveFilters(filtered)).toBe(true);

    const cleared = exploreReducer(filtered, { type: "FILTERS_CLEARED" });
    expect(hasActiveFilters(cleared)).toBe(false);
    expect(cleared).toMatchObject({ gap: "", side: "home", team: "", season: "", result: "all", page: 1 });
  });

  it("counts a side other than home as a filter, since home is where the explorer opens", () => {
    expect(hasActiveFilters(exploreReducer(initExplore(null), { type: "SIDE_SELECTED", side: "away" }))).toBe(true);
  });
});

describe("drill-down", () => {
  it("applies once per token, so a stale signal cannot fight a later change", () => {
    const drilled = exploreReducer(initExplore(null), {
      type: "DRILL_APPLIED",
      gap: "medium",
      token: 1,
    });
    expect(drilled.gap).toBe("medium");

    const cleared = exploreReducer(drilled, { type: "FILTERS_CLEARED" });
    // The same signal is still being passed down on every render.
    expect(exploreReducer(cleared, { type: "DRILL_APPLIED", gap: "medium", token: 1 })).toBe(cleared);
    expect(cleared.gap).toBe("");
  });

  it("re-applies when the same bar is clicked again, because the token moved", () => {
    const first = exploreReducer(initExplore(null), { type: "DRILL_APPLIED", gap: "large", token: 1 });
    const cleared = exploreReducer(first, { type: "FILTERS_CLEARED" });
    const second = exploreReducer(cleared, { type: "DRILL_APPLIED", gap: "large", token: 2 });
    expect(second.gap).toBe("large");
  });

  it("sets the home side as well as the range, so the rows are exactly the bar's games", () => {
    const visitors = exploreReducer(initExplore(null), { type: "SIDE_SELECTED", side: "away" });
    const drilled = exploreReducer(visitors, { type: "DRILL_APPLIED", gap: "small", token: 1 });
    expect(drilled).toMatchObject({ gap: "small", side: "home" });
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
  it("omits inactive filters so the URL stays the cache key, and always names the side", () => {
    expect(exploreSearchKey(initExplore(null), PAGE_SIZE)).toBe(
      "/api/games/search?side=home&page=1&limit=20"
    );
  });

  it("carries every active filter", () => {
    const s = run(initExplore(null),
      { type: "GAP_SELECTED", gap: "medium" },
      { type: "SIDE_SELECTED", side: "away" },
      { type: "TEAM_SELECTED", team: "BOS" },
      { type: "SEASON_SELECTED", season: "2023-24" },
      { type: "RESULT_SELECTED", result: "correct" },
      { type: "PAGE_SHIFTED", delta: 1, totalPages: 4 }
    );
    expect(exploreSearchKey(s, PAGE_SIZE)).toBe(
      "/api/games/search?gap=medium&side=away&team=BOS&season=2023-24&result=correct&page=2&limit=20"
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
