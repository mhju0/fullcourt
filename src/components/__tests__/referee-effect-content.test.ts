/**
 * Renders the finished Referee Effect copy, which nothing else does.
 *
 * The page is deliberately unpublished, so `RefereeEffectContent` is not mounted anywhere in the
 * app and no e2e spec reaches it. Without this, the copy could carry a runtime error, a broken
 * prop or a missing space for as long as it stays held back, and the defect would surface on the
 * day it is published — the worst possible moment.
 *
 * `renderToStaticMarkup` needs no DOM, so this runs in the suite's existing node environment and
 * adds no dependency. Built with `createElement` rather than JSX because the suite includes
 * `src/**` + `*.test.ts` only, and one smoke test is not a reason to widen that.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RefereeEffectContent } from "@/components/referee-effect-content";
import styleData from "@/data/referee-foul-style.json";
import timingData from "@/data/referee-timing.json";
import type { RefereeFoulStyle } from "@/lib/referee-foul-style";
import type { RefereeTiming } from "@/lib/referee-timing";

const style = styleData as RefereeFoulStyle;
const timing = timingData as RefereeTiming;

const html = renderToStaticMarkup(
  createElement(RefereeEffectContent, { style, timing })
);
/** Tags stripped and whitespace collapsed, so assertions read as a visitor reads the page. */
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("RefereeEffectContent", () => {
  it("renders at all", () => {
    expect(html.length).toBeGreaterThan(1000);
  });

  it("states both nulls in the visitor's words, not just in the data", () => {
    // These are the sentences ADR 0007 committed to publishing whatever the numbers did.
    expect(text).toContain("do not swallow the whistle at the end");
    expect(text).toContain("no official tilts the whistle home");
  });

  it("carries the attribution caveat no figure can express", () => {
    expect(text).toContain("one of three officials");
    expect(text).toMatch(/wider/);
  });

  it("refuses the bias reading explicitly", () => {
    expect(text).toContain("None of this is a fairness claim");
  });

  it("explains why its game counts differ from the table's", () => {
    // Both samples appear on one page — 12,403 here against the mix table's 11,952 — and the
    // same official carries both. Unexplained, that reads as one of them being wrong.
    expect(timing.gamesCovered).toBeGreaterThan(style.gamesCovered);
    expect(text).toContain("box score does not");
  });

  it("quotes the late-window verdict from the data rather than from prose", () => {
    // A hardcoded figure would survive a regeneration that moved it. This one cannot.
    expect(text).toContain(
      `${timing.lateWindow.observed} against ${timing.lateWindow.expected} expected by chance`
    );
  });

  it("renders the foul-mix table inside the finished page", () => {
    // Publishing swaps one component in, so the table must already be reachable through it.
    expect(html).toContain('data-testid="referee-style-row"');
  });

  it("never runs two words together across a JSX boundary", () => {
    // A `{" "}` dropped between an expression and the next word is invisible in review and
    // silently ships as "12,403games". Catches the class rather than one instance.
    expect(text).not.toMatch(/\d[a-z]{3,}/);
    expect(text).not.toMatch(/[a-z]{3,}\d/);
  });
});
