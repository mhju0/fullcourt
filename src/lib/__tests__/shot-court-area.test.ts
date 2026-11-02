import { describe, expect, it } from "vitest";
import { shotCourtAreaLabel } from "@/lib/shot-court-area";

const atCenter = (x: number, y: number) => ({ cellX: x - .5, cellY: y - .5, zoneBasic: null });

describe("display-only shot court areas", () => {
  it.each([
    [0, 0, "Near rim"], [0, 8, "Paint"], [8, 18, "Mid-range"],
    [-24, 3, "Left corner"], [23, 3, "Right corner"], [0, 24, "Above the arc"],
  ] as const)("names cell (%s, %s) as %s", (cellX, cellY, label) => {
    expect(shotCourtAreaLabel({ cellX, cellY, zoneBasic: null })).toBe(label);
  });

  const epsilon = 1e-6;
  const cornerY = Math.sqrt(23.75 ** 2 - 22 ** 2);
  it.each([
    [0, 4 - epsilon, "Near rim"], [0, 4, "Near rim"], [0, 4 + epsilon, "Paint"],
    [8 - epsilon, 10, "Paint"], [8, 10, "Paint"], [8 + epsilon, 10, "Mid-range"],
    [0, 13.75 - epsilon, "Paint"], [0, 13.75, "Paint"], [0, 13.75 + epsilon, "Mid-range"],
    [0, -5.25 - epsilon, "Mid-range"], [0, -5.25, "Paint"], [0, -5.25 + epsilon, "Paint"],
    [22 - epsilon, 0, "Mid-range"], [22, 0, "Mid-range"], [22 + epsilon, 0, "Right corner"],
    [22.5, cornerY - epsilon, "Right corner"], [22.5, cornerY, "Right corner"], [22.5, cornerY + epsilon, "Above the arc"],
    [0, 23.75 - epsilon, "Mid-range"], [0, 23.75, "Mid-range"], [0, 23.75 + epsilon, "Above the arc"],
  ] as const)("assigns center (%s, %s) to %s at area boundaries", (x, y, label) => {
    expect(shotCourtAreaLabel(atCenter(x, y))).toBe(label);
  });

  it("uses baseline-relative paint bounds for negative rim-relative y", () => {
    expect(shotCourtAreaLabel({ cellX: 0, cellY: -5, zoneBasic: null })).toBe("Paint");
  });

  it("mirrors cellX as -cellX-1 throughout the valid grid", () => {
    for (let cellX = 0; cellX <= 24; cellX++) {
      for (let cellY = -5; cellY <= 41; cellY++) {
        const right = shotCourtAreaLabel({ cellX, cellY, zoneBasic: null });
        const left = shotCourtAreaLabel({ cellX: -cellX - 1, cellY, zoneBasic: null });
        expect(left).toBe(right === "Right corner" ? "Left corner" : right);
      }
    }
  });

  it.each(["Restricted Area", "Source label", ""])("preserves non-null source label %j", zoneBasic => {
    expect(shotCourtAreaLabel({ cellX: 23, cellY: 3, zoneBasic })).toBe(zoneBasic);
  });

  it("does not fill or mutate source zones, counts or models", () => {
    const cell = Object.freeze({ cellX: 23, cellY: 3, zoneBasic: null, zoneRange: null, zoneArea: null,
      fga: 12, fgm: 4, fg3a: 11, fg3m: 4, gbm: null, baseline: null });
    const before = { ...cell };
    expect(shotCourtAreaLabel(cell)).toBe("Right corner");
    expect(cell).toEqual(before);
  });

  it("ignores season, counts and shot type when naming the same center", () => {
    const first = { cellX: 0, cellY: 0, zoneBasic: null, season: "1996-97", fga: 1, shotType: "2pt" };
    const second = { ...first, season: "2026-27", fga: 100, shotType: "3pt" };
    expect(shotCourtAreaLabel(first)).toBe("Near rim");
    expect(shotCourtAreaLabel(second)).toBe("Near rim");
  });
});
