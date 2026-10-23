import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bundled from "@/data/shooting-current.json";
import historical from "../../../../public/data/player-rest.json";
import { buildRows, indexPayload, type PlayerRestPayload } from "@/lib/player-rest";
import type { DailyDatasetResult } from "@/lib/daily-publication";
import { GET } from "../player-rest/route";

const state = vi.hoisted(() => ({ history: [] as DailyDatasetResult[], failure: false, latestSeason: "2027-28" }));
vi.mock("@/lib/daily-publication-server", () => ({ readDailyDatasetHistory: vi.fn(async () => {
  if (state.failure) throw new Error("Unavailable");
  return state.history;
}) }));
vi.mock("@/lib/nba-season", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/nba-season")>(), defaultNbaSeason: () => state.latestSeason,
}));

function artifact(year: number, completed = false) {
  const data = structuredClone(bundled);
  data.publication.season = `${year}-${String(year + 1).slice(-2)}`;
  data.seasons.forEach(row => { row[1] = year; });
  data.generated = data.publication.generatedAt = completed ? `${year + 1}-04-21T12:00:00Z` : `${year}-10-23T12:00:00Z`;
  data.publication.through = completed ? `${year + 1}-04-20` : `${year}-10-22`;
  if (year !== 2026) data.publication.fixtureIds = data.publication.fixtureIds.map((_, i) => `espn-${900000000 + i}`);
  if (completed) {
    data.publication.fixtureIds.push(...Array.from({ length: 1000 - data.publication.fixtureIds.length }, (_, i) => `espn-${800000000 + i}`));
    data.publication.expectedGames = data.publication.observedGames = data.publication.historyGames = 1000;
  }
  return data;
}
function entry(data: ReturnType<typeof artifact>, season = data.publication.season): DailyDatasetResult {
  return { data, season, hash: "a".repeat(64), status: "published", checkedAt: data.generated, publishedAt: data.generated };
}
async function response() { return (await GET()).json() as Promise<PlayerRestPayload>; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-10-24T12:00:00Z"));
  state.latestSeason = "2027-28";
  state.failure = false;
  state.history = [];
});
afterEach(() => vi.useRealTimers());

describe("GET /api/player-rest season history", () => {
  it("keeps the completed 2026 season after rollover instead of replacing it with its opening bundle", async () => {
    state.history = [entry(artifact(2026, true))];
    const body = await response();
    expect(body.publication).toMatchObject({ season: "2026-27", observedGames: 1000, through: "2027-04-20" });
    expect(indexPayload(body).years[0]).toBe(2026);
    expect(body.seasons.filter(row => row[1] === 2026)).toHaveLength(330);
  });
  it("keeps both successive observed seasons selectable and excludes every overlay cohort from historical careers", async () => {
    state.history = [entry(artifact(2026, true)), entry(artifact(2027))];
    const body = await response();
    const index = indexPayload(body);
    expect(index.years.slice(0, 3)).toEqual([2027, 2026, 2025]);
    expect(body.seasonOnlyPlayers).toHaveLength(660);
    expect(body.publications?.["2026-27"]).toMatchObject({ through: "2027-04-20", observedGames: 1000, generatedAt: "2027-04-21T12:00:00Z" });
    expect(body.publications?.["2027-28"]).toMatchObject({ through: "2027-10-22", observedGames: 16, generatedAt: "2027-10-23T12:00:00Z" });
    expect(body.seasons.filter(row => row[1] === 2026)).toHaveLength(330);
    expect(body.seasons.filter(row => row[1] === 2027)).toHaveLength(330);
    const options = { year: "career" as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };
    expect(buildRows(index, options)).toEqual(buildRows(indexPayload(historical), options));
    expect(body.shrunk).toEqual(historical.shrunk);
  });
  it.each(["wrong-year", "wrong-module"])("retains valid previous history and marks a %s reference failed", async mode => {
    const previous = artifact(2026, true);
    const bad = mode === "wrong-year" ? entry(previous, "2027-28") : { ...entry(artifact(2027)), data: { version: "wrong-module" } };
    state.history = [entry(previous), bad];
    const body = await response();
    expect(body.publication!.observedGames).toBe(1000);
    expect(body.seasons.filter(row => row[1] === 2027)).toHaveLength(0);
    expect(body.refresh!.status).toBe("failed");
  });
  it("surfaces a failed archived season even when the newest season loads successfully", async () => {
    state.history = [{ data: null, season: "2026-27", status: "failed", hash: null, checkedAt: null, publishedAt: "2027-04-21T12:00:00Z" }, entry(artifact(2027))];
    const body = await response();
    expect(body.publication!.season).toBe("2027-28");
    expect(body.refresh!.status).toBe("failed");
    expect(body.publications?.["2026-27"]).toMatchObject({ through: "2026-10-22", observedGames: 16 });
    expect(body.publications?.["2027-28"]).toMatchObject({ through: "2027-10-22", observedGames: 16 });
  });
  it("keeps the dated bundled season available when the history source cannot be read", async () => {
    state.failure = true;
    const body = await response();
    expect(body.publication).toMatchObject({ season: "2026-27", observedGames: 16 });
    expect(indexPayload(body).years[0]).toBe(2026);
    expect(body.refresh!.status).toBe("failed");
  });
  it("does not append another source cohort over an existing historical NBA season", async () => {
    state.history = [entry(artifact(2025, true)), entry(artifact(2026))];
    const body = await response();
    expect(body.seasons.filter(row => row[1] === 2025)).toEqual(historical.seasons.filter(row => row[1] === 2025));
    expect(body.seasons.filter(row => row[1] === 2026)).toHaveLength(330);
  });
});
