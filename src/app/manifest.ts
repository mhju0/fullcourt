import type { MetadataRoute } from "next";

/**
 * The install surface. Until 2026-08-15 the site had no manifest and no apple-touch-icon, so
 * "Add to Home Screen" yielded a page-screenshot icon and opened in Safari chrome — the exact
 * gap docs/ROADMAP.md carried under "Known and not fixed". ESPN and NBA.com both ship a
 * manifest; every major sports property ships apple-touch-icons (verified against their
 * heads, 2026-08-15). Next serves this at /manifest.webmanifest and links it from every page.
 *
 * `start_url` is the games board, not `/`. The front door is a marketing argument; someone
 * who pinned the site to their home screen has already heard it, and "take me back to the
 * product" is the same contract the GAMES tab carries (docs/FRONTEND.md, front-door swap).
 *
 * `display: standalone` is what stops the pinned site opening in browser chrome. The app's
 * own nav carries every route, so losing the browser back button costs nothing here.
 *
 * Colors match the committed light-only decision: both are --term-bg, the same value
 * layout.tsx pins as viewport.themeColor. The app is "Broadcast" light — there is no dark
 * variant to declare (docs/FRONTEND.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FullCourt — NBA Analytics",
    short_name: "FullCourt",
    description:
      "FullCourt models what the NBA schedule does to a game — rest, travel, and schedule density, checked against every season since 1985-86.",
    start_url: "/games",
    display: "standalone",
    background_color: "#F6F7F9",
    theme_color: "#F6F7F9",
    icons: [
      // The committed brand mark, served by app/icon.svg. Chromium accepts SVG manifest
      // icons; the PNG below is the raster fallback and the iOS home-screen icon.
      // EXTENSIONLESS on purpose: generated metadata routes serve at their basename —
      // `/apple-icon`, like the existing `/opengraph-image` — and `/apple-icon.png` 404s.
      // Measured before this line was trusted.
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      // The maskable pair, added 2026-08-18 (UIUX_CHECKLIST §2). `purpose: "maskable"`
      // only: the artwork is inset to the spec's 80% safe circle, so unmasked it would
      // read a size small — the SVG above is what a launcher that does not mask should
      // use. These are route handlers, so the `.png` here is a real path, not a
      // metadata-route basename.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
