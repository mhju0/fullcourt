import { describe, expect, it } from "vitest";
import { courtNeighbour, inspectionStep, nearestIndex } from "../chart-inspection";

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

describe("courtNeighbour", () => {
  // A plus sign with one off-axis location: centre 0, right 1, left 2, up 3, down 4, far diagonal 5.
  const court = [
    { cx: 50, cy: 50 },
    { cx: 60, cy: 50 },
    { cx: 40, cy: 50 },
    { cx: 50, cy: 40 },
    { cx: 50, cy: 60 },
    { cx: 58, cy: 42 },
  ];

  it("moves to the nearest location on the pressed side, preferring a straight line", () => {
    expect(courtNeighbour(court, 0, "ArrowRight")).toBe(1);
    expect(courtNeighbour(court, 0, "ArrowLeft")).toBe(2);
    expect(courtNeighbour(court, 0, "ArrowUp")).toBe(3);
    expect(courtNeighbour(court, 0, "ArrowDown")).toBe(4);
  });

  it("stays put at the edge of the court and ignores other keys", () => {
    expect(courtNeighbour(court, 1, "ArrowRight")).toBeNull();
    expect(courtNeighbour(court, 0, "Home")).toBeNull();
    expect(courtNeighbour([], 0, "ArrowRight")).toBeNull();
  });
});
