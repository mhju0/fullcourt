import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonReportContent } from "@/components/season-report-content";
import { OfficiatingContent } from "@/components/officiating-content";
import { HomeCourtStudy } from "@/components/home-court-study";
import { buildSeasonReport, type SeasonReportRow } from "@/lib/season-report";
import type { ReviewSeasonSummary } from "@/lib/officiating";

const state = vi.hoisted(() => ({
  search: "", data: {} as Record<string, unknown>, reads: [] as string[],
  errorKey: "",
}));
vi.mock("@/lib/nba-season", async (original) => ({
  ...await original<typeof import("@/lib/nba-season")>(),
  defaultNbaSeason: () => "2026-27",
}));
vi.mock("@/hooks/useSeasonUrl", () => ({
  useSeasonUrl: () => ({ season: new URLSearchParams(state.search).get("season") ?? "2026-27", explicit: state.search.includes("season="), setSeason: vi.fn() }),
  usePageQuery: () => ({ params: new URLSearchParams(state.search), update: vi.fn() }),
}));
vi.mock("@/hooks/useSeasonReadiness", () => ({
  useSeasonReadiness: () => { throw new Error("Descriptive results must not request GP readiness"); },
}));
vi.mock("swr", () => ({ default: (key: string | null) => {
  if (key) state.reads.push(key);
  return { data: key ? state.data[key] : undefined, error: key === state.errorKey ? new Error("Unavailable") : undefined,
    mutate: vi.fn(), isLoading: false };
} }));

const side = (fatigueScore: string) => ({ fatigueScore, travelLegMiles: 0,
  isBackToBack: false, isThreeInFour: false, hasTimeZoneDisplacement: false });
const final: SeasonReportRow = { gameId: 1, date: "2026-10-20", status: "final", homeTeamId: 1,
  awayTeamId: 2, homeScore: 100, awayScore: 90, neutralSite: false, home: side("0"), away: side("5") };
const reportKey = (season: string) => `/api/season-report?season=${season}&schema=home-court-v1`;
const report = (rows = [final]) => ({ ...buildSeasonReport("2026-27", rows), teams: [] });
const summary = (season: string, extra: Partial<ReviewSeasonSummary> = {}): ReviewSeasonSummary => ({
  season, through: "2026-10-20", refreshedAt: "2026-10-21T12:00:00Z", indexSource: "https://official.nba.com/", indexSha256: "a",
  missed: 1, wrong: 0, gameCount: 1, categories: {}, ...extra,
});
const renderReport = () => renderToStaticMarkup(createElement(SeasonReportContent));

beforeEach(() => {
  state.search = "";
  state.reads = [];
  state.errorKey = "";
  state.data = { "/api/season-report-publication": { seasons: ["2024-25", "2026-27"] }, [reportKey("2026-27")]: report() };
});

describe("early season report publication", () => {
  it("defaults to the actual first current result and prints counts and Wilson bounds", () => {
    const html = renderReport();
    expect(html).toContain('value="2026-27" selected=""');
    expect(html).toContain("100.0%");
    expect(html).toContain("20.7% to 100.0% (95% Wilson interval)");
    expect(html).toContain("1 scored final games; 0 awaiting one or both fatigue records");
    expect(html).toContain("does not test the difference");
    expect(html).not.toContain("Too early");
  });
  it("distinguishes a missing rested-home sample from a real zero-win sample", () => {
    state.data[reportKey("2026-27")] = report([{ ...final, away: side("0") }]);
    expect(renderReport()).toContain("No eligible games");
    expect(renderReport()).not.toContain("Wilson interval");
    state.data[reportKey("2026-27")] = report([{ ...final, homeScore: 90, awayScore: 100 }]);
    expect(renderReport()).toContain("0.0% to 79.3% (95% Wilson interval)");
  });
  it("keeps explicit unpublished current on its guide and falls back only for an implicit default", () => {
    state.data["/api/season-report-publication"] = { seasons: ["2024-25"] };
    state.search = "season=2026-27";
    expect(renderReport()).toContain("Awaiting results");
    expect(state.reads).not.toContain(reportKey("2026-27"));
    state.search = "";
    expect(renderReport()).toContain('value="2024-25" selected=""');
    expect(renderReport()).toContain('data-testid="season-default-note"');
    expect(renderReport()).toContain("results are awaiting publication");
  });
  it("provides publication recovery without claiming an errored check means no data", () => {
    state.errorKey = "/api/season-report-publication";
    state.search = "season=2026-27";
    const html = renderReport();
    expect(html).toContain("Retry published reports");
    expect(html).not.toContain("has not been published yet");
    expect(html).not.toContain("season-rest-win-rate");
  });
});

