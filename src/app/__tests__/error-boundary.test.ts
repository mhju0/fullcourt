/**
 * Renders the route error boundary, which nothing else does.
 *
 * `error.tsx` and `not-found.tsx` are the repo's structural blind spot: **no routing reaches
 * them.** No nav link, no spec and no unit test rendered either one, so a link sweep that walks
 * components misses both — which is exactly how the 2026-08-12 front-door swap left them each
 * pointing a "Games" button at `/` after `/` had stopped being the games board. `lint`,
 * `typecheck`, the whole unit suite and `build` all passed over both defects. The 404's fix got
 * an e2e guard; this one was verified by reading only (PR #26, issue #32).
 *
 * Reaching the real boundary needs a route that throws on demand, which is not worth adding to
 * production for one href. Rendering the component directly is: it does not exercise Next's
 * boundary wiring, but it does catch the defect class that actually occurred.
 *
 * `renderToStaticMarkup` needs no DOM, so this runs in the suite's existing node environment and
 * adds no dependency — the same approach `referee-effect-content.test.ts` uses for the same
 * reason. Built with `createElement` rather than JSX because the suite includes `src/**` +
 * `*.test.ts` only, and one smoke test is not a reason to widen that.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ErrorBoundary from "@/app/error";

/** The boundary's own props. `reset` is never called here — nothing dispatches events. */
const render = (error: Error & { digest?: string }) =>
  renderToStaticMarkup(createElement(ErrorBoundary, { error, reset: () => {} }));

const plain = render(new Error("boom"));

/** Tags stripped and whitespace collapsed, so assertions read as a visitor reads the page. */
const text = plain.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("route error boundary", () => {
  it("renders at all", () => {
    expect(text).toContain("This page failed to load");
    expect(text).toContain("Try again");
  });

  it("sends the games button to the games board, not the front door", () => {
    // The defect this file exists for. `/` was the games board until 2026-08-12; it is the
    // marketing page now, so a button labelled "Today's games" pointing there is a link whose
    // label and destination disagree — shown to someone whose page has already failed.
    const hrefs = [...plain.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/games"]);
  });

  it("labels that button as the board it opens", () => {
    // Asserted together with the href above: either half alone still permits the pair to
    // disagree, which is precisely the shape of the bug that shipped.
    expect(plain).toMatch(/href="\/games"[^>]*>[^<]*Today&#x27;s games/);
  });

  it("shows the reference digest only when the error carries one", () => {
    const withDigest = Object.assign(new Error("boom"), { digest: "abc123" });
    expect(render(withDigest)).toContain("abc123");
    expect(text).not.toContain("Reference:");
  });
});
