"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LEAD, TRACK, TYPE } from "@/lib/terminal-styles";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    /* Centred and on `PageHeader`'s type scale — see the note in `not-found.tsx`, which this
       page matches line for line. */
    <section
      className="mx-auto max-w-2xl px-4 py-12 text-center"
      aria-labelledby="error-title"
    >
      <p
        className="mono font-semibold uppercase text-[var(--term-red-text)]"
        style={{ fontSize: TYPE.label, letterSpacing: TRACK.label }}
      >
        Error · Something went wrong
      </p>
      <h1
        id="error-title"
        className="mt-4 text-[var(--term-text)]"
        style={{ fontSize: TYPE.title, lineHeight: LEAD.figure }}
      >
        This page failed to load
      </h1>
      <p
        className="mt-4 text-[var(--term-text-muted)]"
        style={{ fontSize: TYPE.body, lineHeight: LEAD.body }}
      >
        The dashboard hit an unexpected error while rendering. Retrying often clears it; if
        it persists, the data pipeline or database may be briefly unavailable.
      </p>
      {error.digest ? (
        <p className="mono mt-3 text-[var(--term-text-muted)]" style={{ fontSize: TYPE.label }}>
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="mono border border-[var(--term-accent)] bg-[var(--term-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-label text-[var(--term-surface)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-accent)]"
        >
          Try again
        </button>
        {/* `/games`, matching the label. Same 2026-08-12 miss as `not-found.tsx`: neither file
            is reachable from a nav link or a spec, so the front-door swap's link sweep never
            visited them. "Today's games" has to land on the games board. */}
        <Link
          href="/games"
          className="mono border border-[var(--term-border)] bg-[var(--term-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-label text-[var(--term-text)] transition-colors hover:border-[var(--term-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-text)]"
        >
          Today&apos;s games
        </Link>
      </div>
    </section>
  );
}
