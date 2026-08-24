/**
 * The FULLCOURT lockup's optical kerning (ratified 2026-08-24). One table for every
 * renderer — the nav wordmark, the front door's naming h2, and the OG card — the same
 * one-geometry-source rule as `court-mark-geometry.ts` beside it.
 *
 * Why it exists: measured live in Geist 700 with the font's own GPOS kerns applied, the
 * cap-band area between letters spread 2.7:1 — and the widest gap in the word was L·C,
 * exactly the FULL|COURT color seam, so the lockup read as two words touching. This
 * preset pulls the outliers in (spread → 2.1:1, width −1.5%, no pair under the 0.02 em
 * ink floor) without chasing equal-area, which is provably unreachable: leveling L·C to
 * the mean needs −0.092 em and the closest ink sits 0.070 em apart.
 *
 * The values are offsets ON TOP of the font's own kerning and each site's base tracking,
 * applied as a margin before the pair's second letter — margins do not fight the
 * container's `letter-spacing` and add no trailing space after the T.
 *
 * C·O is deliberately shy of its measured ideal: the variable Geist at 700 has longer C
 * terminals than the static 800 TTF, and at −0.020 the true 2D ink clearance drops to
 * 0.0135 em. It gets −0.010. Do not "fix" it to match its neighbours.
 *
 * Exploration record: the 2026-08-22 kerning bench artifact (see the design docs); this
 * sits inside the wordmark's sanctioned exemption from the type scale
 * (`terminal-styles.ts`), and W4 — single weight, caps, color split — is untouched.
 */

export const WORDMARK = "FULLCOURT";

/** How many leading letters are the ink half of the W4 split (FULL | COURT). */
export const WORDMARK_SPLIT = 4;

/**
 * Em offsets per adjacent pair, in word order. Applied before the pair's SECOND letter.
 */
export const WORDMARK_KERN = [
  { pair: "FU", em: -0.035 },
  { pair: "UL", em: 0.02 },
  { pair: "LL", em: -0.04 },
  { pair: "LC", em: -0.045 },
  { pair: "CO", em: -0.01 },
  { pair: "OU", em: 0.015 },
  { pair: "UR", em: 0.02 },
  { pair: "RT", em: -0.01 },
] as const;

export interface WordmarkLetter {
  char: string;
  /** Em offset to apply as a margin BEFORE this letter. 0 for the F. */
  kernEm: number;
  /** True for the COURT half of the split — the letters that take the accent color. */
  accent: boolean;
}

/** The word as renderable letters, kern and color half attached. */
export function wordmarkLetters(): WordmarkLetter[] {
  return Array.from(WORDMARK, (char, i) => ({
    char,
    kernEm: i === 0 ? 0 : WORDMARK_KERN[i - 1].em,
    accent: i >= WORDMARK_SPLIT,
  }));
}
