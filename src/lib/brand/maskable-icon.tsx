import { ImageResponse } from "next/og";

/**
 * The Android/Chromium install icon, at whatever edge the calling route declares.
 *
 * Closes the "Maskable / 512px manifest icon" row in docs/UIUX_CHECKLIST.md §2. The
 * manifest shipped 2026-08-15 with an SVG (`/icon.svg`) and the iOS PNG (`/apple-icon`).
 * Chromium accepts the SVG, but a launcher that masks its icons has nothing to mask:
 * `purpose: "any"` artwork gets a white plate behind it or the corners clipped off the
 * drawing. This is the `maskable` half — the same court mark, drawn to survive a crop.
 *
 * **Maskable geometry.** The spec guarantees only the centre circle of diameter 80% of
 * the edge; everything outside it may be cropped by the launcher's shape. The court is
 * 60×34 in the mark's own units, so its diagonal is 69 of the 72-unit viewBox — at
 * `MARK_FRACTION` of the canvas the whole drawing sits inside that circle with room to
 * spare, and the background bleeds to all four edges so no mask reveals transparency.
 *
 * The drawing is the apple-icon's: same paths, same clipPath omission (at these sizes
 * the favicon's 3px corner clip is invisible, and dropping it keeps the artwork inside
 * what satori is guaranteed to rasterize).
 */
const MARK_FRACTION = 0.7;

export function maskableIconResponse(edge: number) {
  const mark = Math.round(edge * MARK_FRACTION);

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
        <svg width={mark} height={mark} viewBox="0 0 72 72" fill="none">
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
    { width: edge, height: edge }
  );
}
