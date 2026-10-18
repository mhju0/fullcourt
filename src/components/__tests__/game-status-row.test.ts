import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameStatusRow } from "../matchup-parts";

describe("game detail lifecycle label", () => {
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
