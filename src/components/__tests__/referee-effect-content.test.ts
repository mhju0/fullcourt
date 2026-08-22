/**
 * Renders the finished Referee Effect copy, which nothing else does.
 *
 * Written while the page was unpublished, when nothing else mounted `RefereeEffectContent` at all.
 * `/referees` went live on 2026-08-22 and `e2e/referees.spec.ts` now reaches the rendered page, so
 * this is no longer the only cover — but it stays, because it runs in the commit gate and e2e
 * deliberately does not. A copy defect should fail before a push, not during a hand-run suite.
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
import legendsData from "@/data/referee-legends.json";
import timingData from "@/data/referee-timing.json";
import type { RefereeFoulStyle } from "@/lib/referee-foul-style";
import type { RefereeLegends } from "@/lib/referee-legends";
import type { RefereeTiming } from "@/lib/referee-timing";

const style = styleData as RefereeFoulStyle;
const timing = timingData as RefereeTiming;
const legends = legendsData as RefereeLegends;

const html = renderToStaticMarkup(
  createElement(RefereeEffectContent, { style, timing, legends })
);
/** Tags stripped and whitespace collapsed, so assertions read as a visitor reads the page. */
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("RefereeEffectContent", () => {
  it("renders at all", () => {
    expect(html.length).toBeGreaterThan(1000);
  });

  it("states the late-game null in the visitor's words, not just in the data", () => {
    // The sentence ADR 0007 committed to publishing whatever the number did.
    expect(text).toContain("do not swallow the whistle at the end");
  });

  it("does not claim the home whistle is nothing, because its own data says otherwise", () => {
    // This assertion used to require the page to say "no official tilts the whistle home" while
    // rendering `2.06x chance` two clauses earlier — a claim its own artifact contradicted, held
    // in place by the test that was supposed to catch it. Corrected 2026-08-21 along with the
    // copy. The page may call the effect modest; it may not call it absent.
    expect(timing.homeAway.shooting.observed).toBeGreaterThan(timing.expectedByChance);
    expect(text).not.toContain("no official tilts the whistle home");
    expect(text).toContain("the honest word is modest");
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

  it("never quotes an extreme pair without the number chance puts beside it", () => {
    // The whole point of the folklore section. The famous record may appear; it may not appear
    // without the count noise alone produces at the same bar.
    expect(text).toContain(`${legends.legend.wins}\u2013${legends.legend.losses}`);
    expect(text).toContain(String(legends.noiseFloor.mostExtremePFromNoise));
    expect(text).toContain(`${legends.noiseFloor.clearedPoint01} vs ${legends.noiseFloor.expectedPoint01}`);
  });

  it("shows the same official at both ends of the list", () => {
    // A curse and a charm on one whistle is the argument; losing it would leave an accusation.
    const charms = legends.sameOfficialOtherPairs.filter((p) => p.playerWon);
    expect(charms.length).toBeGreaterThan(1);
    for (const pair of charms) expect(text).toContain(pair.player);
  });

  it("reports the make-up-call sign flip rather than the headline t-statistic alone", () => {
    // Published without the offensive-foul figure, the t = 27 reads as proof of compensation.
    expect(legends.makeupCalls.afterOffensiveFoul).toBeLessThan(0.5);
    expect(text).toContain("BELOW CHANCE, NOT ABOVE");
  });

  it("never runs two words together across a JSX boundary", () => {
    // A `{" "}` dropped between an expression and the next word is invisible in review and
    // silently ships as "12,403games". Catches the class rather than one instance.
    expect(text).not.toMatch(/\d[a-z]{3,}/);
    expect(text).not.toMatch(/[a-z]{3,}\d/);
  });
});
