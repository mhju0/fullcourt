/**
 * The canonical court-mark construction (S2 "split ink" · P-D keyline material,
 * ratified 2026-08-19). The rules live in docs/design/BRAND_GRAMMAR.md §4; the
 * full construction record is docs/design/explorations/2026-08-19-mark/.
 *
 * One geometry source for every cut — the nav CourtMark, app/icon.svg, the
 * apple and maskable icons, the OG card, docs/logo.svg. The previous mark's
 * seven hand-copied drawings drifted twice (lean direction 2026-07-30, hue
 * split found 2026-08-19); cuts now either import these builders or are pinned
 * to their output by court-mark-geometry.test.ts.
 *
 * Grid: 60×32 units — within 0.3% of the NBA floor's 94:50, on an integer
 * grid so every raster size stays crisp. The slash is a
 * parallelogram of horizontal width `slashW` leaning 12-across / 32-down
 * (≈20.6° from vertical), with its centroid pinned to the court's center
 * (30,16), so the two panels are equal-area by construction. Its ends are cut
 * flush by the court's own top and bottom edges. The lean is the ratified
 * brand tilt — the slant *means* the rest advantage, so a product surface may
 * flex it by a live differential; the static cuts never do.
 */
export const COURT_W = 60;
export const COURT_H = 32;

/** Horizontal travel of the slash centerline over the court's full height. */
const LEAN = 12;

export interface MarkPaths {
  left: string;
  slash: string;
  right: string;
}

export function courtMarkPaths(slashW: number = 6): MarkPaths {
  const cxTop = COURT_W / 2 + LEAN / 2; // 36
  const cxBot = COURT_W / 2 - LEAN / 2; // 24
  const tl = cxTop - slashW / 2;
  const tr = cxTop + slashW / 2;
  const bl = cxBot - slashW / 2;
  const br = cxBot + slashW / 2;
  return {
    left: `M0 0 H${tl} L${bl} ${COURT_H} H0 Z`,
    slash: `M${tl} 0 H${tr} L${br} ${COURT_H} H${bl} Z`,
    right: `M${tr} 0 H${COURT_W} V${COURT_H} H${br} Z`,
  };
}

/**
 * The size ramp (BRAND_GRAMMAR §4). Small cuts fatten and drop the keyline —
 * below ~24px a 30%-opacity hairline rasterizes as fog around the mark.
 */
export const MARK_CUTS = {
  hero: { slashW: 6, rx: 4, tone: 0.08, keyline: { width: 1.2, opacity: 0.3 } },
  nav: { slashW: 6, rx: 4, tone: 0.07, keyline: { width: 1.4, opacity: 0.35 } },
  tile: { slashW: 6.5, rx: 4, tone: 0.12, keyline: { width: 1.4, opacity: 0.3 } },
  favicon: { slashW: 8, rx: 6, tone: 0.16, keyline: null },
} as const;

/**
 * Fixed brand colors (not theme tokens) so the mark is stable wherever it
 * appears. `slashTop/Bottom` are C1 indigo graded along the slash's own
 * length; the pair averages the app accent (#4F46E5 light / #818CF8 dark).
 * Satori-rendered cuts (apple, maskable) flatten each gradient to its
 * midpoint — satori's inline-SVG gradient support is not guaranteed.
 */
export const MARK_COLORS = {
  light: {
    ink: "#17181c",
    inkTop: "#20222a",
    inkBottom: "#121318",
    slashTop: "#5B54F2",
    slashBottom: "#4238CE",
    slashFlat: "#4F46E5",
    keyline: "#17181c",
  },
  dark: {
    ink: "#F2F4F7",
    inkTop: "#FFFFFF",
    inkBottom: "#E6E8ED",
    slashTop: "#95A0FF",
    slashBottom: "#6D74EE",
    slashFlat: "#818CF8",
    keyline: "#F2F4F7",
    plate: "#12151A",
    plateTop: "#171B22",
    plateBottom: "#0F1116",
  },
} as const;
