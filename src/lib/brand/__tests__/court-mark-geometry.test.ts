import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COURT_H, COURT_W, courtMarkPaths, MARK_CUTS } from "../court-mark-geometry";

describe("courtMarkPaths", () => {
  it("matches the ratified grid for the standard cut", () => {
    // The construction record: docs/design/explorations/2026-08-19-mark/.
    expect(courtMarkPaths(6)).toEqual({
      left: "M0 0 H33 L21 32 H0 Z",
      slash: "M33 0 H39 L27 32 H21 Z",
      right: "M39 0 H60 V32 H27 Z",
    });
  });

  it("pins the slash centroid to the court's center at every ramp width", () => {
    // The first construction shipped 6 units off-center — an artifact of the old
    // 72-unit viewBox, caught by eye on 2026-08-19. Equal-area panels are the rule.
    for (const { slashW } of Object.values(MARK_CUTS)) {
      const m = courtMarkPaths(slashW).slash.match(
        /^M([\d.]+) 0 H([\d.]+) L([\d.]+) \d+ H([\d.]+) Z$/
      );
      expect(m).not.toBeNull();
      const [tl, tr, br, bl] = m!.slice(1).map(Number);
      expect((tl + tr + bl + br) / 4).toBe(COURT_W / 2);
      expect(tr - tl).toBe(slashW);
      expect(br - bl).toBe(slashW);
    }
  });

  it("keeps the court within 0.3% of the NBA floor's 94:50", () => {
    // 60×32 is the closest integer-grid rectangle to 94:50 at width 60
    // (exact would be 60×31.91). Integer endpoints keep every raster crisp.
    expect([COURT_W, COURT_H]).toEqual([60, 32]);
    expect(Math.abs(COURT_W / COURT_H / (94 / 50) - 1)).toBeLessThan(0.003);
  });
});

describe("static cuts cannot drift from the geometry source", () => {
  // The previous mark's hand-copied drawings drifted twice (lean direction
  // 2026-07-30, hue split found 2026-08-19). Cuts that can import the builders
  // do (CourtMark, apple-icon, maskable-icon, opengraph-image — typecheck covers
  // them); the two static SVGs are pinned here instead.
  const cases: Array<[string, number]> = [
    ["src/app/icon.svg", MARK_CUTS.favicon.slashW],
    ["docs/logo.svg", MARK_CUTS.tile.slashW],
  ];

  for (const [file, slashW] of cases) {
    it(`${file} carries the canonical ${slashW}-unit-slash paths`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const { left, slash, right } = courtMarkPaths(slashW);
      for (const d of [left, slash, right]) expect(src).toContain(`d="${d}"`);
    });
  }
});