describe("early officiating publication", () => {
  it("shows one current review immediately, labels the selected population, and keeps the trend historical", () => {
    const html = renderToStaticMarkup(createElement(OfficiatingContent, { seasons: [summary("2025-26", { missed: 3, gameCount: 10 }), summary("2026-27")] }));
    expect(html).toContain('value="2026-27" selected=""');
    expect(html).toContain("Season to date");
    expect(html).toContain("1 identified errors, 1 reviewed games");
    expect(html).toContain("not whole-game officiating accuracy");
    expect(html).toContain("0.30");
    expect(html).not.toContain("1.00");
    expect(state.reads).toContain("/api/officiating/2026-27");
  });
  it("shows a clean review without claiming zero percent accuracy or missed-call share", () => {
    const html = renderToStaticMarkup(createElement(OfficiatingContent, { seasons: [summary("2026-27", { missed: 0 })] }));
    expect(html).toContain("No identified errors in these reports");
    expect(html).toContain("0 identified errors, 1 reviewed games");
    expect(html).not.toContain("0.0%");
  });
  it("requests the same publication as the summary counts", () => {
    renderToStaticMarkup(createElement(OfficiatingContent, { seasons: [summary("2026-27", { publicationHash: "abc123" })] }));
    expect(state.reads).toContain("/api/officiating/2026-27?publication=abc123");
  });
  it("draws the season-to-date bar hollow with its reviewed-game count", () => {
    const html = renderToStaticMarkup(createElement(OfficiatingContent, { seasons: [summary("2025-26", { missed: 3, gameCount: 10 }), summary("2026-27", { gameCount: 3 })] }));
    expect(html.match(/data-partial="true"/g)).toHaveLength(1);
    expect(html).toContain("3 games to date");
  });
  it("supports a completely unpublished archive with an honest guide", () => {
    const html = renderToStaticMarkup(createElement(OfficiatingContent, { seasons: [] }));
    expect(html).toContain("Awaiting results");
    expect(html).not.toContain("Season finding");
  });
});

describe("early home-court observations", () => {
  it("selects the latest partial season, plots a one-game zero rate, and preserves missing samples", () => {
    state.data["/api/home-court"] = { seasonWinRates: [{ season: "2026-27", homeGames: 1,
      homeWins: 0, homeBaselinePct: 0, games: 1, restedTeamWins: 0, winPct: 0, isComplete: false,
      latestEvidenceDate: "2026-10-20", largeRestGap: { games: 0, restedTeamWins: 0, winPct: null } }] };
    const html = renderToStaticMarkup(createElement(HomeCourtStudy));
    expect(html).toContain('value="2026-27" selected=""');
    expect(html).toContain('data-series="rested-home"');
    expect(html).toContain("Season to date");
    expect(html).not.toContain("Too early");
    expect(html).toContain("0.0%");
  });
  it("keeps a season-to-date point out of the axis and the lines and draws it hollow", () => {
    const complete = (season: string, homeBaselinePct: number, winPct: number) => ({ season, homeGames: 1230,
      homeWins: Math.round(12.3 * homeBaselinePct), homeBaselinePct, games: 200, restedTeamWins: 2 * winPct,
      winPct, isComplete: true, latestEvidenceDate: "2026-04-12", largeRestGap: { games: 0, restedTeamWins: 0, winPct: null } });
    state.data["/api/home-court"] = { seasonWinRates: [complete("2024-25", 55, 60), complete("2025-26", 56, 62),
      { season: "2026-27", homeGames: 28, homeWins: 13, homeBaselinePct: 46.4, games: 3, restedTeamWins: 0, winPct: 0,
        isComplete: false, latestEvidenceDate: "2026-10-23", largeRestGap: { games: 0, restedTeamWins: 0, winPct: null } }] };
    const html = renderToStaticMarkup(createElement(HomeCourtStudy));
    const ticks = [...html.matchAll(/>(\d+)%<\/text>/g)].map((m) => Number(m[1]));
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(50);
    expect(html.match(/<circle data-series="rested-home" data-partial="true"[^>]*fill="none"/g)).toHaveLength(1);
    expect(html.match(/<circle data-series="home" data-partial="true"[^>]*fill="none"/g)).toHaveLength(1);
    expect(html).toContain("3 games");
    for (const points of html.matchAll(/<polyline[^>]*points="([^"]*)"/g)) expect(points[1].split(" ")).toHaveLength(2);
  });
});
