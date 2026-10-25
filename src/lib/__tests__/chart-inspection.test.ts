import { describe, expect, it } from "vitest";
import { inspectionStep, nearestIndex } from "../chart-inspection";

describe("inspectionStep", () => {
  it("moves one item with the arrow keys and stops at the ends", () => {
    expect(inspectionStep("ArrowRight", 2, 5)).toBe(3);
    expect(inspectionStep("ArrowLeft", 2, 5)).toBe(1);
    expect(inspectionStep("ArrowRight", 4, 5)).toBe(4);
    expect(inspectionStep("ArrowLeft", 0, 5)).toBe(0);
  });

  it("jumps to the first and last item with Home and End", () => {
    expect(inspectionStep("Home", 3, 5)).toBe(0);
    expect(inspectionStep("End", 1, 5)).toBe(4);
  });

  it("leaves other keys and empty charts alone", () => {
    expect(inspectionStep("Tab", 2, 5)).toBeNull();
    expect(inspectionStep("ArrowUp", 2, 5)).toBeNull();
    expect(inspectionStep("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("nearestIndex", () => {
  it("rounds a pointer position to the nearest evenly spaced item", () => {
    expect(nearestIndex(0, 0, 100, 5)).toBe(0);
    expect(nearestIndex(37, 0, 100, 5)).toBe(1);
    expect(nearestIndex(38, 0, 100, 5)).toBe(2);
    expect(nearestIndex(100, 0, 100, 5)).toBe(4);
  });

  it("clamps positions outside the plot", () => {
    expect(nearestIndex(-20, 0, 100, 5)).toBe(0);
    expect(nearestIndex(140, 0, 100, 5)).toBe(4);
    expect(nearestIndex(50, 0, 100, 1)).toBe(0);
  });
});
