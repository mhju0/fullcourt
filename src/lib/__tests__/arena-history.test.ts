import { describe, expect, it } from "vitest";
import { createArenaHistory, type ArenaHistory } from "../arena-history";

const citation = ["https://example.com/retained-primary-evidence"];
function history(): ArenaHistory {
  return {
    version: 1,
    arenas: [
      { id: "shared-building", name: "Shared building", city: "Test city", latitude: 34.04, longitude: -118.26, coordinateMethod: "operator marker", coordinateSourceUrls: citation },
      { id: "new-building", name: "New building", city: "Test city", latitude: 33.94, longitude: -118.34, coordinateMethod: "operator marker", coordinateSourceUrls: citation },
    ],
    eras: [
      { abbreviation: "LAL", from: "1999-07-01", arenaId: "shared-building", firstGameDate: "1999-11-03", lastGameDate: "2026-04-12", sourceUrls: citation },
      { abbreviation: "LAC", from: "1999-07-01", before: "2024-07-01", arenaId: "shared-building", firstGameDate: "1999-11-02", lastGameDate: "2024-05-01", sourceUrls: citation },
      { abbreviation: "LAC", from: "2024-07-01", arenaId: "new-building", firstGameDate: "2024-10-23", lastGameDate: "2026-04-12", sourceUrls: citation },
    ],
  };
}

describe("dated physical arena lookup", () => {
  it("uses the identical building object for shared homes, then switches only the moving team", () => {
    const locations = createArenaHistory(history());
    expect(locations.arenaFor("LAL", "2024-06-30")).toBe(locations.arenaFor("LAC", "2024-06-30"));
    expect(locations.arenaFor("LAC", "2024-07-01")?.id).toBe("new-building");
    expect(locations.arenaFor("LAL", "2024-07-01")?.id).toBe("shared-building");
    expect(locations.arenaFor("LAC", "1999-06-30")).toBeNull();
  });

  it("rejects a missing arena, contradictory intervals and unsourced coordinates", () => {
    const missing = history(); missing.eras[0].arenaId = "missing";
    expect(() => createArenaHistory(missing)).toThrow("Invalid dated");
    for (const start of ["2024-06-01", "2024-08-01"]) {
      const broken = history(); broken.eras[2].from = start;
      expect(() => createArenaHistory(broken)).toThrow("overlaps or has a gap");
    }
    const unsourced = history(); unsourced.arenas[0].coordinateSourceUrls = [];
    expect(() => createArenaHistory(unsourced)).toThrow("coordinate evidence");
  });

  it("does not confuse actual first/last game evidence with effective offseason bounds", () => {
    const locations = createArenaHistory(history());
    expect(locations.arenaFor("LAC", "1999-11-01")?.id).toBe("shared-building");
    const outside = history(); outside.eras[1].lastGameDate = "2024-07-01";
    expect(() => createArenaHistory(outside)).toThrow("Invalid dated");
    expect(() => locations.arenaFor("LAL", "2024-02-30")).toThrow("Eastern calendar date");
  });

  it("separates a bounded modeled base from an actual active arena", () => {
    const data = history();
    data.eras[1].before = "2023-07-01";
    data.eras[1].lastGameDate = "2023-04-01";
    data.modeledBaseOverrides = [{ abbreviation: "LAC", from: "2023-07-01", before: "2024-07-01",
      latitude: 34.04, longitude: -118.26, reason: "No operating relocation established", sourceUrls: citation }];
    const locations = createArenaHistory(data);
    expect(locations.arenaFor("LAC", "2024-01-01")).toBeNull();
    expect(locations.baseFor("LAC", "2024-01-01")).toMatchObject({ latitude: 34.04, longitude: -118.26 });
    expect(locations.requiresFixtureCorrection("LAC", "2024-01-01")).toBe(true);
    expect(locations.requiresFixtureCorrection("LAC", "2024-07-01")).toBe(false);
    data.modeledBaseOverrides[0].before = "2024-08-01";
    expect(() => createArenaHistory(data)).toThrow("overlaps or has a gap");
  });
});
