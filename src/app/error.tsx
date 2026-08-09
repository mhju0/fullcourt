"use client";

import { useEffect } from "react";
import Link from "next/link";

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
    <section
      className="mx-auto max-w-2xl px-4 py-24 text-center"
      aria-labelledby="error-title"
    >
      <p className="mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--term-red)]">
        Error · Something went wrong
      </p>
      <h1
        id="error-title"
        className="mt-4 font-heading text-4xl font-bold text-[var(--term-text)] sm:text-5xl"
      >
        This page failed to load
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[var(--term-text-muted)]">
        The dashboard hit an unexpected error while rendering. Retrying often clears it; if
        it persists, the data pipeline or database may be briefly unavailable.
      </p>
      {error.digest ? (
        <p className="mono mt-3 text-[11px] text-[var(--term-text-muted)]">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="mono border border-[var(--term-accent)] bg-[var(--term-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--term-surface)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-accent)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="mono border border-[var(--term-border)] bg-[var(--term-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--term-text)] transition-colors hover:border-[var(--term-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-text)]"
        >
          Today&apos;s games
        </Link>
      </div>
    </section>
  );
}
