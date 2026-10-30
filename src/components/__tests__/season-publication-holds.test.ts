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

const playerPayload: PlayerRestPayload = {
  generated: "2026-11-01", names: ["Test Player"], teams: ["BOS"],
  seasons: [
    [0, 2025, 0, 25, 70, 1000, 50, 200, 48, 300, 52, 1000, 192, 312, 2000, 384, 624],
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
  state.data = { "/api/player-rest": playerPayload };
});

afterEach(() => vi.useRealTimers());

describe("observed player publications", () => {
  it.each([false, true])("shows current observed rows independently of the old readiness check (error=%s)", (failure) => {
    state.failure = failure;
    const html = renderPlayer();
    expect(html).toContain('value="2026" selected=""');
    expect(html).toContain('data-testid="player-row"');
    expect(html).toContain("98,765");
    expect(html).not.toContain("Awaiting results");
  });

  it("uses Everyone for a tiny current row and retains an explicit filter", () => {
    state.data["/api/player-rest"] = { ...playerPayload, seasons: [[0, 2026, 0, 26, 1, 1, 150, 0, 0, 0, 0]] };
    expect(renderPlayer()).toContain("150.0% eFG");
    expect(renderPlayer()).toContain('value="0" selected=""');
    state.search = "volume=300";
    expect(renderPlayer()).not.toContain('data-testid="player-row"');
    expect(renderPlayer()).toContain('value="300" selected=""');
  });

  it("uses the newest actual player publication across a calendar gap", () => {
    state.data["/api/player-rest"] = { ...playerPayload, seasons: [[0, 2024, 0, 25, 70, 1000, 50, 200, 48, 300, 52]] };
    expect(renderPlayer()).toContain('value="2024" selected=""');
    expect(renderPlayer()).toContain("2026-27 awaiting results");
  });

  it("keeps an explicit current selection awaiting when the artifact has no observations", () => {
    state.search = "year=2026";
    state.data["/api/player-rest"] = { ...playerPayload, seasons: playerPayload.seasons.slice(0, 1) };
    const html = renderPlayer();
    expect(html).toContain("Awaiting results");
    expect(html).toContain('href="/shooting?year=2025"');
    expect(html).not.toContain('data-testid="player-row"');
  });

  it("opens the selected season's provider record when historical and current names match", () => {
    state.data["/api/player-rest"] = { ...playerPayload, names: ["Test Player", "Test Player"],
      seasonOnlyPlayers: [1], seasons: [playerPayload.seasons[0], [1, 2026, 0, 26, 1, 1, 150, 0, 0, 0, 0, 3, 0, 0, 9, 0, 0]] };
    state.search = "year=2026&player=Test+Player";
    const current = renderPlayer();
    expect(current).toContain('aria-expanded="true"');
    expect(current).toContain("Observed season");
    expect(current).toContain("No cross-provider player identity has been inferred");
    expect(current.match(/data-testid="season-row"/g)).toHaveLength(1);
    state.search = "year=career&volume=0&player=Test+Player";
    expect(renderPlayer()).toContain("Historical career gap (2025-26 through 2025-26)");
  });

  it("shows the selected season's observation date and counts rather than the newest season's metadata", () => {
    const previous = { season: "2025-26", through: "2026-04-20", observedGames: 1000, expectedGames: 1000, missingGameIds: [], generatedAt: "2026-04-21T12:00:00Z" };
    const current = { season: "2026-27", through: "2026-10-22", observedGames: 16, expectedGames: 16, missingGameIds: [], generatedAt: "2026-10-23T12:00:00Z" };
    state.data["/api/player-rest"] = { ...playerPayload, publication: current, publications: { "2025-26": previous, "2026-27": current } };
    state.search = "year=2025";
    const prior = renderPlayer();
    expect(prior).toContain("Through Apr 20 · 1000 of 1000 games");
    expect(prior).not.toContain("Through Oct 22");
    state.search = "year=2026";
    expect(renderPlayer()).toContain("Through Oct 22 · 16 of 16 games");
  });

  it("shows incomplete history refreshes even in a historical career view with no current-season metadata", () => {
    state.data["/api/player-rest"] = { ...playerPayload, refresh: { status: "failed", checkedAt: null, publishedAt: null } };
    state.search = "year=career&volume=0";
    const html = renderPlayer();
    expect(html).toContain("Some season data could not be refreshed. Showing available verified records.");
    expect(html).toContain('data-testid="player-row"');
    expect(html).not.toContain("Through ");
  });

  it("keeps historical careers visible while current coverage is unavailable", () => {
    state.search = "year=career&player=Test+Player";
    state.failure = true;
    state.data["/api/player-rest"] = { ...playerPayload, seasons: playerPayload.seasons.slice(0, 1) };
    const html = renderPlayer();
    expect(html).toContain('data-testid="career-row"');
    expect(html).toContain("Historical career gap (2025-26 through 2025-26)");
    expect(html).not.toContain("Awaiting results");
  });
});

describe("actual shot-value publications", () => {
  it("shows current observations without a GP-readiness hold or a prior-season request", () => {
    state.data["/api/shot-quality?season=2026-27"] = shotResponse("2026-27");
    state.data["/api/shot-quality?season=2024-25"] = shotResponse("2024-25");
    const html = renderShot();
    expect(state.reads).not.toContain("/api/shot-quality?season=2024-25");
    expect(state.reads).not.toContain("/api/shot-quality?season=2025-26");
    expect(html).toContain('value="2026-27" selected=""');
    expect(html).not.toContain("Showing the previous published surface");
    expect(html).toContain('data-shot-anchor="two-court"');
    expect(html).not.toContain("NO SHOT DATA FOR THIS SEASON");
  });

  it.each([false, true])("shows raw current attempts while models await publication even if old readiness fails (%s)", (failure) => {
    state.failure = failure;
    const payload = shotResponse("2026-27");
    state.data["/api/shot-quality?season=2026-27"] = { ...payload, cells: payload.cells.map((cell) => ({ ...cell, fga: 1, fgm: 0, gbm: null, baseline: null })), meta: { cellCount: 1, totalFga: 1 } };
    const html = renderShot();
    expect(state.reads.filter((key) => key.includes("?season="))).toEqual(["/api/shot-quality?season=2026-27"]);
    expect(html).toContain("Actual shot attempts");
    expect(html).toContain("Model estimates are awaiting publication");
    expect(html).toContain('value="2026-27" selected=""');
    expect(html).not.toContain("View published results");
    expect(html).not.toContain("Earlier published surfaces remain available");
    expect(html).not.toContain("NO SHOT DATA FOR THIS SEASON");
  });
});
