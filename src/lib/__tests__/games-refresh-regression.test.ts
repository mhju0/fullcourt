import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { initSlate, slateReducer } from "@/lib/game-slate-machine";
import { buildGameStoryline } from "@/lib/game-storyline";
import { GameSlateRefreshNotice, GameSlateRefreshWarning, RefreshButton } from "@/components/game-slate-refresh-notice";
import { EdgesAhead } from "@/components/edges-ahead";
import type { GameResponse, UpcomingGameWithRA } from "@/types";

const { upcoming } = vi.hoisted(() => ({ upcoming: [] as UpcomingGameWithRA[] }));
vi.mock("swr", () => ({ default: () => ({ data: upcoming }) }));
const game = { id: 1, date: "2026-10-20", season: "2026-27" } as GameResponse;
const ready = () => ({ ...initSlate({ season: "2026-27", fallbackMonth: 10, todayKey: game.date }), selectedDate: game.date, status: "slateReady" as const, games: [game] });

describe("Games authoritative refresh regressions", () => {
  it("keeps the existing slate after a background refresh failure", () => {
    const state = ready();
    const result = slateReducer(state, { type: "SLATE_REJECTED", date: game.date, message: "offline", background: true } as Parameters<typeof slateReducer>[1]);
    expect(result.games).toBe(state.games);
    expect(result.status).toBe("slateReady");
    expect(result.refreshStatus).toBe("error");
  });
  it("retains the last response receipt time and table while refreshing or failing", () => {
    const loaded = slateReducer(ready(), { type: "SLATE_RESOLVED", date: game.date, generation: 0, checkedAt: 123, games: [game] });
    const refreshing = slateReducer(loaded, { type: "SLATE_REFRESH_STARTED", date: game.date, generation: 0 });
    expect(refreshing.games).toBe(loaded.games);
    expect(refreshing.status).toBe("slateReady");
    expect(refreshing.checkedAt).toBe(123);
    const failed = slateReducer(refreshing, { type: "SLATE_REJECTED", date: game.date, generation: 0, background: true, message: "offline" });
    expect(failed.checkedAt).toBe(123);
    expect(failed.games).toBe(loaded.games);
  });
  it("rejects the first A request after A → B → A navigation", () => {
    const first = ready();
    const second = slateReducer(first, { type: "DATE_SELECTED", date: "2026-10-21" });
    const third = slateReducer(second, { type: "DATE_SELECTED", date: game.date });
    const result = slateReducer(third, { type: "SLATE_RESOLVED", date: game.date, generation: 0, games: [game] } as Parameters<typeof slateReducer>[1]);
    expect(result).toBe(third);
  });
});

describe("Edges Ahead clock filtering", () => {
  it("removes a tipped candidate and fills its slot from the remaining ranked games", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T20:00:00Z"));
    upcoming.splice(0, upcoming.length, ...[1, 2, 3, 4].map(id => ({ gameId: id, date: "2026-10-20", season: "2026-27", tipOffUtc: id === 1 ? "2026-10-20T20:00:00Z" : "2026-10-21T20:00:00Z", homeTeam: { id, abbreviation: `H${id}`, name: "Home", city: "City" }, awayTeam: { id: id + 10, abbreviation: `A${id}`, name: "Away", city: "City" }, homeFatigueScore: 0, awayFatigueScore: id, restAdvantageDifferential: 10 - id, predictedAdvantageAbbreviation: `H${id}`, projectedFatigue: true })));
    const html = renderToStaticMarkup(createElement(EdgesAhead, { onJump: () => {} }));
    expect(html).not.toContain("A1 @ H1");
    expect(html).toContain("A4 @ H4");
    vi.useRealTimers();
  });
  it("keeps unknown tip times and removes invalid or elapsed instants", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T20:00:00Z"));
    const template = { gameId: 9, date: "2026-10-20", season: "2026-27", homeTeam: { id: 1, abbreviation: "H", name: "Home", city: "City" }, awayTeam: { id: 2, abbreviation: "A", name: "Away", city: "City" }, homeFatigueScore: 0, awayFatigueScore: 1, restAdvantageDifferential: 1, predictedAdvantageAbbreviation: "H", projectedFatigue: true };
    upcoming.splice(0, upcoming.length, { ...template, tipOffUtc: null });
    expect(renderToStaticMarkup(createElement(EdgesAhead, { onJump: () => {} }))).toContain("A @ H");
    upcoming.splice(0, upcoming.length, { ...template, tipOffUtc: "invalid" }, { ...template, gameId: 10, tipOffUtc: "2026-10-20T19:59:59Z" });
    expect(renderToStaticMarkup(createElement(EdgesAhead, { onJump: () => {} }))).toBe("");
    vi.useRealTimers();
  });
});

