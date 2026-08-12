import type { NextConfig } from "next";

// Content-Security-Policy. The app is a read-only dashboard with no user-authored
// HTML, so 'unsafe-inline' for script/style (required by Next's hydration bootstrap
// + Recharts/Tailwind inline styles) is an acceptable trade for not running nonce
// middleware. 'unsafe-eval' is dev-only (React Fast Refresh); prod omits it.
// connect-src is scoped to Supabase Realtime; img-src to the one team-logo CDN,
// a.espncdn.com. (cdn.nba.com was dropped on 2026-07-28 — ESPN draws all 30 marks on light.)
const isDev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  // Vercel Analytics serves its script same-origin in production (/_vercel/insights/
  // script.js) and beacons to the same path, so prod needs no CSP change. Dev loads the
  // debug script from va.vercel-scripts.com instead — allowed here, absent in prod.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://a.espncdn.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/i/teamlogos/nba/**",
      },
    ],
  },
  // Both are 307, not 308, and for the same reason: browsers cache a permanent redirect
  // indefinitely and it cannot be invalidated server-side, so a reversal would leave every
  // prior visitor stuck. The nav is still settling; 307 keeps both doors open.
  //
  // /upcoming was folded into the games board as its UPCOMING view when the nav dropped to five
  // tabs, and follows that board to /games.
  //
  // /about is where the marketing page lived until 2026-08-12. It is linked from the footer and
  // from anywhere it has been shared, so the address has to keep working.
  async redirects() {
    return [
      { source: "/upcoming", destination: "/games", permanent: false },
      { source: "/about", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clickjacking: the app is never meant to be framed. DENY beats
          // SAMEORIGIN here since nothing embeds it in an iframe. (CSP
          // frame-ancestors covers modern browsers; this covers older ones.)
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
