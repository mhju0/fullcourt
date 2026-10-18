import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { withSentryConfig } from "@sentry/nextjs/config";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Content-Security-Policy. The app is a read-only dashboard with no user-authored
// HTML, so 'unsafe-inline' for script/style (required by Next's hydration bootstrap
// + Recharts/Tailwind inline styles) is an acceptable trade for not running nonce
// middleware. 'unsafe-eval' is dev-only (React Fast Refresh); prod omits it.
// connect-src is scoped to Supabase Realtime and Sentry's error intake; img-src to the one team-logo CDN,
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
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.us.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Production served a stylesheet built from an older globals.css after a merge on
  // 2026-10-03, while a clean local build of the same commit was correct. A cold build
  // costs seconds; a stale one ships the wrong page. Keep the build cache off.
  experimental: {
    turbopackFileSystemCacheForBuild: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/i/teamlogos/nba/**",
      },
    ],
  },
  // The old upcoming view now lives in Games. Keep this redirect reversible.
  async redirects() {
    return [
      { source: "/upcoming", destination: "/games", permanent: false },
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

export default function config(phase: string): NextConfig {
  if (phase !== PHASE_PRODUCTION_BUILD) return nextConfig;

  const authToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  const isVercelDeployment = ["production", "preview"].includes(
    process.env.VERCEL_ENV ?? "",
  );
  if (!authToken) {
    if (isVercelDeployment) {
      throw new Error("SENTRY_AUTH_TOKEN is required for Vercel source-map uploads.");
    }
    console.info("Sentry source-map upload skipped: SENTRY_AUTH_TOKEN is unset (local/CI build).");
    return nextConfig;
  }

  const sentryConfig = withSentryConfig({ ...nextConfig, experimental: { ...nextConfig.experimental } }, {
    org: "michael-ju-46",
    project: "javascript-nextjs",
    authToken,
    telemetry: false,
    silent: false,
    useRunAfterProductionCompileHook: true,
    sourcemaps: { deleteSourcemapsAfterUpload: true },
    widenClientFileUpload: true,
    // Existing instrumentation owns error capture; this change only adds build artifacts.
    buildTimeInstrumentation: false,
    routeManifestInjection: false,
    // No release, commit link or deploy record. The name is not optional: without one the SDK
    // drops every other release option, the plugin names the release from Vercel's commit anyway,
    // and records a deploy against a release this build never creates (Sentry answers 404).
    release: {
      name: process.env.VERCEL_GIT_COMMIT_SHA,
      create: false,
      finalize: false,
      setCommits: false,
      deploy: false,
    },
    webpack: {
      autoInstrumentServerFunctions: false,
      autoInstrumentMiddleware: false,
      autoInstrumentAppDirectory: false,
      automaticVercelMonitors: false,
    },
    // The cause is Sentry's own message (an HTTP status or CLI error), never the token.
    errorHandler(error) {
      throw new Error(`Sentry source-map upload failed; refusing to ship this build. ${error.message}`, { cause: error });
    },
  });
  const upload = sentryConfig.compiler?.runAfterProductionCompile;
  if (!upload) throw new Error("Sentry did not register its source-map upload hook.");
  sentryConfig.compiler = {
    ...sentryConfig.compiler,
    async runAfterProductionCompile(context) {
      const publicDir = join(context.distDir, "static");
      const publicFiles = await readdir(publicDir, { recursive: true });
      const serverFiles = await readdir(join(context.distDir, "server"), { recursive: true });
      if (![publicFiles, serverFiles].every((files) => files.some((file) => file.endsWith(".js.map")))) {
        throw new Error("Sentry source-map upload requires both client and server maps.");
      }
      await upload(context);
      if ((await readdir(publicDir, { recursive: true })).some((file) => file.endsWith(".map"))) {
        throw new Error("Public source maps remain after upload; refusing to ship this build.");
      }
    },
  };
  return sentryConfig;
}
