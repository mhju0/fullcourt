import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerRestContent } from "@/components/player-rest-content";
import { ShotQualityContent } from "@/components/shot-quality-content";
import type { PlayerRestPayload } from "@/lib/player-rest";
import type { ShotQualityResponse } from "@/types";

const state = vi.hoisted(() => ({
  search: "", ready: false, failure: false,
  data: {} as Record<string, unknown>, reads: [] as string[],
}));
vi.mock("@/hooks/useSeasonUrl", () => ({
  usePageQuery: () => ({ params: new URLSearchParams(state.search), update: vi.fn() }),
}));
vi.mock("@/hooks/useSeasonReadiness", () => ({
  useSeasonReadiness: (season: string) => ({
    data: { season, ready: state.ready }, ready: state.ready && !state.failure,
    awaiting: !state.ready && !state.failure,
    error: state.failure ? new Error("Unavailable") : undefined,
    isValidating: false, mutate: vi.fn(),
  }),
}));
vi.mock("swr", () => ({ default: (key: string | null) => {
  if (key) state.reads.push(key);
  return { data: key ? state.data[key] : undefined, isLoading: false };
} }));
vi.mock("@/components/zero-rest-workload", () => ({ ZeroRestWorkload: () => null }));

const playerPayload: PlayerRestPayload = {
  generated: "2026-11-01", names: ["Test Player"], teams: ["BOS"],
  seasons: [
    [0, 2025, 0, 25, 70, 1000, 50, 200, 48, 300, 52],
    [0, 2026, 0, 26, 5, 98765, 65, 100, 60, 100, 70],
  ],
  shrunk: [[0, 99.99, 1.5, 88.88]],
};
function renderPlayer() { return renderToStaticMarkup(createElement(PlayerRestContent)); }
function shotResponse(season: string, previousPublishedSeason: string | null = "2024-25"): ShotQualityResponse {
  return {
    season, latestPublishedSeason: "2026-27", previousPublishedSeason,
    activeModel: "gbm-v1", cells: [{
      cellX: 0, cellY: 1, zoneBasic: "Restricted Area", zoneRange: "Less Than 8 ft.", zoneArea: "Center(C)",
      fga: 100, fgm: 60, fg3a: 0, fg3m: 0,
      gbm: { pMake: 0.6, expectedEfg: 0.6, xpps: 1.2 },
      baseline: { pMake: 0.6, expectedEfg: 0.6, xpps: 1.2 },
    }], meta: { cellCount: 1, totalFga: 100 },
  };
}
function renderShot() { return renderToStaticMarkup(createElement(ShotQualityContent)); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
  state.search = "";
  state.ready = false;
  state.failure = false;
  state.reads = [];
  state.data = { "/data/player-rest.json": playerPayload };
});

afterEach(() => vi.useRealTimers());

describe("current player publication holds", () => {
  it.each([false, true])("holds Career when current data is held or its readiness check fails (error=%s)", (failure) => {
    state.search = "year=career";
    state.failure = failure;
    const html = renderPlayer();
    expect(html).not.toContain('data-testid="player-row"');
    expect(html).not.toContain("99.99");
    expect(html).not.toContain("88.88");
    expect(html).toContain(failure ? "COULD NOT CHECK SEASON DATA" : "Awaiting season data");
  });

  it.each([false, true])("preserves prior results and removes current expansion rows and pooled career data (error=%s)", (failure) => {
    state.search = "year=2025&player=Test+Player";
    state.failure = failure;
    const html = renderPlayer();
    expect(html).toContain('data-testid="player-row"');
    expect(html.match(/data-testid="season-row"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="career-data-held"');
    expect(html).not.toContain('data-testid="career-row"');
    expect(html).not.toContain("98,765");
    expect(html).not.toContain("Raw career gap:");
    expect(html).not.toContain("No career estimate: fewer");
  });

  it("shows the unchanged shipped career estimate and all seasons after readiness succeeds", () => {
    state.search = "year=2025&player=Test+Player";
    state.ready = true;
    const html = renderPlayer();
    expect(html.match(/data-testid="season-row"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="career-row"');
    expect(html).toContain("Raw career gap:");
    expect(html).toContain("99.99");
    expect(html).toContain("88.88");
  });

  it("keeps historical-only exports unchanged without hiding career data", () => {
    state.search = "year=2025&player=Test+Player";
    state.data["/data/player-rest.json"] = { ...playerPayload, seasons: playerPayload.seasons.slice(0, 1) };
    const html = renderPlayer();
    expect(html).toContain('data-testid="career-row"');
    expect(html).toContain("99.99");
    expect(html).not.toContain('data-testid="career-data-held"');
  });
});

describe("actual prior shot-value publications", () => {
  it("requests the available prior publication even when the calendar's previous year is absent", () => {
    state.data["/api/shot-quality"] = shotResponse("2026-27");
    state.data["/api/shot-quality?season=2024-25"] = shotResponse("2024-25");
    const html = renderShot();
    expect(state.reads).toContain("/api/shot-quality?season=2024-25");
    expect(state.reads).not.toContain("/api/shot-quality?season=2025-26");
    expect(html).toContain('value="2024-25" selected=""');
    expect(html).toContain("Showing the previous published surface");
    expect(html).toContain('data-shot-anchor="two-court"');
    expect(html).not.toContain("NO SHOT DATA FOR THIS SEASON");
  });

  it.each([null, undefined])("shows only an honest guide when no actual prior publication is known (%s)", (prior) => {
    state.data["/api/shot-quality"] = { ...shotResponse("2026-27"), previousPublishedSeason: prior };
    const html = renderShot();
    expect(state.reads.filter((key) => key.includes("?season="))).toEqual([]);
    expect(html).toContain("Awaiting season data");
    expect(html).not.toContain("View published results");
    expect(html).not.toContain('href="/shot-quality?season=2026-27"');
    expect(html).not.toContain("NO SHOT DATA FOR THIS SEASON");
  });
});
