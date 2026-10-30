import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/db/queries", () => ({
  getDataAsOf: vi.fn().mockResolvedValue({ finalGames: 47_143, latestFinalDate: "2026-04-12" }),
  getPublishedScheduleCoverage: vi.fn().mockResolvedValue({ games: 1, firstDate: "2026-10-20", lastDate: "2026-10-20" }),
  getLatestPublishedPlayoffSeason: vi.fn().mockResolvedValue("2025-26"),
  getLatestPublishedShotQualitySeason: vi.fn().mockResolvedValue("2024-25"),
}));
vi.mock("@/lib/rest-advantage-evidence-server", () => ({
  getHistoricalEvidenceCoverage: vi.fn().mockResolvedValue({ games: 47_143, latestEvidenceDate: "2026-04-12" }),
}));
vi.mock("@/lib/player-rest-publication-server", () => ({
  loadPlayerRestPublication: vi.fn(async () => ({
    generated: "2026-10-29T16:54:50.509Z", seasons: [],
    refresh: { status: "published" },
  })),
}));
vi.mock("@/lib/officiating-publication-server", () => ({
  loadOfficiatingPublication: vi.fn(async () => ({
    seasons: [{ season: "2025-26", through: "2026-01-14", refreshedAt: "2026-01-15T03:17:59.999Z" }],
    publication: { status: "published" },
  })),
}));
vi.mock("@/lib/daily-publication-server", () => ({
  readDailyDatasetHistory: vi.fn(async () => [{ data: null, status: "failed" }]),
}));

import DataStatusPage from "@/app/data-status/page";
import { getHistoricalEvidenceCoverage } from "@/lib/rest-advantage-evidence-server";
import { getDataAsOf, getPublishedScheduleCoverage, getLatestPublishedPlayoffSeason, getLatestPublishedShotQualitySeason } from "@/lib/db/queries";
import { loadPlayerRestPublication } from "@/lib/player-rest-publication-server";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

