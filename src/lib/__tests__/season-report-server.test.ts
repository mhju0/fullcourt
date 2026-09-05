/**
 * Pins the Season Report cache, and the rollover hole it used to have.
 *
 * The page reads every game in a season with no LIMIT, so it is cached — but it was keyed on
 * `getCompletedGamesStamp()`, which counts only **final** games. That stamp is exact for the
 * backtest, whose inputs are only final games, and wrong here: between the 1 October season-list
 * rollover and opening night roughly three weeks later, no regular-season game is final, so a
 * newly-seeded 2026-27 schedule never moved the stamp and `/season` served `0 / 0 · NO GAMES
 * SCHEDULED` off a cache that could not invalidate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSeasonGamesStamp, getSeasonReportRows, getTeamDirectory } from "@/lib/db/queries";

vi.mock("@/lib/db/queries", () => ({
  getSeasonGamesStamp: vi.fn(),
  getSeasonReportRows: vi.fn(),
  getTeamDirectory: vi.fn(),
}));

const mockStamp = vi.mocked(getSeasonGamesStamp);
const mockRows = vi.mocked(getSeasonReportRows);
const mockTeams = vi.mocked(getTeamDirectory);

/** Fresh module per test: the cache is module state. */
async function loadModule() {
  vi.resetModules();
  return import("@/lib/season-report-server");
}

describe("getSeasonReport", () => {
  beforeEach(() => {
    mockStamp.mockReset();
    mockRows.mockReset();
    mockTeams.mockReset();
    mockRows.mockResolvedValue([]);
    mockTeams.mockResolvedValue([]);
  });

  it("reads the season once while the stamp is unchanged", async () => {
    mockStamp.mockResolvedValue("1230/1230@2026-04-12");
    const { getSeasonReport } = await loadModule();

    const first = await getSeasonReport("2025-26");
    const second = await getSeasonReport("2025-26");

    expect(mockRows).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(mockStamp).toHaveBeenCalledTimes(2);
  });

  it("re-reads once the schedule is seeded, with nothing yet final", async () => {
    // The October hole exactly: the final count never moves, only the scheduled rows arrive.
    mockStamp
      .mockResolvedValueOnce("0/0@none")
      .mockResolvedValueOnce("1230/0@2027-04-11");
    const { getSeasonReport } = await loadModule();

    await getSeasonReport("2026-27");
    await getSeasonReport("2026-27");

    expect(mockRows).toHaveBeenCalledTimes(2);
  });

  it("stamps each season separately, so viewing one does not evict another", async () => {
    // The stamp is season-scoped, so a shared-stamp cache would thrash on every season switch.
    mockStamp.mockImplementation(async (season: string) =>
      season === "2025-26" ? "1230/1230@2026-04-12" : "1230/0@2027-04-11"
    );
    const { getSeasonReport } = await loadModule();

    const current = await getSeasonReport("2025-26");
    await getSeasonReport("2026-27");

    expect(await getSeasonReport("2025-26")).toBe(current);
    expect(mockRows).toHaveBeenCalledTimes(2);
  });
});

const QUERIES = readFileSync(join(process.cwd(), "src", "lib", "db", "queries.ts"), "utf8");

/** Source of a top-level function, from its declaration to the closing brace in column 0. */
function bodyOf(name: string): string {
  const start = QUERIES.indexOf(`function ${name}(`);
  expect(start, `${name} not found in queries.ts`).toBeGreaterThan(-1);
  const end = QUERIES.indexOf("\n}\n", start);
  return QUERIES.slice(start, end === -1 ? undefined : end);
}

/**
 * A cache stamp is only correct if it keys the population its query reads. These read the
 * source for the same reason `publishable-games.test.ts` does: the failure mode is a predicate
 * drifting apart from the query it stands in for, and no in-memory fixture can see that.
 */
describe("getSeasonGamesStamp", () => {
  it("keys the population getSeasonReportRows actually reads", () => {
    const PREDICATE = "publishableGames(eq(games.season, season))";
    expect(bodyOf("getSeasonGamesStamp")).toContain(PREDICATE);
    expect(bodyOf("getSeasonReportRows")).toContain(PREDICATE);
  });

  it("does not narrow that population to final games", () => {
    // Narrowing the WHERE is the original bug. Counting finals as one *component* of the
    // stamp is required — that is what still moves it as the season plays out.
    const body = bodyOf("getSeasonGamesStamp");
    expect(body).not.toContain('eq(games.status, "final")');
    expect(body).toContain("final");
  });
});
