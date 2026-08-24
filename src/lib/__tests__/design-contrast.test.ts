import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins the palette's contrast so it cannot regress silently.
 *
 * The 2026-08-24 axe pass reduced ~470 colour flags to one decision: the data poles are
 * validated at the 3:1 GRAPHICS bar and sit at 3.0–4.4:1 as running text, below AA's 4.5.
 * The answer was a second pair of tokens — the same hues one step darker — used wherever a
 * pole colours SMALL text. This test is the enforcement half of that decision: globals.css
 * says "change them there first", and here is where a change that dips below the bar fails.
 *
 * Grounds are the three the text tokens were validated on: white (--term-surface), the
 * grey card fill (--term-surface-2), and #EEE9EC — the darkest composited ground the axe
 * sweep actually observed pole text sitting on (a tinted table row), kept as a literal
 * because it is a browser-composited result, not a token.
 */

const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`token ${name} not found as a 6-digit hex in globals.css`);
  return m[1].toLowerCase();
}

function luminance(hex: string): number {
  const chan = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(1) + 0.7152 * chan(3) + 0.0722 * chan(5);
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const OBSERVED_WASH = "#eee9ec";

describe("design contrast — the pinned bars", () => {
  const grounds = {
    "--term-surface": token("--term-surface"),
    "--term-surface-2": token("--term-surface-2"),
    "observed row wash": OBSERVED_WASH,
  };

  it("keeps the text-grade poles at AA (4.5:1) on every validated ground", () => {
    for (const name of ["--term-red-text", "--term-blue-text"]) {
      const fg = token(name);
      for (const [ground, bg] of Object.entries(grounds)) {
        expect(contrast(fg, bg), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the graphics poles at the 3:1 graphics bar on white", () => {
    // Fills, bars, borders and >=24px figures read these; they were never asked to pass 4.5.
    for (const name of ["--term-red", "--term-blue"]) {
      expect(contrast(token(name), token("--term-surface")), name).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps each text token darker than its own pole, not a different hue doing a new job", () => {
    // "One step darker, same hue family" is the promise that lets both grades appear on one
    // page without reading as two encodings. Darker is checkable; eyeballing hue is not.
    expect(luminance(token("--term-red-text"))).toBeLessThan(luminance(token("--term-red")));
    expect(luminance(token("--term-blue-text"))).toBeLessThan(luminance(token("--term-blue")));
  });

  it("keeps the body text tokens comfortably past AA on the page grounds", () => {
    // Not part of the 2026-08-24 decision, but the same regression class: muted text is the
    // most common small text on the site and sits on all three grounds.
    for (const name of ["--term-text", "--term-text-muted"]) {
      const fg = token(name);
      for (const [ground, bg] of Object.entries(grounds)) {
        expect(contrast(fg, bg), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
