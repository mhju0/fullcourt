import { describe, expect, it, vi } from "vitest";
import { parseCurrentShotQualityArtifact, shotQualityPublication } from "@/lib/shot-quality-publication";
import type { ShotQualityCell } from "@/types";

const cell: ShotQualityCell = { cellX: 0, cellY: 0, zoneBasic: null, zoneRange: null, zoneArea: null, fga: 2, fgm: 0, fg3a: 0, fg3m: 0, gbm: null, baseline: null };
function artifact() {
  return { schemaVersion: 1, snapshot: { season: "2026-27", generatedAt: "2026-10-21T12:00:00Z", source: {
    provider: "NBA Stats ShotChartDetail", url: "https://stats.nba.com/stats/shotchartdetail", fetchedAt: "2026-10-21T12:00:00Z", firstGameDate: "2026-10-20", lastGameDate: "2026-10-20", gameIds: ["0022600001"], shotCount: 2, droppedNoLocation: 0, droppedOutsideHalfCourt: 0,
  }, cells: [{ ...cell }] } };
}
function webArtifact() {
  const legacy = artifact();
  return { schemaVersion: 2, snapshot: { ...legacy.snapshot, source: {
    ...legacy.snapshot.source, provider: "NBA.com play-by-play", url: "https://www.nba.com/games",
    collectionStartedAt: "2026-10-21T11:00:00Z", shotCount: 100, teamFieldGoalAttempts: 1, droppedNoLocation: 2,
    formatGameCounts: { hanaV3: 1, ngss: 0 },
  }, cells: [{ ...cell, fga: 98 }] } };
}
describe("shot grid publication", () => {
  it("round-trips v1 without applying v2's new drop ceiling", () => {
    const legacy = artifact();
    legacy.snapshot.source.droppedNoLocation = 1;
    legacy.snapshot.source.shotCount = 3;
    expect(parseCurrentShotQualityArtifact(legacy)).toEqual(legacy.snapshot);
    expect(shotQualityPublication(legacy.snapshot.cells, parseCurrentShotQualityArtifact(legacy)).source).toBe("nba-stats-snapshot");
  });
  it("accepts a raw v2 publication at the combined two-percent drop boundary", () => {
    const current = webArtifact();
    current.snapshot.source.droppedNoLocation = 1;
    current.snapshot.source.droppedOutsideHalfCourt = 1;
    const parsed = parseCurrentShotQualityArtifact(current);
    expect(parsed).toEqual(current.snapshot);
    expect(shotQualityPublication(parsed!.cells, parsed)).toMatchObject({
      source: "nba-web-snapshot", sourceShotCount: 100, droppedShotCount: 2,
      models: { "gbm-v1": { ready: false }, "baseline-zone-v1": { ready: false } },
    });
  });
  it("accepts NGSS-only and mixed validated official formats without publishing model values", () => {
    const ngss = webArtifact();
    ngss.snapshot.source.formatGameCounts = { hanaV3: 0, ngss: 1 };
    expect(parseCurrentShotQualityArtifact(ngss)).toEqual(ngss.snapshot);
    const mixed = webArtifact();
    mixed.snapshot.source.gameIds.push("0022600002");
    mixed.snapshot.source.formatGameCounts = { hanaV3: 1, ngss: 1 };
    const parsed = parseCurrentShotQualityArtifact(mixed);
    expect(parsed).toEqual(mixed.snapshot);
    expect(shotQualityPublication(parsed!.cells, parsed)).toMatchObject({
      source: "nba-web-snapshot", gameCount: 2,
      models: { "gbm-v1": { ready: false }, "baseline-zone-v1": { ready: false } },
    });
  });
  const invalidWebCases: [string, (value: ReturnType<typeof webArtifact>) => void][] = [
    ["provider", value => { value.snapshot.source.provider = "NBA Stats ShotChartDetail"; }],
    ["format-specific provider", value => { value.snapshot.source.provider = "NBA.com hanaV3"; }],
    ["source URL", value => { value.snapshot.source.url += "?other=1"; }],
    ["collection timestamp order", value => { value.snapshot.source.collectionStartedAt = "2026-10-21T13:00:00Z"; }],
    ["collection timestamp syntax", value => { value.snapshot.source.collectionStartedAt = "2026-10-21"; }],
    ["fetch timestamp order", value => { value.snapshot.source.fetchedAt = "2026-10-21T13:00:00Z"; }],
    ["future generated clock", value => { value.snapshot.generatedAt = new Date(Date.now() + 360_000).toISOString(); }],
    ["invalid calendar date", value => { value.snapshot.source.firstGameDate = "2026-10-32"; }],
    ["reversed game dates", value => { value.snapshot.source.firstGameDate = "2026-10-21"; }],
    ["Eastern game date after fetch", value => { value.snapshot.source.lastGameDate = "2026-10-22"; }],
    ["season label", value => { value.snapshot.season = "2026-28"; }],
    ["game season", value => { value.snapshot.source.gameIds = ["0022500001"]; }],
    ["NBA game ID", value => { value.snapshot.source.gameIds = ["espn-401909881"]; }],
    ["duplicate game IDs", value => {
      value.snapshot.source.gameIds.push(value.snapshot.source.gameIds[0]);
      value.snapshot.source.formatGameCounts.hanaV3 = 2;
    }],
    ["format game sum", value => { value.snapshot.source.formatGameCounts = { hanaV3: 0, ngss: 0 }; }],
    ["negative format count", value => { value.snapshot.source.formatGameCounts = { hanaV3: -1, ngss: 2 }; }],
    ["fractional format counts", value => { value.snapshot.source.formatGameCounts = { hanaV3: .5, ngss: .5 }; }],
    ["duplicate cells", value => {
      const duplicate = { ...value.snapshot.cells[0], fga: 49 };
      value.snapshot.cells = [duplicate, { ...duplicate }];
    }],
    ["cell count arithmetic", value => { value.snapshot.cells[0].fgm = 99; }],
    ["source count arithmetic", value => { value.snapshot.source.shotCount = 101; }],
    ["team-only attempts outside no-location subset", value => { value.snapshot.source.teamFieldGoalAttempts = 3; }],
    ["negative team-only count", value => { value.snapshot.source.teamFieldGoalAttempts = -1; }],
    ["combined drops above two percent", value => {
      value.snapshot.source.droppedOutsideHalfCourt = 1;
      value.snapshot.cells[0].fga = 97;
    }],
  ];
  it.each(invalidWebCases)("rejects v2 %s corruption", (_label, mutate) => {
    const current = webArtifact();
    mutate(current);
    expect(parseCurrentShotQualityArtifact(current)).toBeNull();
  });
  it.each(["zoneBasic", "zoneRange", "zoneArea"] as const)("rejects a v2 %s label until zone inference is validated", key => {
    const current = webArtifact();
    current.snapshot.cells[0][key] = "Restricted Area";
    expect(parseCurrentShotQualityArtifact(current)).toBeNull();
  });
  it.each(["gbm", "baseline"] as const)("rejects v2 %s model values", key => {
    const current = webArtifact();
    current.snapshot.cells[0][key] = { pMake: .5, expectedEfg: .5, xpps: 1 };
    expect(parseCurrentShotQualityArtifact(current)).toBeNull();
  });
  it("rejects unknown v2 fields instead of concealing unsupported accounting", () => {
    const current = webArtifact();
    expect(parseCurrentShotQualityArtifact({ ...current, unverified: true })).toBeNull();
    expect(parseCurrentShotQualityArtifact({ ...current, snapshot: { ...current.snapshot, source: { ...current.snapshot.source, unknownTeam: 1 } } })).toBeNull();
    expect(parseCurrentShotQualityArtifact({ ...current, snapshot: { ...current.snapshot, cells: [{ ...current.snapshot.cells[0], teamId: "unknown" }] } })).toBeNull();
    expect(parseCurrentShotQualityArtifact({ ...current, schemaVersion: 1 })).toBeNull();
  });
  it("requires both known format counters and rejects unrecognized format accounting", () => {
    const current = webArtifact();
    for (const formatGameCounts of [{ hanaV3: 1 }, { ngss: 1 }, { hanaV3: 1, ngss: 0, unknown: 0 }, { hanaV3: "1", ngss: 0 }]) {
      expect(parseCurrentShotQualityArtifact({ ...current, snapshot: { ...current.snapshot, source: { ...current.snapshot.source, formatGameCounts } } })).toBeNull();
    }
    const withoutFormatCounts: Partial<typeof current.snapshot.source> = { ...current.snapshot.source };
    delete withoutFormatCounts.formatGameCounts;
    expect(parseCurrentShotQualityArtifact({ ...current, snapshot: { ...current.snapshot, source: withoutFormatCounts } })).toBeNull();
  });
  it("preserves observed zero makes and null unavailable models", () => {
    const parsed = parseCurrentShotQualityArtifact(artifact());
    expect(parsed?.cells[0].fgm).toBe(0);
    expect(parsed?.cells[0].gbm).toBeNull();
    expect(shotQualityPublication(parsed!.cells, parsed).models["gbm-v1"].ready).toBe(false);
  });
  it("requires complete valid coverage independently for each model", () => {
    const model = { pMake: .5, expectedEfg: .5, xpps: 1 };
    const meta = shotQualityPublication([{ ...cell, baseline: model, gbm: model }, { ...cell, cellX: 1, baseline: model }]);
    expect(meta.models["gbm-v1"]).toMatchObject({ coveredCells: 1, totalCells: 2, ready: false });
    expect(meta.models["baseline-zone-v1"].ready).toBe(true);
    expect(shotQualityPublication([]).models["gbm-v1"].ready).toBe(false);
    expect(shotQualityPublication([{ ...cell, gbm: { ...model, pMake: NaN } }]).models["gbm-v1"].coveredCells).toBe(0);
  });
  it("rejects future game dates, invalid calendar dates, timestamp reversal and future clocks", () => {
    const futureGame = artifact();
    futureGame.snapshot.source.firstGameDate = "2027-06-01";
    futureGame.snapshot.source.lastGameDate = "2027-06-01";
    expect(parseCurrentShotQualityArtifact(futureGame)).toBeNull();
    const reversed = artifact(); reversed.snapshot.source.fetchedAt = "2026-10-22T12:00:00Z";
    expect(parseCurrentShotQualityArtifact(reversed)).toBeNull();
    const futureClock = artifact();
    futureClock.snapshot.generatedAt = new Date(Date.now() + 360_000).toISOString();
    futureClock.snapshot.source.fetchedAt = futureClock.snapshot.generatedAt;
    expect(parseCurrentShotQualityArtifact(futureClock)).toBeNull();
    const easternBoundary = artifact();
    easternBoundary.snapshot.generatedAt = "2026-10-21T02:00:00Z";
    easternBoundary.snapshot.source.fetchedAt = easternBoundary.snapshot.generatedAt;
    easternBoundary.snapshot.source.lastGameDate = "2026-10-21";
    expect(parseCurrentShotQualityArtifact(easternBoundary)).toBeNull();
  });
  it("rejects a nonexistent calendar day even when its period and clock bounds would pass", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-03-02T12:00:00Z"));
    try {
      const invalidDate = artifact();
      invalidDate.snapshot.generatedAt = "2027-03-01T12:00:00Z";
      invalidDate.snapshot.source.fetchedAt = invalidDate.snapshot.generatedAt;
      invalidDate.snapshot.source.firstGameDate = "2027-02-30";
      invalidDate.snapshot.source.lastGameDate = "2027-02-30";
      expect(parseCurrentShotQualityArtifact(invalidDate)).toBeNull();
    } finally { now.mockRestore(); }
  });
  it("rejects duplicate cells, source season mismatches and count corruption", () => {
    const duplicate = artifact(); duplicate.snapshot.cells.push({ ...cell });
    expect(parseCurrentShotQualityArtifact(duplicate)).toBeNull();
    const mismatch = artifact(); mismatch.snapshot.source.gameIds = ["0022500001"];
    expect(parseCurrentShotQualityArtifact(mismatch)).toBeNull();
    const counts = artifact(); counts.snapshot.cells[0].fgm = 3;
    expect(parseCurrentShotQualityArtifact(counts)).toBeNull();
    const total = artifact(); total.snapshot.source.shotCount = 5;
    expect(parseCurrentShotQualityArtifact(total)).toBeNull();
  });
});
