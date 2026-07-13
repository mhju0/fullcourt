import Link from "next/link";

export default function NotFound() {
  return (
    <section
      className="mx-auto max-w-2xl px-4 py-24 text-center"
      aria-labelledby="not-found-title"
    >
      <p className="mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--term-red)]">
        404 · Out of bounds
      </p>
      <h1
        id="not-found-title"
        className="mt-4 font-heading text-4xl font-bold text-[var(--term-text)] sm:text-5xl"
      >
        Page not found
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[var(--term-text-muted)]">
        This route is not part of the FullCourt analytics dashboard. Return to today&apos;s
        matchups or explore the historical rest-advantage backtest.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="mono border border-[var(--term-blue)] bg-[var(--term-blue)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--term-surface)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-blue)]"
        >
          Today&apos;s games
        </Link>
        <Link
          href="/analysis"
          className="mono border border-[var(--term-border)] bg-[var(--term-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--term-text)] transition-colors hover:border-[var(--term-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-text)]"
        >
          View analysis
        </Link>
      </div>
    </section>
  );
}
