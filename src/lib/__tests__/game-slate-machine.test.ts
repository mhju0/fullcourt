import { describe, expect, it } from "vitest";
import {
  calendarView,
  daysInMonth,
  initSlate,
  monthTabs,
  slateMonth,
  slateReducer,
  type SlateState,
  type SlateStatus,
} from "@/lib/game-slate-machine";
import type { GameDateCount, GameResponse } from "@/types";

const day = (date: string, gameCount = 5): GameDateCount => ({ date, gameCount });

// Dec 2024 -> Jan 2025, so month- and year-crossing are both covered.
const DAYS: GameDateCount[] = [
  day("2024-10-22", 2),
  day("2024-12-25", 11),
  day("2024-12-31", 4),
  day("2025-01-01", 3),
  day("2025-01-15", 7),
];

const game = (id: number): GameResponse =>
  ({ id, date: "2024-12-25", season: "2024-25" }) as GameResponse;

function base(overrides: Partial<SlateState> = {}): SlateState {
  return {
    ...initSlate({ season: "2024-25", fallbackMonth: 10, todayKey: "2024-12-25" }),
    ...overrides,
  };
}

/** A state that has finished loading days and settled on 2024-12-25. */
function ready(overrides: Partial<SlateState> = {}): SlateState {
  return base({
    status: "slateReady",
    days: DAYS,
    selectedDate: "2024-12-25",
    games: [game(1)],
    ...overrides,
  });
}

describe("slateMonth — the month is derived, never stored", () => {
  it("follows the selected date", () => {
    expect(slateMonth(ready())).toBe(12);
    expect(slateMonth(ready({ selectedDate: "2025-01-15" }))).toBe(1);
  });

  it("falls back only while nothing is selected", () => {
    expect(slateMonth(base())).toBe(10);
  });

  // The regression that motivated the whole design: the old code stored `month`
  // beside `selectedDateKey` and reconciled them with a setState during render.
  // Here, shifting across a boundary moves the month with no extra event.
  it("crosses a month boundary on a day shift with no separate sync", () => {
    const afterShift = slateReducer(ready({ selectedDate: "2024-12-31" }), {
      type: "DAY_SHIFTED",
      delta: 1,
    });
    expect(afterShift.selectedDate).toBe("2025-01-01");
    expect(slateMonth(afterShift)).toBe(1);
  });

  it("crosses a year boundary backwards", () => {
    const back = slateReducer(ready({ selectedDate: "2025-01-01" }), {
      type: "DAY_SHIFTED",
      delta: -1,
    });
    expect(back.selectedDate).toBe("2024-12-31");
    expect(slateMonth(back)).toBe(12);
  });
});

describe("MONTH_SELECTED — resolves from memory, so nothing can revert it", () => {
  it("jumps to the month's first day with games and loads it", () => {
    const next = slateReducer(ready(), { type: "MONTH_SELECTED", month: 1 });
    expect(next.selectedDate).toBe("2025-01-01");
    expect(next.status).toBe("loadingSlate");
    // Never re-enters loadingDays: the day list is already in hand, which is what
    // removed the need for the old pendingSelectionResetRef handshake.
    expect(next.days).toBe(ready().days);
  });

  it("ignores a month the season never played", () => {
    const state = ready();
    expect(slateReducer(state, { type: "MONTH_SELECTED", month: 11 })).toBe(state);
  });

  it("ignores a click on the month already showing", () => {
    const state = ready();
    expect(slateReducer(state, { type: "MONTH_SELECTED", month: 12 })).toBe(state);
  });
});

describe("SLATE_RESOLVED / SLATE_REJECTED — stale responses are dropped", () => {
  it("applies a response for the selected date", () => {
    const next = slateReducer(base({ status: "loadingSlate", selectedDate: "2024-12-25" }), {
      type: "SLATE_RESOLVED",
      date: "2024-12-25",
      games: [game(1), game(2)],
    });
    expect(next.status).toBe("slateReady");
    expect(next.games).toHaveLength(2);
  });

  it("distinguishes a resolved-but-empty day from an error", () => {
    const next = slateReducer(base({ status: "loadingSlate", selectedDate: "2024-12-26" }), {
      type: "SLATE_RESOLVED",
      date: "2024-12-26",
      games: [],
    });
    expect(next.status).toBe("slateEmpty");
  });

  // The old code guarded only with AbortController; a response that landed after
  // the user moved on could still be applied.
  it("drops a response for a date the user already left", () => {
    const state = base({ status: "loadingSlate", selectedDate: "2025-01-15" });
    const stale = slateReducer(state, {
      type: "SLATE_RESOLVED",
      date: "2024-12-25",
      games: [game(9)],
    });
    expect(stale).toBe(state);
  });

  it("drops a stale rejection too", () => {
    const state = base({ status: "loadingSlate", selectedDate: "2025-01-15" });
    expect(
      slateReducer(state, { type: "SLATE_REJECTED", date: "2024-12-25", message: "boom" })
    ).toBe(state);
  });
});

