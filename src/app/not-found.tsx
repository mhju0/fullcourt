import Link from "next/link";
import { TYPE } from "@/lib/terminal-styles";

export default function NotFound() {
  return (
    /* Centred, unlike every other page, and deliberately: this is a full stop rather than a
       data surface, so there is no column of figures for a left rail to serve. Its TYPE is
       `PageHeader`'s, though — eyebrow, title and description at the same three sizes — so it
       reads as the same product. It carried 36/48px titles and 14px prose until 2026-08-18,
       which is what a page reachable by no nav link and no spec drifts into.
       `max-w-2xl` is 42rem, i.e. WIDTH.prose. */
    <section
      className="mx-auto max-w-2xl px-4 py-12 text-center"
      aria-labelledby="not-found-title"
    >
      <p
        className="mono font-semibold uppercase text-[var(--term-red)]"
        style={{ fontSize: TYPE.label, letterSpacing: "0.08em" }}
      >
        404 · Out of bounds
      </p>
      <h1
        id="not-found-title"
        className="mt-4 text-[var(--term-text)]"
        style={{ fontSize: TYPE.title, lineHeight: 1.05 }}
      >
        Page not found
      </h1>
      <p
        className="mt-4 text-[var(--term-text-muted)]"
        style={{ fontSize: TYPE.body, lineHeight: 1.55 }}
      >
        This route is not part of the FullCourt analytics dashboard. Return to the games board
        or explore the historical rest-advantage backtest.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {/* `/games` since 2026-08-12. This said `/` for as long as `/` was the games board;
            the front-door swap moved the board and left the label pointing at the marketing
            page. The copy above promises "the games board", so the destination follows the
            promise rather than the address. */}
        <Link
          href="/games"
          className="mono border border-[var(--term-accent)] bg-[var(--term-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--term-surface)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-accent)]"
        >
          Games
        </Link>
        <Link
          href="/analysis"
          className="mono border border-[var(--term-border)] bg-[var(--term-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--term-text)] transition-colors hover:border-[var(--term-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--term-text)]"
        >
          Model results
        </Link>
      </div>
    </section>
  );
}
