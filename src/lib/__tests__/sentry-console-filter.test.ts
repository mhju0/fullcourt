import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/nextjs")>();
  // The SDK's exports are not enumerable here, so a spread would drop them.
  return {
    init: vi.fn(),
    captureConsoleIntegration: actual.captureConsoleIntegration,
    captureRequestError: actual.captureRequestError,
    eventFiltersIntegration: actual.eventFiltersIntegration,
  };
});

const { register } = await import("../../instrumentation");

/** The options instrumentation.ts hands the server SDK. */
function serverOptions() {
  vi.mocked(Sentry.init).mockClear();
  register();
  return vi.mocked(Sentry.init).mock.calls[0][0]!;
}

/** An event shaped like the one captureConsoleIntegration sends for a console.error line. */
function consoleEvent(line: string): ErrorEvent {
  return {
    type: undefined,
    level: "error",
    logger: "console",
    exception: { values: [{ value: line, mechanism: { type: "auto.core.capture_console", handled: true } }] },
    extra: { arguments: [line] },
  };
}

/** Runs the event through the SDK's own ignoreErrors filter with the server options. */
function kept(line: string): boolean {
  const options = serverOptions();
  const filter = Sentry.eventFiltersIntegration();
  type FilterClient = Parameters<NonNullable<typeof filter.processEvent>>[2];
  const client = { getOptions: () => options } as unknown as FilterClient;
  return filter.processEvent!(consoleEvent(line), {}, client) !== null;
}

describe("server Sentry console capture", () => {
  it("drops the Node process warning printed at every Vercel cold start", () => {
    // Exact text of JAVASCRIPT-NEXTJS-E, 3,461 events from 2026-10-19 to 2026-11-08.
    const line =
      "(node:7) ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature and might change at any time\n" +
      "(Use `node --trace-warnings ...` to show where the warning was created)";
    expect(kept(line)).toBe(false);
    expect(kept("(node:12) DeprecationWarning: The `punycode` module is deprecated.")).toBe(false);
  });

  it("keeps the API route failures the console capture exists for", () => {
    expect(kept("[/api/games] failed: Error: connect ETIMEDOUT")).toBe(true);
    expect(kept("Warning text mentioning (node:7) ExperimentalWarning: later in the line")).toBe(true);
  });

  it("still captures console.error", () => {
    const names = (serverOptions().integrations as { name: string }[]).map((i) => i.name);
    expect(names).toContain("CaptureConsole");
  });
});
