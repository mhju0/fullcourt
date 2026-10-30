import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShotQualityContent } from "@/components/shot-quality-content";

const state = vi.hoisted(() => ({ status: "failed", search: "season=2026-27", checkedAt: "2026-10-29T16:54:50.509Z",
  generatedAt: "2026-10-22T12:00:00Z", source: "nba-stats-snapshot", models: "none", hasCells: false, failure: false, reads: [] as string[] }));
vi.mock("@/components/copy-finding-button", () => ({
  CopyFindingButton: ({ text }: { text: string }) => createElement("button", { "data-copy-finding": text }, "Copy this view"),
}));
vi.mock("@/hooks/useSeasonUrl", () => ({
  usePageQuery: () => ({ params: new URLSearchParams(state.search), update: vi.fn() }),
}));
vi.mock("swr", () => ({ default: (key: string) => {
  state.reads.push(key);
  const season = new URL(key, "https://fullcourt.test").searchParams.get("season") ?? "2025-26";
  return { data: {
    season, latestPublishedSeason: "2025-26", activeModel: "gbm-v1", cells: state.hasCells ? [{
      cellX: 0, cellY: 0, zoneBasic: "Restricted Area", zoneRange: "Less Than 8 ft.", zoneArea: "Center(C)",
      fga: 1, fgm: 0, fg3a: 0, fg3m: 0,
      baseline: state.models === "none" ? null : { pMake: .5, expectedEfg: .5, xpps: 1 },
      gbm: state.models === "complete" ? { pMake: .6, expectedEfg: .6, xpps: 1.2 } : null,
    }] : [], meta: { cellCount: state.hasCells ? 1 : 0, totalFga: state.hasCells ? 1 : 0, publication: {
      source: state.source, checkedAt: state.checkedAt, updateStatus: state.status, generatedAt: state.generatedAt,
      firstGameDate: "2026-10-21", lastGameDate: "2026-10-21", gameCount: 1, droppedShotCount: 0,
    } },
  }, error: state.failure ? new Error("Provider unavailable") : undefined, isLoading: false };
} }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T17:00:00Z"));
  Object.assign(state, { status: "failed", search: "season=2026-27", checkedAt: "2026-10-29T16:54:50.509Z",
    generatedAt: "2026-10-22T12:00:00Z", source: "nba-stats-snapshot", models: "none", hasCells: false, failure: false, reads: [] });
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

  it("labels official web snapshots truthfully without implying model publication", () => {
    state.hasCells = true;
    state.source = "nba-web-snapshot";
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain("NBA.com official play-by-play");
    expect(html).not.toContain("NBA Stats ShotChartDetail");
    expect(html).not.toContain("Historical database grid.");
    expect(html).toContain("Model estimates are awaiting publication. The map shows observed shot attempts.");
    expect(html).toContain("Snapshot generated Oct 22, 2026, 8:00 AM ET.");
  });

  it("retains the existing Stats provider label for v1 snapshots", () => {
    state.hasCells = true;
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain("NBA Stats ShotChartDetail");
    expect(html).not.toContain("NBA.com official play-by-play");
  });

  it.each(["value", "diff"])("keeps raw-only explicit %s unavailable instead of substituting shot attempts", mode => {
    state.hasCells = true;
    state.source = "nba-web-snapshot";
    state.search = `season=2026-27&mode=${mode}`;
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(state.reads).toEqual(["/api/shot-quality?season=2026-27"]);
    expect(html).toContain('value="2026-27" selected=""');
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="true"[^>]*>${mode === "value" ? "EXPECTED eFG%" : "MODEL DIFFERENCE"}</button>`));
    expect(html).toContain("MODEL ESTIMATES NOT AVAILABLE");
    expect(html).toContain("Model estimates have not been published for this season. Choose Shot attempts to view observed shots.");
    expect(html).not.toContain('aria-label="Actual shot attempts:');
    expect(html).not.toContain("The map shows observed shot attempts.");
    expect(html).not.toContain("Marker size shows shot attempts.");
    expect(html).not.toContain("Copy this view");
    expect(html).not.toContain("data-copy-finding");
  });

  it.each(["", "&mode=actual"])("keeps raw attempts visible and shareable for the actual view: %s", mode => {
    state.hasCells = true;
    state.source = "nba-web-snapshot";
    state.search = `season=2026-27${mode}`;
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain('aria-label="Actual shot attempts:');
    expect(html).toContain("Copy this view");
    expect(html).toContain("observed shot attempts by location");
    expect(html).not.toContain("Model estimates describe shot locations");
    expect(html).not.toContain("MODEL ESTIMATES NOT AVAILABLE");
  });

  it.each(["partial", "complete"])("preserves historical %s models in the expected-value view", models => {
    state.hasCells = true;
    state.models = models;
    state.source = "database";
    state.search = "season=2025-26&mode=value";
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain('aria-label="Zone average:');
    expect(html).toContain("Copy this view");
    expect(html).not.toContain("MODEL ESTIMATES NOT AVAILABLE");
  });

  it("does not share an incomplete difference view", () => {
    state.hasCells = true;
    state.models = "partial";
    state.search = "season=2025-26&mode=diff";
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain("MODEL COMPARISON INCOMPLETE");
    expect(html).not.toContain("Copy this view");
    expect(html).not.toContain('aria-label="MODEL DIFFERENCE:');
  });

  it("keeps a complete historical difference view shareable", () => {
    state.hasCells = true;
    state.models = "complete";
    state.search = "season=2025-26&mode=diff";
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain('aria-label="MODEL DIFFERENCE:');
    expect(html).toContain("Copy this view");
    expect(html).not.toContain("MODEL COMPARISON INCOMPLETE");
  });

  it("limits completed-slate provenance to v2 while preserving the legacy caveat", () => {
    state.hasCells = true;
    state.source = "nba-web-snapshot";
    const current = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(current).toContain("Collected from NBA.com’s completed-game slate.");
    expect(current).not.toContain("completeness against the NBA schedule has not been established");
    state.source = "nba-stats-snapshot";
    const legacy = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(legacy).toContain("completeness against the NBA schedule has not been established");
    expect(legacy).not.toContain("Collected from NBA.com’s completed-game slate.");
  });
});
