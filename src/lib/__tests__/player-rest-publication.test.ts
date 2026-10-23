import { describe, expect, it } from "vitest";
import bundled from "@/data/shooting-current.json";
import { buildRows, indexPayload, type PlayerRestPayload } from "../player-rest";
import { mergeHistoricalAndCurrent, parseCurrentShooting, selectCurrentShooting } from "../player-rest-publication";

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

});
