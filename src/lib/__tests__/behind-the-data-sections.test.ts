import { describe, expect, it } from "vitest";
import {
  BEHIND_THE_DATA_SECTIONS,
  methodologyHrefFor,
} from "@/lib/behind-the-data-sections";
import { PRIMARY_NAV_ITEMS } from "@/lib/primary-navigation";

/**
 * `MethodLink` renders nothing when it finds no section, so a surface that documents itself
 * nowhere fails silently — the JSX still reads as though the page offers its method. That is
 * exactly how the games board shipped a "HOW THIS IS CALCULATED" link that pointed at nothing,
 * and how `/season` went without one at all. These tests are the guard that was missing.
 */
describe("methodologyHrefFor", () => {
  it("answers for every surface the fatigue score is rendered on", () => {
    // The three that share one section. `/` is the case that was broken.
    expect(methodologyHrefFor("/")).toBe("/behind-the-data/rest-advantage");
    expect(methodologyHrefFor("/analysis")).toBe("/behind-the-data/rest-advantage");
    expect(methodologyHrefFor("/season")).toBe("/behind-the-data/rest-advantage");
  });

  it("answers for each single-surface section", () => {
    expect(methodologyHrefFor("/schedule")).toBe("/behind-the-data/schedule-edge");
    expect(methodologyHrefFor("/playoffs")).toBe("/behind-the-data/playoff-predictions");
    expect(methodologyHrefFor("/shooting")).toBe("/behind-the-data/player-shooting");
    expect(methodologyHrefFor("/shot-quality")).toBe("/behind-the-data/shot-value");
    expect(methodologyHrefFor("/availability")).toBe("/behind-the-data/availability");
  });

  it("answers null for a surface nothing documents, rather than guessing", () => {
    expect(methodologyHrefFor("/referees")).toBeNull();
    expect(methodologyHrefFor("/nope")).toBeNull();
  });
});

describe("the section table", () => {
  /**
   * The lookup returns the first match, so a surface claimed twice would resolve by array order
   * — which is not a decision anyone made. One surface, one section.
   */
  it("never lets two sections claim the same surface", () => {
    const claimed = BEHIND_THE_DATA_SECTIONS.flatMap((s) => [...s.surfaceHrefs]);

    expect(claimed).toHaveLength(new Set(claimed).size);
  });

  it("only claims surfaces that are real product routes", () => {
    const routes = new Set<string>(PRIMARY_NAV_ITEMS.map((item) => item.href));

    for (const section of BEHIND_THE_DATA_SECTIONS) {
      for (const surface of section.surfaceHrefs) {
        expect(routes.has(surface)).toBe(true);
      }
    }
  });

  /**
   * Every published surface should reach its method from the page a reader doubts a number on.
   * `/referees` is deliberately unpublished and is the one exclusion; if it ever ships, this
   * test fails until it has a section, which is the reminder we want.
   */
  it("documents every published product surface", () => {
    const undocumented = PRIMARY_NAV_ITEMS.map((item) => item.href)
      .filter((href) => href !== "/referees")
      .filter((href) => methodologyHrefFor(href) === null);

    expect(undocumented).toEqual([]);
  });
});
