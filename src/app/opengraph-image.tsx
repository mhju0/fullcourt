import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

import {
  COURT_H,
  COURT_W,
  courtMarkPaths,
  MARK_COLORS,
  MARK_CUTS,
} from "@/lib/brand/court-mark-geometry";
import { wordmarkLetters } from "@/lib/brand/wordmark-kern";
import { NBA_SEASONS } from "@/lib/nba-season";

export const alt = "FullCourt — NBA analytics: rest, fatigue, and shot value";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The hero cut of the canonical mark, inlined as a data-URI so satori hands it to
// resvg, which rasterizes SVG gradients faithfully (unlike satori's own inline-SVG
// path). Geometry comes from court-mark-geometry.ts — never redrawn here.
const CUT = MARK_CUTS.hero;
const C = MARK_COLORS.dark;
const P = courtMarkPaths(CUT.slashW);
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="396" height="228" viewBox="-3 -3 ${COURT_W + 6} ${COURT_H + 6}" fill="none"><defs><clipPath id="c"><rect width="${COURT_W}" height="${COURT_H}" rx="${CUT.rx}"/></clipPath><linearGradient id="f" x1="0" y1="0" x2="0" y2="${COURT_H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.inkTop}"/><stop offset="1" stop-color="${C.inkBottom}"/></linearGradient><linearGradient id="s" x1="${COURT_W / 2 + 6}" y1="0" x2="${COURT_W / 2 - 6}" y2="${COURT_H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.slashTop}"/><stop offset="1" stop-color="${C.slashBottom}"/></linearGradient></defs><g clip-path="url(#c)"><path d="${P.left}" fill="url(#f)"/><path d="${P.slash}" fill="url(#s)"/><path d="${P.right}" fill="${C.ink}" fill-opacity="${CUT.tone}"/></g><rect x="-2" y="-2" width="${COURT_W + 4}" height="${COURT_H + 4}" rx="${CUT.rx + 2}" stroke="${C.keyline}" stroke-opacity="${CUT.keyline.opacity}" stroke-width="${CUT.keyline.width}"/></svg>`;
const MARK_SRC = `data:image/svg+xml,${encodeURIComponent(MARK)}`;

// satori ships no fonts and cannot use system faces, so an unloaded `fontWeight: 800`
// silently renders regular-weight fallback. The card renders Geist (the product's one
// type family since 2026-08-09 — Outfit was retired here 2026-08-19) from local ttf
// files, because satori does not read woff2 and next/font exposes none. Both weights
// are needed: with only ExtraBold loaded, every string on the card would render
// ExtraBold.
//
// Read from disk rather than fetch(): the bundler leaves `import.meta.url` as a
// file: URL here, which fetch() refuses ("not implemented"). `new URL(..., import.meta.url)`
// stays statically analyzable so Next traces the .ttf files into the deployed bundle.
async function loadFonts() {
  const [regular, extraBold] = await Promise.all([
    readFile(new URL("./fonts/Geist-Regular.ttf", import.meta.url)),
    readFile(new URL("./fonts/Geist-ExtraBold.ttf", import.meta.url)),
  ]);
  return [
    { name: "Geist", data: regular, style: "normal" as const, weight: 400 as const },
    { name: "Geist", data: extraBold, style: "normal" as const, weight: 800 as const },
  ];
}

export default async function OpengraphImage() {
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0A0B0D",
          padding: "72px 80px",
          color: "#F2F4F7",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <img src={MARK_SRC} width={132} height={76} alt="" />
          <div style={{ display: "flex", fontSize: 32, letterSpacing: 3, color: "#8A929C" }}>
            NBA ANALYTICS PLATFORM
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* The W4 lockup (2026-08-19): all caps, COURT in the brand indigo.
              Per-letter kerns from wordmark-kern.ts (2026-08-24) as px margins on the
              92px size — satori may not apply Geist's own GPOS kerns the way a browser
              does, so the deployed card gets one manual eyeball after this ships. */}
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -1 }}>
            {wordmarkLetters().map((l, i) => (
              <span
                key={i}
                style={{
                  color: l.accent ? "#818CF8" : "#F2F4F7",
                  marginLeft: l.kernEm === 0 ? 0 : l.kernEm * 92,
                }}
              >
                {l.char}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 38, color: "#B7BEC7", maxWidth: 960, lineHeight: 1.35 }}>
            {/* No figure: a static image cannot pin one, and the ~55% this carried predated
                the 2026-08-02 rule change entirely. */}
            Rest, travel and shot value — measured against every NBA regular season since
            1985-86.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 26, color: "#5B626C", letterSpacing: 2 }}>
          {/* The operating line (BRAND_GRAMMAR §8): the brand's sign-off, here and on
              the front-door outro only. */}
          <div style={{ display: "flex", color: "#818CF8", fontWeight: 800 }}>
            READ AGAINST THE BASELINE
          </div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>{`${NBA_SEASONS.length}-SEASON BACKTEST`}</div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
