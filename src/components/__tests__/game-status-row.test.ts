import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FatigueDetailColumn, GameStatusRow, RaBadge } from "../matchup-parts";

describe("game detail lifecycle label", () => {
  it.each([[undefined, "FINAL"], [0, "FINAL"], [1, "FINAL/OT"], [2, "FINAL/2OT"], [5, "FINAL/5OT"]])("renders final overtime %s", (overtimePeriods, label) => {
    const html = renderToStaticMarkup(createElement(GameStatusRow, { status: "final", homeScore: 141, awayScore: 135, overtimePeriods: overtimePeriods as number | undefined }));
    expect(html).toContain(`>${label}</span>`);
    expect(html).toContain("135");
    expect(html).toContain("141");
  });
  it.each(["postponed", "cancelled"])("shows %s while suppressing stale provider scores", status => {
    const html=renderToStaticMarkup(createElement(GameStatusRow,{status,homeScore:99,awayScore:98}));
    expect(html).toContain(status.toUpperCase());
    expect(html).not.toContain("99");
    expect(html).not.toContain("98");
    expect(html).not.toContain("LIVE");
  });
  it("keeps in-progress scores unpublished",()=>{
    const html=renderToStaticMarkup(createElement(GameStatusRow,{status:"live",homeScore:99,awayScore:98}));
    expect(html).toContain("LIVE");
    expect(html).not.toContain("99");
  });
});


describe("Cup pending estimates", () => {
  it("distinguishes pending estimates from absent fatigue data", () => {
    const html = renderToStaticMarkup(createElement(FatigueDetailColumn, { label: "Home · BOS", fatigue: null, pending: true }));
    expect(html).toContain("HOME · BOS · TBD");
    expect(html).not.toContain("NO FATIGUE DATA");
  });

  it("suppresses a stale numeric gap when the paired estimate is pending", () => {
    const html = renderToStaticMarkup(createElement(RaBadge, { homeAbbr: "BOS", awayAbbr: "POR", pending: true,
      restAdvantage: { differential: 7.8, advantageTeam: "home" } }));
    expect(html).toContain("TBD");
    expect(html).not.toContain("7.8");
    expect(html).not.toContain("NO DATA");
  });
});
