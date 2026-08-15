import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The iOS home-screen icon, generated at build time from the same court drawing as
 * app/icon.svg. iOS ignores manifest icons entirely — without an apple-touch-icon,
 * "Add to Home Screen" grabs a page screenshot (the state docs/ROADMAP.md recorded).
 *
 * Differences from icon.svg, both deliberate:
 * - **Full-bleed square, no rounded corners.** iOS applies its own superellipse mask and
 *   historically fills any transparency with black, so the tile's rounding must come from
 *   the platform, not the artwork.
 * - **No clipPath.** The favicon clips the two colored halves to the court's 3px-radius
 *   corners; at 180px under iOS's own mask that refinement is invisible, and dropping it
 *   keeps the drawing inside what ImageResponse's renderer is guaranteed to rasterize.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#12151A",
        }}
      >
        <svg width="150" height="150" viewBox="0 0 72 72" fill="none">
          <g transform="translate(0 12)">
            <path d="M6 7 H39 L33 41 H6 Z" fill="#3B82F6" fillOpacity="0.55" />
            <path d="M39 7 H66 V41 H33 Z" fill="#E5484D" fillOpacity="0.55" />
            <path d="M39 7 L33 41" stroke="#F2F4F7" strokeWidth="3.2" />
            <rect x="6" y="7" width="60" height="34" rx="3" stroke="#F2F4F7" strokeWidth="4" />
            <circle cx="36" cy="24" r="6" stroke="#F5A623" strokeWidth="3.6" />
          </g>
        </svg>
      </div>
    ),
    size
  );
}
