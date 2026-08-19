import { ImageResponse } from "next/og";

import {
  COURT_H,
  COURT_W,
  courtMarkPaths,
  MARK_COLORS,
  MARK_CUTS,
} from "@/lib/brand/court-mark-geometry";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The iOS home-screen icon, generated at build time from the canonical mark
 * geometry (tile cut). iOS ignores manifest icons entirely — without an
 * apple-touch-icon, "Add to Home Screen" grabs a page screenshot.
 *
 * Deliberate differences from icon.svg:
 * - **Full-bleed square, no rounded corners.** iOS applies its own
 *   superellipse mask and historically fills transparency with black, so the
 *   tile's rounding must come from the platform, not the artwork.
 * - **No clipPath, flat panel colors.** Satori's inline-SVG support is not
 *   guaranteed for clipPaths or gradients; the plate gradient runs through CSS
 *   instead, and each panel takes its gradient's midpoint (MARK_COLORS
 *   `slashFlat`). At 180px under iOS's own mask the difference is invisible.
 */
export default function AppleIcon() {
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
        <svg width="150" height="150" viewBox="0 0 72 72" fill="none">
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
    size
  );
}
