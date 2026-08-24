import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORDMARK, WORDMARK_KERN, WORDMARK_SPLIT, wordmarkLetters } from "../wordmark-kern";

describe("the kern table itself", () => {
  it("spells FULLCOURT, split at the color seam", () => {
    const letters = wordmarkLetters();
    expect(letters.map((l) => l.char).join("")).toBe("FULLCOURT");
    expect(letters.filter((l) => !l.accent).map((l) => l.char).join("")).toBe("FULL");
    expect(letters.filter((l) => l.accent).map((l) => l.char).join("")).toBe("COURT");
    expect(WORDMARK_SPLIT).toBe(4);
  });

  it("keys every pair to its actual neighbours, in word order", () => {
    // A reordered or mistyped entry would silently kern the wrong seam.
    expect(WORDMARK_KERN).toHaveLength(WORDMARK.length - 1);
    WORDMARK_KERN.forEach((k, i) => {
      expect(k.pair, `entry ${i}`).toBe(WORDMARK.slice(i, i + 2));
    });
  });

  it("pins the ratified 2026-08-24 preset", () => {
    // Hand-tuned against measured ink areas (2.7:1 spread → 2.1:1); a change here is a
    // brand decision, not a refactor. C·O is deliberately −0.010, not tighter — the
    // variable Geist at 700 has longer C terminals than the static 800 TTF, and −0.020
    // drops the true ink clearance to 0.0135 em.
    expect(WORDMARK_KERN.map((k) => k.em)).toEqual([
      -0.035, 0.02, -0.04, -0.045, -0.01, 0.015, 0.02, -0.01,
    ]);
  });

  it("gives the F no kern and every later letter its preceding pair's", () => {
    const letters = wordmarkLetters();
    expect(letters[0].kernEm).toBe(0);
    letters.slice(1).forEach((l, i) => expect(l.kernEm).toBe(WORDMARK_KERN[i].em));
  });
});

describe("every renderer consumes the one table", () => {
  // The three lockups drifted apart once before the mark got a single geometry source;
  // the wordmark gets the same treatment. A renderer that types the word as a literal
  // has stopped reading the kerns — these fail before the drift ships.
  const renderers = [
    "src/components/nav-bar.tsx",
    "src/components/about-content.tsx",
    "src/app/opengraph-image.tsx",
  ];

  for (const file of renderers) {
    it(`${file} imports the table and hardcodes no lockup text`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src).toContain('from "@/lib/brand/wordmark-kern"');
      // FULLCOURT must not appear as renderable text — neither whole nor as the split
      // halves the old markup used (>FULL<, >COURT<). Prose mentions in comments are
      // fine; a JSX text node is not.
      expect(src).not.toMatch(/>FULL</);
      expect(src).not.toMatch(/>COURT</);
      expect(src).not.toMatch(/>FULLCOURT</);
    });
  }
});