describe("DAYS_RESOLVED / DAYS_REJECTED", () => {
  it("picks today when today has games", () => {
    const next = slateReducer(base(), { type: "DAYS_RESOLVED", days: DAYS });
    expect(next.selectedDate).toBe("2024-12-25");
    expect(next.status).toBe("loadingSlate");
    expect(slateMonth(next)).toBe(12);
  });

  it("picks the nearest day when today has none", () => {
    const next = slateReducer(base({ todayKey: "2024-12-28" }), {
      type: "DAYS_RESOLVED",
      days: DAYS,
    });
    expect(next.selectedDate).toBe("2024-12-31");
  });

  it("reports a season with no games rather than selecting nothing silently", () => {
    const next = slateReducer(base(), { type: "DAYS_RESOLVED", days: [] });
    expect(next.status).toBe("noDays");
    expect(next.selectedDate).toBeNull();
  });

  it("surfaces the failure message and clears the day list", () => {
    const next = slateReducer(base({ days: DAYS }), {
      type: "DAYS_REJECTED",
      message: "Failed to load dates",
    });
    expect(next.status).toBe("daysError");
    expect(next.message).toBe("Failed to load dates");
    expect(next.days).toHaveLength(0);
  });
});

describe("SEASON_SELECTED", () => {
  it("invalidates the day list and the position", () => {
    const next = slateReducer(ready(), { type: "SEASON_SELECTED", season: "2023-24" });
    expect(next.status).toBe("loadingDays");
    expect(next.season).toBe("2023-24");
    expect(next.days).toHaveLength(0);
    expect(next.selectedDate).toBeNull();
    expect(next.games).toHaveLength(0);
  });

  it("ignores a re-select of the current season", () => {
    const state = ready();
    expect(slateReducer(state, { type: "SEASON_SELECTED", season: "2024-25" })).toBe(state);
  });
});

describe("no-op events return the same state by identity", () => {
  it("shifts nothing when no date is selected", () => {
    const state = base();
    expect(slateReducer(state, { type: "DAY_SHIFTED", delta: 1 })).toBe(state);
  });

  it("ignores re-selecting the current date", () => {
    const state = ready();
    expect(slateReducer(state, { type: "DATE_SELECTED", date: "2024-12-25" })).toBe(state);
  });
});

describe("monthTabs", () => {
  it("counts days per month and marks months the season never played", () => {
    const tabs = monthTabs(ready());
    const byValue = Object.fromEntries(tabs.map((t) => [t.value, t]));
    expect(byValue[12].dayCount).toBe(2);
    expect(byValue[1].dayCount).toBe(2);
    expect(byValue[10].dayCount).toBe(1);
    // November is absent from DAYS, so its tab is knowably empty and can disable.
    expect(byValue[11].dayCount).toBe(0);
  });

  it("marks exactly one tab selected", () => {
    expect(monthTabs(ready()).filter((t) => t.isSelected)).toHaveLength(1);
  });
});

describe("daysInMonth", () => {
  it("returns only the derived month's days", () => {
    expect(daysInMonth(ready()).map((d) => d.date)).toEqual(["2024-12-25", "2024-12-31"]);
  });
});

describe("calendarView is total — the region can never render nothing", () => {
  const ALL: SlateStatus[] = [
    "loadingDays",
    "daysError",
    "noDays",
    "loadingSlate",
    "slateError",
    "slateEmpty",
    "slateReady",
  ];

  // This is the shape of the bug the old code carried: a failed dates fetch left
  // errorGames null and selectedDateKey null, so every branch was false and the
  // section rendered an empty body under its own header. It needed an
  // `errorGames ?? errorDates` patch. Here, every status maps to a rendering.
  it("maps every status to a kind", () => {
    for (const status of ALL) {
      const view = calendarView(ready({ status, message: "x" }));
      expect(["loading", "error", "empty", "days"]).toContain(view.kind);
    }
  });

  it("always carries a message when it reports an error", () => {
    const view = calendarView(base({ status: "daysError", message: null }));
    expect(view.kind).toBe("error");
    if (view.kind === "error") expect(view.message.length).toBeGreaterThan(0);
  });

  it("reports empty for a loaded month that holds no days", () => {
    // Reachable by shifting off the end of a month's games, e.g. into November.
    expect(calendarView(ready({ selectedDate: "2024-11-05" })).kind).toBe("empty");
  });
});
