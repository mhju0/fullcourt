import { describe, expect, it } from "vitest";
import bundled from "@/data/shooting-current.json";
import { buildRows, indexPayload, type PlayerRestPayload } from "../player-rest";
import { mergeHistoricalAndCurrent, parseCurrentShooting, selectCurrentShooting, selectShootingHistory } from "../player-rest-publication";

const historical: PlayerRestPayload = {
  generated: "2026-10-23", names: ["Same Name"], teams: ["BOS"], pos: ["G"],
  seasons: [[0,2025,0,25,2,4,50,2,50,2,50,4,2,2,8,4,4]], shrunk: [],
};

describe("current Shooting publication", () => {
  it("accepts the authentic generated current snapshot and reconciles its game coverage", () => {
    const current = parseCurrentShooting(bundled);
    expect(current).not.toBeNull();
    expect(current!.publication!.observedGames).toBe(16);
    expect(current!.publication!.missingGameIds).toEqual([]);
    expect(current!.seasons).toHaveLength(330);
    expect(current!.seasons.every(row => row[7] === 0 && row[9] === 0)).toBe(true);
  });
  it("rejects missing games, inconsistent moments, duplicate identities and a wrong season", () => {
    for (const mutate of [
      (p: typeof bundled) => { p.publication.missingGameIds = ["missing"] as never; },
      (p: typeof bundled) => { p.seasons[0][14] += 1; },
      (p: typeof bundled) => { p.playerIds[1] = p.playerIds[0]; },
      (p: typeof bundled) => { p.seasons[0][1] = 2025; },
    ]) {
      const value = structuredClone(bundled);
      mutate(value);
      expect(parseCurrentShooting(value)).toBeNull();
    }
  });
  it("never joins current and historical players by the same display name", () => {
    const current = parseCurrentShooting(structuredClone(bundled))!;
    current.names[0] = "Same Name";
    const merged = mergeHistoricalAndCurrent(historical, current);
    const index = indexPayload(merged);
    const base = { minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };
    const career = buildRows(index, { ...base, year: "career" });
    expect(career).toHaveLength(1);
    expect(career[0].fga).toBe(4);
    expect(buildRows(index, { ...base, year: 2026 })).toHaveLength(330);
    expect(merged.shrunk).toEqual(historical.shrunk);
  });
  it("rejects false coverage metadata and future or impossible observation dates", () => {
    for (const mutate of [
      (p: typeof bundled) => { p.publication.source = "unknown"; },
      (p: typeof bundled) => { p.publication.fixtureIdentitySha256 = "invalid"; },
      (p: typeof bundled) => { p.publication.fixtureIds[1] = p.publication.fixtureIds[0]; },
      (p: typeof bundled) => { p.publication.fixtureIds[0] = "invalid"; },
      (p: typeof bundled) => { p.publication.historyGames += 1; },
      (p: typeof bundled) => { p.publication.through = "2026-02-30"; },
      (p: typeof bundled) => { p.generated = p.publication.generatedAt = "2099-10-23T00:00:00Z"; },
    ]) {
      const value = structuredClone(bundled);
      mutate(value);
      expect(parseCurrentShooting(value)).toBeNull();
    }
  });
  it("retains bundled observations on source rollback, membership loss or the wrong season", () => {
    const now = Date.parse(bundled.generated) + 86_400_000;
    for (const mutate of [
      (p: typeof bundled) => { p.generated = p.publication.generatedAt = "2026-10-23T00:00:00Z"; },
      (p: typeof bundled) => { p.publication.through = "2026-10-21"; },
      (p: typeof bundled) => { p.publication.fixtureIds[0] = "espn-999999999"; },
      (p: typeof bundled) => { p.playerIds[0] = "espn:999999999"; },
      (p: typeof bundled) => { p.publication.season = "2025-26"; },
    ]) {
      const remote = structuredClone(bundled);
      mutate(remote);
      const result = selectCurrentShooting(remote, bundled, "2026-27", now);
      expect(result.rejected).toBe(true);
      expect(result.current).toBe(bundled);
    }
    expect(selectCurrentShooting(structuredClone(bundled), bundled, "2026-27", now).rejected).toBe(false);
    expect(selectCurrentShooting(null, bundled, "2027-28", now).current).toBeNull();
  });

  it("retains a completed previous season at rollover and adds the next season without pooling careers", () => {
    const finalPrevious = structuredClone(bundled);
    finalPrevious.generated = finalPrevious.publication.generatedAt = "2027-04-21T12:00:00Z";
    finalPrevious.publication.through = "2027-04-20";
    finalPrevious.publication.fixtureIds = [...finalPrevious.publication.fixtureIds,
      ...Array.from({ length: 1000 - finalPrevious.publication.fixtureIds.length }, (_, i) => `espn-${800000000 + i}`)];
    finalPrevious.publication.expectedGames = finalPrevious.publication.observedGames = finalPrevious.publication.historyGames = 1000;
    const next = structuredClone(bundled);
    next.generated = next.publication.generatedAt = "2027-10-22T12:00:00Z";
    next.publication.season = "2027-28";
    next.publication.through = "2027-10-21";
    next.publication.fixtureIds = next.publication.fixtureIds.map((_, i) => `espn-${900000000 + i}`);
    next.seasons.forEach(row => { row[1] = 2027; });
    const now = Date.parse("2027-10-23T12:00:00Z");
    const beforeFirstGame = selectShootingHistory([finalPrevious], bundled, "2027-28", now);
    expect(beforeFirstGame.publications.map(p => p.publication!.season)).toEqual(["2026-27"]);
    expect(beforeFirstGame.publications[0].publication!.observedGames).toBe(1000);
    expect(beforeFirstGame.rejected).toBe(false);
    const selected = selectShootingHistory([finalPrevious, next], bundled, "2027-28", now);
    const merged = selected.publications.reduce(mergeHistoricalAndCurrent, historical);
    const index = indexPayload(merged);
    expect(index.years).toEqual([2027, 2026, 2025]);
    expect(merged.seasonOnlyPlayers).toHaveLength(660);
    const base = { minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };
    expect(buildRows(index, { ...base, year: 2026 })).toHaveLength(330);
    expect(buildRows(index, { ...base, year: 2027 })).toHaveLength(330);
    expect(buildRows(index, { ...base, year: "career" })).toHaveLength(1);
    expect(buildRows(index, { ...base, year: "career" })[0].fga).toBe(4);
    expect(merged.shrunk).toEqual(historical.shrunk);
    expect(mergeHistoricalAndCurrent(merged, next)).toBe(merged);
    expect(mergeHistoricalAndCurrent(merged, finalPrevious)).toBe(merged);
  });
  it("keeps a valid older bundled season when a future or malformed history entry is rejected", () => {
    const future = structuredClone(bundled);
    future.publication.season = "2028-29";
    future.publication.through = "2028-10-21";
    future.generated = future.publication.generatedAt = "2028-10-22T12:00:00Z";
    future.seasons.forEach(row => { row[1] = 2028; });
    const selected = selectShootingHistory([null, { version: "wrong-module" }, future], bundled, "2027-28", Date.parse("2028-10-23T12:00:00Z"));
    expect(selected.rejected).toBe(true);
    expect(selected.publications).toEqual([bundled]);
  });

});
