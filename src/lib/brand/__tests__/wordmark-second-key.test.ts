import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HOLLOW_STROKE_EM, hollowUFor, U_GLYPH } from "../wordmark-second-key";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the Second Key geometry", () => {
  it("is the extracted Geist ExtraBold U, unchanged", () => {
    // One closed contour — Geist's U has no counter. A second `M` or a moved
    // metric means the path was regenerated; that only happens if the bundled
    // font file itself changed.
    expect(U_GLYPH.path.startsWith("M354 726")).toBe(true);
    expect(U_GLYPH.path.endsWith("Z")).toBe(true);
    expect(U_GLYPH.path.match(/M/g)).toHaveLength(1);
    expect(U_GLYPH).toMatchObject({
      advance: 708,
      capHeight: 710,
      overshoot: 16,
      ascender: 1005,
      unitsPerEm: 1000,
    });
  });

  it("seats the satori rendering on the text baseline", () => {
    const u = hollowUFor(92, "#818CF8");
    // marginTop + pad puts the glyph's top at (ascender − capHeight) below the
    // line-box top — where the neighbouring caps' tops are.
    expect(u.marginTop + (16 / 1000) * 92).toBeCloseTo(((1005 - 710) / 1000) * 92, 6);
    expect(u.width).toBeCloseTo((708 / 1000) * 92, 6);
    expect(u.src.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decodeURIComponent(u.src.slice("data:image/svg+xml,".length));
    expect(svg).toContain('fill="none"');
    expect(svg).toContain(`stroke-width="${HOLLOW_STROKE_EM * 1000}"`);
    expect(svg).toContain('stroke="#818CF8"');
  });
});

describe("the Second Key ships on every wordmark surface", () => {
  // The lockup renders in three places. If one drops the hollow U — or a fourth
  // copy appears without it — the wordmark silently forks. Same guard idea as
  // publishable-games.test.ts: pin the call sites, not just the mechanism.

  it("nav and front door render the hollow U inside COURT", () => {
    for (const rel of ["src/components/nav-bar.tsx", "src/components/about-content.tsx"]) {
      const src = read(rel);
      expect(src, rel).toContain('className="wordmark-u-hollow"');
      // The U between CO and RT, not some other letter.
      expect(src.replace(/\s+/g, ""), rel).toMatch(/CO<spanclassName="wordmark-u-hollow"[^>]*>U<\/span>RT/);
    }
  });

  it("the OG card renders the hollow U through the shared geometry", () => {
    const src = read("src/app/opengraph-image.tsx");
    expect(src).toContain("hollowUFor(");
    // The plain-text COURT span is gone — the away key cannot quietly come back solid.
    expect(src).not.toMatch(/>COURT</);
  });

  it("the CSS class and the lib agree on the stroke, at both ends", () => {
    const css = read("src/app/globals.css");
    // Supported branch: the hollow stroke, at the lib's em value.
    expect(css).toContain(`-webkit-text-stroke: var(--wordmark-u-stroke, ${HOLLOW_STROKE_EM}em)`);
    // Fallback branch: the ghost — the class must render *something* deliberate
    // where text-stroke does not exist, never an invisible letter.
    const bare = css.match(/\.wordmark-u-hollow\s*\{[^}]*\}/);
    expect(bare?.[0]).toContain("opacity: 0.34");
    expect(bare?.[0]).not.toContain("transparent");
  });
});
