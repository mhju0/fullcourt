import type { NextConfig } from "next";

// Content-Security-Policy. The app is a read-only dashboard with no user-authored
// HTML, so 'unsafe-inline' for script/style (required by Next's hydration bootstrap
// + Recharts/Tailwind inline styles) is an acceptable trade for not running nonce
// middleware. 'unsafe-eval' is dev-only (React Fast Refresh); prod omits it.
// connect-src is scoped to Supabase Realtime; img-src to the two team-logo CDNs.
const isDev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.nba.com https://a.espncdn.com",
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
        hostname: "cdn.nba.com",
        pathname: "/logos/**",
      },
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/i/teamlogos/nba/**",
      },
    ],
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
