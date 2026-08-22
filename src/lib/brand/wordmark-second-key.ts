/**
 * The Second Key — the wordmark's one deliberate irregularity (chosen 2026-08-22).
 *
 * FULLCOURT contains its own court: two U's, one in each half of the word, the two
 * keys at either end of the floor. The second U — the away key — renders hollow:
 * one side arrives with less left. One move, one letter; the name, the W4 color
 * seam and the Split Ink mark are untouched.
 *
 * Two renderings of the same statement, because the surfaces render differently:
 *
 * - **Browser (nav, front-door h2):** live text with `-webkit-text-stroke`, applied
 *   by the `.wordmark-u-hollow` class in `globals.css`. Where text-stroke is
 *   unsupported the class falls back to a ghost (34% opacity) — the story survives,
 *   nothing renders wrong.
 * - **OG card (satori):** satori draws no text-stroke, so the U ships as a stroked
 *   SVG of the actual glyph outline, same pattern as `MARK_SRC` in
 *   `opengraph-image.tsx`. The path below IS Geist ExtraBold's U (the card's own
 *   800 weight), extracted from `src/app/fonts/Geist-ExtraBold.ttf` with fontTools
 *   (y flipped to SVG space, origin at the glyph's top). Regenerating it is only
 *   ever needed if that font file changes.
 *
 * The stroke is centered on the outline — the same geometry -webkit-text-stroke
 * draws — so the two renderings weigh the same at the same size.
 */
export const U_GLYPH = {
  /** Single closed contour — Geist's U has no separate counter. */
  path: "M354 726Q262 726 194.5 692.5Q127 659 90 597Q53 535 53 451V0H227V451Q227 514 259.5 549Q292 584 354 584Q416 584 448.5 549Q481 514 481 451V0H655V451Q655 535 618 597Q581 659 513.5 692.5Q446 726 354 726Z",
  /** Horizontal advance of the glyph, font units. */
  advance: 708,
  /** Cap height, font units — the glyph's top sits at y=0 in the flipped path. */
  capHeight: 710,
  /** Round-bottom overshoot below the baseline, font units (path runs to y=726). */
  overshoot: 16,
  /** hhea ascender, font units — where satori puts the baseline in a line box. */
  ascender: 1005,
  unitsPerEm: 1000,
} as const;

/**
 * Stroke width of the hollow U at display sizes, in em. `globals.css` pins the same
 * value as the `.wordmark-u-hollow` default (`--wordmark-u-stroke`), and the test
 * fails if the two drift. The nav overrides it to a hand-tuned pixel value — an
 * em-scaled stroke at 22px is thinner than a device pixel.
 */
export const HOLLOW_STROKE_EM = 0.031;

const VB_PAD = 16; // room for the centered stroke's outer half beyond the outline

/**
 * The hollow U as a self-contained SVG for satori's `<img>`, plus the box and
 * offset that seat it on the text baseline of a `display: flex` line at
 * `fontSize` px. `marginTop` = (ascender − capHeight − pad) scaled, so the
 * glyph's top lands exactly where the neighbouring caps' tops are.
 */
export function hollowUFor(fontSize: number, color: string) {
  const { path, advance, capHeight, overshoot, ascender, unitsPerEm } = U_GLYPH;
  const strokeUnits = HOLLOW_STROKE_EM * unitsPerEm;
  const vbH = capHeight + overshoot + 2 * VB_PAD;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-VB_PAD} ${advance} ${vbH}" fill="none"><path d="${path}" stroke="${color}" stroke-width="${strokeUnits}"/></svg>`;
  const s = fontSize / unitsPerEm;
  return {
    src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    width: advance * s,
    height: vbH * s,
    marginTop: (ascender - capHeight - VB_PAD) * s,
  };
}
