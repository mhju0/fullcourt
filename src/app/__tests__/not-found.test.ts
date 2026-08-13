/**
 * Renders the 404 page, which nothing in the commit gate does.
 *
 * `not-found.tsx` already has an e2e guard (`navigation.spec.ts`, added in PR #26 after this
 * file's Games button shipped pointing at `/`). That guard is better than this one — it drives a
 * real 404 and follows the click. It also **runs nowhere automatic**: `CLAUDE.md` keeps Playwright
 * out of the commit gate and `ci.yml` does not run it either, so in practice nothing checks this
 * page on the way to a commit. That is how the defect shipped in the first place.
 *
 * So the two are deliberately not redundant: e2e proves the route works, this proves the links
 * are still right at `pnpm test:run` time. Companion to `error-boundary.test.ts`, which covers the
 * other half of the same blind spot — see its docblock for why neither file is reachable by any
 * routing.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";

const html = renderToStaticMarkup(createElement(NotFound));

/** Tags stripped and whitespace collapsed, so assertions read as a visitor reads the page. */
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("404 page", () => {
  it("renders at all", () => {
    expect(text).toContain("Page not found");
    expect(text).toContain("404");
  });

  it("offers exactly the two ways out it names", () => {
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/games", "/analysis"]);
  });

  it("sends the games button to the games board, not the front door", () => {
    // The defect that shipped on 2026-08-12. `/` was the games board until the front-door swap
    // moved it to `/games`, leaving a button labelled "Games" pointing at the marketing page —
    // a link whose label and destination disagree, shown to someone already lost.
    //
    // Href and label asserted together: either alone still permits the pair to drift apart.
    expect(html).toMatch(/href="\/games"[^>]*>[^<]*Games/);
    expect(html).toMatch(/href="\/analysis"[^>]*>[^<]*Model results/);
  });

  it("keeps the prose and the destinations telling the same story", () => {
    // The copy promises the games board, so the button has to actually open it. This is the
    // assertion that fails if the copy is reworded to promise somewhere the buttons do not go.
    expect(text).toContain("games board");
    expect(html).toContain('href="/games"');
  });
});
