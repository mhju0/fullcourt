import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPACE, SPACE_CARD, SPACE_NESTED_ROW, TYPE, termThStyle, termTdStyle, termThUnitStyle } from "@/lib/terminal-styles";

/**
 * The scales, pinned.
 *
 * `TYPE` exists because the type scale used to be a docblock listing its slots as *ranges*
 * ("13-16px emphasized inline", "20-24px stat value"), and by 2026-08-18 the app rendered 36
 * distinct font sizes, including 9.5, 10.5, 12.5, 17, 19, 21 and 28. Two things this file
 * protects, neither of which any other test would notice:
 *
 * 1. **A new step being added.** The failure mode is not a wrong number — it is a *fourteenth*
 *    number, added because none of the eight quite fit. That is how the range came back last
 *    time. Adding a step should mean editing this list and saying why in the commit.
 * 2. **`scripts/audit_design_scale.mjs` drifting from the source of truth.** The script keeps
 *    its own copy of both scales (it is plain node, so it cannot import a `.ts` module), and a
 *    stale copy reports a clean sheet while the app drifts — the worst possible failure for an
 *    instrument, because it is silent and reassuring.
 *
 * Deliberately NOT a lint rule over the whole tree: docs/FRONTEND.md records that a scale nobody
 * has stress-tested through a real feature becomes a rule people disable. The audit script
 * reports; this pins.
 */
describe("the type scale", () => {
  it("has exactly these eight steps, each at least 1px from its neighbours", () => {
    // Not a snapshot: the list is written out so a diff shows which step moved.
    expect(TYPE).toEqual({
      micro: 10,
      label: 11,
      data: 12,
      body: 15,
      emph: 18,
      stat: 24,
      title: 32,
      figure: 40,
    });

    const steps = Object.values(TYPE);
    expect(steps).toStrictEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("carries no fractional step", () => {
    // 9.5px was the app's only sub-pixel size (`termThUnitStyle`) and nothing chose it — it was
    // 10 nudged by eye in one place. A fractional step also renders differently per platform,
    // so it cannot be relied on to look like the distinction it claims to be.
    for (const [name, px] of Object.entries(TYPE)) {
      expect(Number.isInteger(px), `TYPE.${name} = ${px}`).toBe(true);
    }
  });

  it("is what the shared table styles are built from", () => {
    // These three reach every one of the app's tables through `DataTable`, so a literal creeping
    // back in here would put 21 tables off the scale at once.
    expect(termThStyle.fontSize).toBe(TYPE.label);
    expect(termTdStyle.fontSize).toBe(TYPE.data);
    expect(termThUnitStyle.fontSize).toBe(TYPE.micro);
  });

  it("puts a unit sub-label below its own column header, and the header below its cells", () => {
    // The ladder the three label sizes exist to draw. If these ever invert, a column's unit line
    // is competing with the figures it qualifies.
    expect(TYPE.micro).toBeLessThan(TYPE.label);
    expect(TYPE.label).toBeLessThan(TYPE.data);
  });
});

describe("the spacing scale", () => {
  it("has exactly these seven steps", () => {
    expect(Object.values(SPACE)).toEqual([4, 8, 12, 16, 24, 32, 48]);
  });

  it("keeps the two rails and the one sanctioned third on the scale", () => {
    // The inner rail IS a step, and the third rail is a step past it — not a hand-set 26, which
    // is what `SPACE_NESTED_ROW` replaced.
    expect(SPACE_CARD).toBe(SPACE.lg);
    expect(SPACE_NESTED_ROW).toBe(SPACE_CARD + SPACE.md);
    expect(Object.values(SPACE)).toContain(SPACE_CARD);
  });
});

describe("the audit script", () => {
  const SCRIPT = readFileSync(join(process.cwd(), "scripts", "audit_design_scale.mjs"), "utf8");

  /** The literal array the script compares against, e.g. `const TYPE_SCALE = [10, 11, …];` */
  function scaleIn(name: string): number[] {
    const m = new RegExp(String.raw`const ${name} = \[([^\]]+)\]`).exec(SCRIPT);
    expect(m, `${name} not found in scripts/audit_design_scale.mjs`).not.toBeNull();
    return m![1].split(",").map((s) => Number(s.trim()));
  }

  it("measures against the same type scale this module exports", () => {
    expect(scaleIn("TYPE_SCALE")).toEqual(Object.values(TYPE));
  });

  it("measures against the same spacing scale this module exports", () => {
    expect(scaleIn("SPACE_SCALE")).toEqual(Object.values(SPACE));
  });
});
