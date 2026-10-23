import { describe, expect, it } from "vitest";
import { parseCurrentShotQualityArtifact, shotQualityPublication } from "@/lib/shot-quality-publication";
import type { ShotQualityCell } from "@/types";

const cell: ShotQualityCell = { cellX: 0, cellY: 0, zoneBasic: null, zoneRange: null, zoneArea: null, fga: 2, fgm: 0, fg3a: 0, fg3m: 0, gbm: null, baseline: null };
function artifact() {
  return { schemaVersion: 1, snapshot: { season: "2026-27", generatedAt: "2026-10-21T12:00:00Z", source: {
    provider: "NBA Stats ShotChartDetail", url: "https://stats.nba.com/stats/shotchartdetail", fetchedAt: "2026-10-21T12:00:00Z", firstGameDate: "2026-10-20", lastGameDate: "2026-10-20", gameIds: ["0022600001"], shotCount: 2, droppedNoLocation: 0, droppedOutsideHalfCourt: 0,
  }, cells: [{ ...cell }] } };
}
describe("shot grid publication", () => {
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
