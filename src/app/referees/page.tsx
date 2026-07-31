import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Referee Effect",
  description:
    "Foul calls by referee crew — which crews call more, which call differently, and whether any of it moves a game. In development, arriving before September 2026.",
};

/**
 * A centred holding page, deliberately without the site's `PageHeader`.
 *
 * There is no data on screen, so the page has nothing to be the header of — left-aligned
 * chrome above an empty column read as a page that had failed to load rather than one that
 * has not shipped yet. One centred block states what is coming and when.
 *
 * The ingest still exists (`scripts/fetch_officials.ts`) and its aggregate
 * (`src/data/referee-whistle.json`) is still guarded by `referee-whistle.test.ts`, so the
 * data layer is intact and this page can return without a re-ingest. What was here before was
 * a table whose central question — does any referee tilt the whistle home? — came back inside
 * noise, and a page of muted cells invites readers to find names in it anyway.
 */
export default function RefereesPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-20 text-center">
      <p
        className="mono"
        style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 700, color: "var(--term-red)" }}
      >
        REFEREE EFFECT
      </p>

      <h1
        className="font-heading mt-4 font-bold"
        style={{ fontSize: "clamp(2.4rem,7vw,4.5rem)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
      >
        Coming soon
      </h1>

      <p
        className="mono mt-5"
        style={{ fontSize: 12, letterSpacing: "0.08em", fontWeight: 600, color: "var(--term-text)" }}
      >
        CHECKING REFEREE BIAS · ARRIVING IN AUGUST, BEFORE SEPTEMBER
      </p>

      <p
        className="mt-8"
        style={{ maxWidth: "34rem", fontSize: 16, lineHeight: 1.65, color: "var(--term-text-muted)" }}
      >
        Every game is worked by a three-person crew, and not every crew calls a game the same
        way. This page will measure that: how many fouls a crew calls per game against the
        league&rsquo;s own average, which kinds of foul they call more and less often, and
        whether the gap between the home and away bench moves with the crew or stays flat.
      </p>

      <p
        className="mt-4"
        style={{ maxWidth: "34rem", fontSize: 16, lineHeight: 1.65, color: "var(--term-text-muted)" }}
      >
        Whistle volume is a real, measurable difference between crews. Whether it favours
        anyone is a separate question, and the answer so far is that it does not — which is
        what this page will say if it is still true when it ships.
      </p>
    </div>
  );
}