describe("schedule-backed opener explanation", () => {
  const base = { season: "2026-27", awayTeam: { abbreviation: "BOS", name: "Celtics", city: "Boston" }, homeTeam: { abbreviation: "DET", name: "Pistons", city: "Detroit" }, awayFatigue: null, homeFatigue: null };
  it("explains both openers from metadata even when fatigue is missing", () => {
    expect(buildGameStoryline({ ...base, seasonOpeners: { away: true, home: true } } as unknown as GameResponse)).toContain("Season opener for both teams");
  });
  it("does not infer an opener from a genuine zero score or missing fatigue", () => {
    expect(buildGameStoryline({ ...base, homeFatigue: { score: 0 }, seasonOpeners: { away: false, home: false } } as unknown as GameResponse)).toBeNull();
  });
  it("names only the side opening its season", () => {
    const storyline = buildGameStoryline({ ...base, seasonOpeners: { away: true, home: false } } as unknown as GameResponse);
    expect(storyline).toContain("Season opener for the Celtics");
    expect(storyline).toContain("No fatigue data for the Celtics");
    expect(storyline).not.toContain("Pistons");
  });
});


describe("quiet Games refresh notice", () => {
  const notice = { checkedAt: Date.UTC(2026, 9, 20, 20), refreshStatus: "idle" as const, refreshMessage: null, retryRefresh: () => {} };
  it("labels response receipt as a view check without announcing every success", () => {
    const html = renderToStaticMarkup(createElement(GameSlateRefreshNotice, { slate: notice }));
    expect(html).toMatch(/Checked <\/span><time dateTime="2026-10-20T20:00:00.000Z"/);
    expect(html).toContain('aria-label="Refresh view"');
    expect(html).not.toContain('role="status"');
  });
  it("keeps the manual refresh button focusable while ignoring repeated activation", () => {
    const retry = vi.fn();
    const props = { ...notice, refreshStatus: "refreshing" as const, retryRefresh: retry };
    const html = renderToStaticMarkup(createElement(GameSlateRefreshNotice, { slate: props }));
    expect(html).not.toMatch(/<button\b[^>]*\sdisabled(?:=|[ >])/);
    expect(html).toContain('aria-disabled="true"');
    const button = GameSlateRefreshNotice({ slate: props })?.props.children[1];
    expect(button.type).toBe(RefreshButton);
    button.props.onActivate();
    expect(retry).not.toHaveBeenCalled();
  });
  it("announces failure quietly with a retry while preserving the check time", () => {
    const html = renderToStaticMarkup(createElement("div", {},
      createElement(GameSlateRefreshNotice, { slate: { ...notice, refreshStatus: "error", refreshMessage: "offline" } }),
      createElement(GameSlateRefreshWarning, { message: "offline" })
    ));
    expect(html).toContain('role="status"');
    expect(html).toContain("Showing the last fetched games");
    expect(html).toContain('aria-label="Try again"');
    expect(html).toMatch(/Checked <\/span><time dateTime="2026-10-20T20:00:00.000Z"/);
  });
});