describe("Data Status rendered model coverage", () => {
  it("uses Eastern minutes for publication evidence and retains operational failure status", async () => {
    const html = renderToStaticMarkup(await DataStatusPage()).replaceAll("\u00a0", " ");
    expect(html).toContain("Oct 29, 2026, 12:54 PM ET");
    expect(html).toContain("Jan 14, 2026, 10:17 PM ET");
    expect(html).not.toContain("2026-10-29T16:54:50.509Z");
    expect(html).toContain("Latest current-season check: failed");
  });

  it("renders the full fatigue population rather than the non-neutral venue baseline", async () => {
    const html = renderToStaticMarkup(await DataStatusPage());
    expect(html.replaceAll("\u00a0", " ")).toContain("47,143 final regular-season games with fatigue evidence, neutral sites included");
    expect(html).not.toContain("47,094 final regular-season games");
    expect(html).toContain("2026-04-12");
  });

  it("keeps a failed coverage read unavailable", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getHistoricalEvidenceCoverage).mockRejectedValueOnce(new Error("database timeout"));
    const html = renderToStaticMarkup(await DataStatusPage());
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("games with fatigue evidence");
    errorLog.mockRestore();
  });

  it("starts database reads while publication data is still pending", async () => {
    const publication = await loadPlayerRestPublication();
    vi.clearAllMocks();
    const held = deferred<typeof publication>();
    vi.mocked(loadPlayerRestPublication).mockReturnValueOnce(held.promise);
    const page = DataStatusPage();
    try {
      expect(execute).toHaveBeenCalledOnce();
      expect(loadPlayerRestPublication).toHaveBeenCalledOnce();
    } finally {
      held.resolve(publication);
      await page;
    }
  });

  it("keeps every database operation sequential while the independent publication branch runs", async () => {
    const probe = deferred<unknown[]>();
    const games = deferred<Awaited<ReturnType<typeof getDataAsOf>>>();
    const schedule = deferred<Awaited<ReturnType<typeof getPublishedScheduleCoverage>>>();
    const coverage = deferred<Awaited<ReturnType<typeof getHistoricalEvidenceCoverage>>>();
    const playoffs = deferred<string | null>();
    const shots = deferred<string | null>();
    let active = 0, maxActive = 0;
    const order: string[] = [];
    function track<T>(name: string, promise: Promise<T>) {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(name);
      return promise.finally(() => { active--; });
    }
    execute.mockImplementationOnce(() => track("database", probe.promise));
    vi.mocked(getDataAsOf).mockImplementationOnce(() => track("games", games.promise));
    vi.mocked(getPublishedScheduleCoverage).mockImplementationOnce(() => track("schedule", schedule.promise));
    vi.mocked(getHistoricalEvidenceCoverage).mockImplementationOnce(() => track("analysis", coverage.promise));
    vi.mocked(getLatestPublishedPlayoffSeason).mockImplementationOnce(() => track("playoffs", playoffs.promise));
    vi.mocked(getLatestPublishedShotQualitySeason).mockImplementationOnce(() => track("shots", shots.promise));
    const page = DataStatusPage();
    await vi.waitFor(() => expect(order).toEqual(["database"]));
    expect(loadPlayerRestPublication).toHaveBeenCalledOnce();
    probe.resolve([]);
    await vi.waitFor(() => expect(order).toEqual(["database", "games"]));
    games.resolve({ finalGames: 2, latestFinalDate: "2026-10-28" });
    await vi.waitFor(() => expect(order).toEqual(["database", "games", "schedule"]));
    schedule.resolve({ games: 3, firstDate: "2026-10-20", lastDate: "2026-10-30" });
    await vi.waitFor(() => expect(order).toEqual(["database", "games", "schedule", "analysis"]));
    coverage.resolve({ games: 2, latestEvidenceDate: "2026-10-28" });
    await vi.waitFor(() => expect(order).toEqual(["database", "games", "schedule", "analysis", "playoffs"]));
    playoffs.resolve("2025-26");
    await vi.waitFor(() => expect(order).toEqual(["database", "games", "schedule", "analysis", "playoffs", "shots"]));
    shots.resolve("2024-25");
    await page;
    expect(maxActive).toBe(1);
    expect(active).toBe(0);
  });

  it.each([
    { title: "Game results", read: getDataAsOf },
    { title: "Published schedules", read: getPublishedScheduleCoverage },
    { title: "Model Results", read: getHistoricalEvidenceCoverage },
    { title: "Playoff Rest", read: getLatestPublishedPlayoffSeason },
    { title: "Expected Shot Value", read: getLatestPublishedShotQualitySeason },
  ])("keeps a failed $title read isolated from the other database cards", async ({ title, read }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(read).mockRejectedValueOnce(new Error("database timeout"));
    const html = renderToStaticMarkup(await DataStatusPage());
    const cards = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g)!;
    expect(cards.find(card => card.includes(title))).toContain("Unavailable");
    for (const other of ["Game results", "Published schedules", "Model Results", "Playoff Rest", "Expected Shot Value"].filter(value => value !== title)) {
      expect(cards.find(card => card.includes(other))).not.toContain("Unavailable");
    }
    expect(getLatestPublishedShotQualitySeason).toHaveBeenCalledOnce();
  });

  it("retains publication cards and skips dependent reads when the database probe fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValueOnce(new Error("connection unavailable"));
    const html = renderToStaticMarkup(await DataStatusPage());
    expect(getDataAsOf).not.toHaveBeenCalled();
    expect(getPublishedScheduleCoverage).not.toHaveBeenCalled();
    expect(getHistoricalEvidenceCoverage).not.toHaveBeenCalled();
    expect(getLatestPublishedPlayoffSeason).not.toHaveBeenCalled();
    expect(getLatestPublishedShotQualitySeason).not.toHaveBeenCalled();
    expect(html).toContain("Jan 14, 2026, 10:17 PM ET");
    expect(html).toContain("Latest current-season check: failed");
  });
});
