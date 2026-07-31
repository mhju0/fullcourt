import { describe, expect, it } from "vitest";
import { grindCellTone } from "@/components/playoff-grind-matrix";

const cell = (winPct: number, n = 50) => ({ winPct, n });

describe("grindCellTone", () => {
  it("lights only the highest cell", () => {
    const all = [cell(63), cell(85.4), cell(66), cell(60)];
    expect(grindCellTone(all[1], all)).toBe("lit");
    expect(grindCellTone(all[0], all)).toBe("plain");
    expect(grindCellTone(all[2], all)).toBe("plain");
    expect(grindCellTone(all[3], all)).toBe("plain");
  });

  it("lights nothing when the cells are tied, rather than lighting two", () => {
    // A tie means there is no story to point at. Highlighting both would assert one.
    const all = [cell(70), cell(70), cell(60), cell(55)];
    expect(all.every((c) => grindCellTone(c, all) === "plain")).toBe(true);
  });

  it("ignores cells with too few series to mean anything", () => {
    // A 100% cell built from 3 series is noise, not the finding.
    const all = [cell(100, 3), cell(85.4, 89), cell(66, 44), cell(60, 72)];
    expect(grindCellTone(all[1], all)).toBe("lit");
    expect(grindCellTone(all[0], all)).toBe("plain");
  });
});
