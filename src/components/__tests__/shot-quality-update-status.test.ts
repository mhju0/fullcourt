import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShotQualityContent } from "@/components/shot-quality-content";

const state = vi.hoisted(() => ({ status: "failed", search: "season=2026-27", checkedAt: "2026-10-29T16:54:50.509Z",
  generatedAt: "2026-10-22T12:00:00Z", hasCells: false, failure: false, reads: [] as string[] }));
vi.mock("@/hooks/useSeasonUrl", () => ({
  usePageQuery: () => ({ params: new URLSearchParams(state.search), update: vi.fn() }),
}));
vi.mock("swr", () => ({ default: (key: string) => {
  state.reads.push(key);
  const season = new URL(key, "https://fullcourt.test").searchParams.get("season") ?? "2025-26";
  return { data: {
    season, latestPublishedSeason: "2025-26", activeModel: "gbm-v1", cells: state.hasCells ? [{
      cellX: 0, cellY: 0, zoneBasic: "Restricted Area", zoneRange: "Less Than 8 ft.", zoneArea: "Center(C)",
      fga: 1, fgm: 0, fg3a: 0, fg3m: 0, baseline: null, gbm: null,
    }] : [], meta: { cellCount: state.hasCells ? 1 : 0, totalFga: state.hasCells ? 1 : 0, publication: {
      source: "nba-stats-snapshot", checkedAt: state.checkedAt, updateStatus: state.status, generatedAt: state.generatedAt,
      firstGameDate: "2026-10-21", lastGameDate: "2026-10-21", gameCount: 1, droppedShotCount: 0,
    } },
  }, error: state.failure ? new Error("Provider unavailable") : undefined, isLoading: false };
} }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T17:00:00Z"));
  Object.assign(state, { status: "failed", search: "season=2026-27", checkedAt: "2026-10-29T16:54:50.509Z",
    generatedAt: "2026-10-22T12:00:00Z", hasCells: false, failure: false, reads: [] });
});
afterEach(() => vi.useRealTimers());

describe("shot publication update status", () => {
  it("shows the existing current-season guide without a redundant refresh-status paragraph", () => {
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain("Awaiting season data");
    expect(html).not.toContain("The latest update failed");
    expect(html).not.toContain("Last update check");
    expect(html).not.toContain(state.checkedAt);
  });

  it("does not present an unpublished provider result as a failed refresh", () => {
    state.status = "unavailable";
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).not.toContain("The latest update failed");
    expect(html).not.toContain("Last update check");
  });

  it.each(["", "mode=actual", "mode=value", "mode=diff"])("requests the current season explicitly on a bare-season URL: %s", search => {
    state.search = search;
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(state.reads).toEqual(["/api/shot-quality?season=2026-27"]);
    expect(html).toContain('value="2026-27" selected=""');
    expect(html).toContain("Awaiting season data");
    expect(html).not.toContain("latest published shot grid");
  });

  it("retains a true API load error", () => {
    state.failure = true;
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain("FAILED TO LOAD SHOT DATA");
    expect(html).toContain("Provider unavailable");
  });

  it("keeps the current display season while the next season's schedule becomes browsable", () => {
    vi.setSystemTime(new Date("2026-08-10T17:00:00Z"));
    state.search = "";
    renderToStaticMarkup(createElement(ShotQualityContent));
    expect(state.reads).toEqual(["/api/shot-quality?season=2025-26"]);
  });

  it.each(["actual", "value", "diff"])("retains an explicit historical season and map mode: %s", mode => {
    state.search = `season=2025-26&mode=${mode}&model=gbm-v1`;
    state.hasCells = true;
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(state.reads).toEqual(["/api/shot-quality?season=2025-26"]);
    expect(html).toContain('value="2025-26" selected=""');
    expect(html).toContain('data-shot-anchor="two-court"');
    expect(html).not.toContain("Awaiting season data");
    expect(html).not.toContain("Last update check");
    expect(html).not.toContain("The latest update failed");
  });

  it("formats the lower snapshot timestamp in Eastern time without seconds", () => {
    state.hasCells = true;
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain("Snapshot generated Oct 22, 2026, 8:00 AM ET.");
    expect(html).not.toContain(state.generatedAt);
    expect(html).not.toContain("Last update check");
    expect(html).not.toContain("The latest update failed");
    state.generatedAt = "2026-10-22";
    expect(renderToStaticMarkup(createElement(ShotQualityContent))).toContain("Snapshot generated Oct 22, 2026.");
  });
});
