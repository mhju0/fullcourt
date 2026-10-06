import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "@/lib/sentry-options";

export function register() {
  Sentry.init({
    ...SENTRY_OPTIONS,
    // API routes catch their own failures and log them with console.error before answering
    // 500, so nothing is thrown for onRequestError to see. Reporting the log line covers them.
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
  });
}

export const onRequestError = Sentry.captureRequestError;
