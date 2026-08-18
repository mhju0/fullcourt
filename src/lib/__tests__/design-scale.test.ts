import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD, SPACE, SPACE_CARD, SPACE_NESTED_ROW, TRACK, TYPE, termThStyle, termTdStyle, termThUnitStyle } from "@/lib/terminal-styles";

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

describe("the tracking and leading scales", () => {
  it("has exactly four tracking steps", () => {
    expect(TRACK).toEqual({
      label: "0.08em",
      sub: "0.04em",
      data: "0.06em",
      figure: "-0.01em",
    });
  });

  it("opens up as the type gets smaller and tightens as it gets larger", () => {
    // The typographic rule the four values encode, rather than five files' worth of habit: a
    // 10-11px cap line needs more air than a 12px one, and a 24px numeral wants closing up.
    // If this ever inverts, the scale has stopped meaning anything and is just four numbers.
    const em = (v: string) => parseFloat(v);
    expect(em(TRACK.label)).toBeGreaterThan(em(TRACK.data));
    expect(em(TRACK.data)).toBeGreaterThan(em(TRACK.sub));
    expect(em(TRACK.figure)).toBeLessThan(0);
  });

  it("has exactly three leading steps, tightest for figures", () => {
    expect(LEAD).toEqual({ figure: 1.1, label: 1.4, body: 1.55 });
    expect(LEAD.figure).toBeLessThan(LEAD.label);
    expect(LEAD.label).toBeLessThan(LEAD.body);
  });
});

describe("the class layer", () => {
  // `globals.css` carries a SECOND copy of all three scales, as a Tailwind `@theme` block, because
  // a responsive step cannot be written as an inline style — `text-[16px] sm:text-data`, the iOS
  // zoom floor, is the standing example. Two copies is the hazard these four tests exist to close.
  const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

  /** Every `--<prefix>-<name>: <value>;` in the file, as a map. */
  function themeVars(prefix: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of CSS.matchAll(new RegExp(String.raw`--${prefix}-([a-z]+):\s*([^;]+);`, "g"))) {
      out[m[1]] = m[2].trim();
    }
    return out;
  }

  it("names the same type steps as TYPE", () => {
    const css = themeVars("text");
    expect(Object.keys(css).sort()).toEqual(Object.keys(TYPE).sort());
    for (const [name, px] of Object.entries(TYPE)) {
      expect(css[name], `--text-${name}`).toBe(`${px}px`);
    }
  });

  it("names the same tracking steps as TRACK", () => {
    const css = themeVars("tracking");
    // `tracking-tight` is Tailwind's own and is not ours to own, so compare only our keys.
    for (const [name, value] of Object.entries(TRACK)) {
      expect(css[name], `--tracking-${name}`).toBe(value);
    }
    expect(Object.keys(TRACK).every((k) => k in css)).toBe(true);
  });

  it("names the same leading steps as LEAD", () => {
    const css = themeVars("leading");
    for (const [name, value] of Object.entries(LEAD)) {
      expect(css[name], `--leading-${name}`).toBe(String(value));
    }
  });

  it("keeps the iOS zoom floor as a literal, because it is a threshold and not a step", () => {
    // If this becomes `text-label sm:text-data`, mobile Safari zooms the page on focus and does
    // not undo it on blur. 16px is the browser's number, not the design system's.
    expect(CSS.includes("--text-16") || CSS.includes("--text-floor")).toBe(false);
  });
});

describe("the audit script", () => {
  const SCRIPT = readFileSync(join(process.cwd(), "scripts", "audit_design_scale.mjs"), "utf8");

  /** The literal array the script compares against, e.g. `const TYPE_SCALE = [10, 11, …];` */
  function rawScaleIn(name: string): string[] {
    const m = new RegExp(String.raw`const ${name} = \[([^\]]+)\]`).exec(SCRIPT);
    expect(m, `${name} not found in scripts/audit_design_scale.mjs`).not.toBeNull();
    return m![1].split(",").map((s) => s.trim());
  }
  const scaleIn = (name: string) => rawScaleIn(name).map(Number);
  const stringScaleIn = (name: string) => rawScaleIn(name).map((s) => s.replace(/^"|"$/g, ""));

  it("measures against the same type scale this module exports", () => {
    expect(scaleIn("TYPE_SCALE")).toEqual(Object.values(TYPE));
  });

  it("measures against the same spacing scale this module exports", () => {
    expect(scaleIn("SPACE_SCALE")).toEqual(Object.values(SPACE));
  });

  it("measures against the same tracking and leading scales", () => {
    // Order differs from the token object on purpose in the script (it reads as a list of
    // permitted values, not a ladder), so compare as sets.
    expect(new Set(stringScaleIn("TRACK_SCALE"))).toEqual(new Set(Object.values(TRACK)));
    expect(new Set(scaleIn("LEAD_SCALE"))).toEqual(new Set(Object.values(LEAD)));
  });
});
