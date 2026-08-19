import { ImageResponse } from "next/og";

import {
  COURT_H,
  COURT_W,
  courtMarkPaths,
  MARK_COLORS,
  MARK_CUTS,
} from "@/lib/brand/court-mark-geometry";

/**
 * The Android/Chromium install icon, at whatever edge the calling route declares.
 *
 * Closes the "Maskable / 512px manifest icon" row in docs/UIUX_CHECKLIST.md §2. The
 * manifest shipped 2026-08-15 with an SVG (`/icon.svg`) and the iOS PNG (`/apple-icon`).
 * Chromium accepts the SVG, but a launcher that masks its icons has nothing to mask:
 * `purpose: "any"` artwork gets a white plate behind it or the corners clipped off the
 * drawing. This is the `maskable` half — the same mark, drawn to survive a crop.
 *
 * **Maskable geometry.** The spec guarantees only the centre circle of diameter 80% of
 * the edge; everything outside it may be cropped by the launcher's shape. The court is
 * 60×32 in the mark's own units, so its diagonal is 68 of the 72-unit viewBox — at
 * `MARK_FRACTION` of the canvas the whole drawing (keyline included) sits inside that
 * circle with room to spare, and the background bleeds to all four edges so no mask
 * reveals transparency.
 *
 * The drawing is the apple-icon's: same geometry source (tile cut), same flat-panel
 * satori concessions — see apple-icon.tsx for why there is no clipPath or SVG gradient.
 */
const MARK_FRACTION = 0.7;

export function maskableIconResponse(edge: number) {
  const mark = Math.round(edge * MARK_FRACTION);
  const cut = MARK_CUTS.tile;
  const c = MARK_COLORS.dark;
  const { left, slash, right } = courtMarkPaths(cut.slashW);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(180deg, ${c.plateTop}, ${c.plateBottom})`,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 72 72" fill="none">
          <g transform="translate(6 20)">
            <path d={left} fill={c.ink} />
            <path d={slash} fill={c.slashFlat} />
            <path d={right} fill={c.ink} fillOpacity={cut.tone} />
            <rect
              x={-2}
              y={-2}
              width={COURT_W + 4}
              height={COURT_H + 4}
              rx={cut.rx + 2}
              stroke={c.keyline}
              strokeOpacity={cut.keyline.opacity}
              strokeWidth={cut.keyline.width}
            />
          </g>
        </svg>
      </div>
    ),
    { width: edge, height: edge }
  );
}
