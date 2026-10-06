/**
 * Shared Sentry settings. Errors only: no tracing, no session replay, no visitor IP or cookies.
 * With no DSN in the environment (CI, an unconfigured clone) the SDK stays off.
 */
export const SENTRY_OPTIONS = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) && process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "local",
  tracesSampleRate: 0,
  sendDefaultPii: false,
};
