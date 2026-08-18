import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DIRECT_NAV_ITEMS, OTHER_NAV_ITEMS } from "@/lib/primary-navigation";

/**
 * The contract a new page or tab has to satisfy, enforced rather than written down.
 *
 * Every rule here exists because it was documented and then broken anyway. `not-found.tsx` and
 * `error.tsx` drifted onto a different type scale entirely — 36/48px titles, 14px prose, 96px of
 * padding — for the plain reason that no nav link and no spec reached them, so nothing ever
 * looked. The 15px prose rule was in docs/FRONTEND.md for weeks and was broken in ten files.
 * A convention that only lives in prose is a convention that holds until the next contributor.
 *
 * See docs/ADDING_A_SURFACE.md for the same contract in readable form, and for how to add an
 * exemption — the escape hatch is a named entry with a reason, never disabling a test.
 */

const ROOT = process.cwd();
const APP = join(ROOT, "src", "app");

/** Every `page.tsx` under `src/app`, as the route it serves. */
function routes(): { route: string; file: string }[] {
  const found: { route: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "__tests__" && !name.startsWith("api")) walk(p);
      } else if (name === "page.tsx") {
        const rel = relative(APP, dir).split("\\").join("/");
        found.push({ route: rel === "" ? "/" : `/${rel}`, file: p });
      }
    }
  };
  walk(APP);
  return found.sort((a, b) => a.route.localeCompare(b.route));
}

const ROUTES = routes();

/** Resolve `@/components/x` (or `@/app/x`) to a file on disk. */
function resolve(spec: string): string | null {
  for (const ext of [".tsx", ".ts"]) {
    const p = join(ROOT, "src", spec + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Does this page render `<Pattern …>` — following only the components it ACTUALLY renders?
 *
 * The first version of this walked every `@/components` import transitively and searched the
 * concatenated text, which made it pass for a page whose heading had been deleted: somewhere in a
 * three-hop neighbourhood *some* file mentioned the word. Verified by removing `/availability`'s
 * `PageHeader` and watching 57 tests still pass. A test that cannot fail is worse than no test,
 * because it is counted as coverage.
 *
 * So: follow an import only when the page renders that component as JSX, and always follow a
 * dynamic `import("@/…")`, since that is the payload of a `lazyContent` wrapper and is exactly
 * what does get rendered. `/analysis` is two hops from its heading this way — page →
 * `analysis-lazy` → `analysis-content` — and every content-heavy page in this app is code-split
 * the same way.
 */
function renders(file: string, pattern: RegExp, depth = 4, seen = new Set<string>()): boolean {
  if (depth === 0 || seen.has(file) || !existsSync(file)) return false;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  if (pattern.test(src)) return true;

  const rendered = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]));

  for (const m of src.matchAll(/import\("@\/((?:components|app)\/[^"]+)"\)/g)) {
    const next = resolve(m[1]);
    if (next && renders(next, pattern, depth - 1, seen)) return true;
  }
  for (const m of src.matchAll(/import \{([^}]*)\} from "@\/((?:components|app)\/[^"]+)"/g)) {
    const names = m[1].split(",").map((n) => n.trim().split(" as ").pop()!.trim());
    if (!names.some((n) => rendered.has(n))) continue;
    const next = resolve(m[2]);
    if (next && renders(next, pattern, depth - 1, seen)) return true;
  }
  return false;
}

/**
 * `/` is the front door: a full-bleed editorial surface with its own fluid display scale, already
 * exempt by name from `e2e/alignment-audit.spec.ts` and from the type scale. It is the one page
 * that deliberately does not look like the product, because its job is to argue for it.
 */
const NO_PAGE_HEADER = new Map([
  ["/", "the front door — a self-scoped editorial surface, exempt everywhere else too"],
]);

/** Routes that are real pages but deliberately take no tab. */
const NO_NAV_TAB = new Map([
  ["/", "the front door: reached by the wordmark and the footer, not by a tab"],
  ["/referees", "built and deliberately unpublished — see the hard ban in CLAUDE.md"],
  ["/behind-the-data", "the reference section, reached by its own right-aligned link"],
]);

describe("every page states what it is", () => {
  it.each(ROUTES)("$route renders PageHeader", ({ route, file }) => {
    if (NO_PAGE_HEADER.has(route)) {
      expect(NO_PAGE_HEADER.get(route)).toBeTruthy();
      return;
    }
    // Eyebrow, 32px title, 15px description, and the optional AS OF stamp — one component, so
    // moving between tabs does not feel like moving between products.
    expect(renders(file, /<PageHeader[\s/>]/), `${route} never renders <PageHeader>`).toBe(true);
  });

  it.each(ROUTES)("$route builds its column on the chapter gap", ({ route, file }) => {
    if (NO_PAGE_HEADER.has(route)) return;
    // `gap-12` (SPACE.chapter) between chapters — heading, controls, results. A uniform gap-4
    // gave a heading the same separation as two halves of one control panel.
    expect(renders(file, /flex flex-col gap-12/), `${route} has no gap-12 column`).toBe(true);
  });
});

describe("every page is reachable and measured", () => {
  const NAV = [...DIRECT_NAV_ITEMS, ...OTHER_NAV_ITEMS].map((i) => i.href);

  it.each(ROUTES)("$route is in the nav or exempt with a reason", ({ route }) => {
    if (route.startsWith("/behind-the-data/")) return; // reached from the section's own index
    if (NO_NAV_TAB.has(route)) {
      expect(NO_NAV_TAB.get(route)).toBeTruthy();
      return;
    }
    expect(NAV).toContain(route);
  });

  it("every nav href points at a page that exists", () => {
    // The other direction, and the one that actually shipped broken: two links pointed at `/`
    // after the front-door swap moved the games board to `/games`.
    const real = new Set(ROUTES.map((r) => r.route));
    for (const href of NAV) expect(real, `nav href ${href}`).toContain(href);
  });

  it("every route is in the alignment audit's route list", () => {
    // A page absent from the instrument is a page nobody measures. `/` is out on purpose and
    // says so in the spec; the error pages have no route of their own to visit.
    const spec = readFileSync(join(ROOT, "e2e", "alignment-audit.spec.ts"), "utf8");
    const listed = [...spec.matchAll(/"(\/[a-z0-9/-]*)"/g)].map((m) => m[1]);
    for (const { route } of ROUTES) {
      if (route === "/") continue;
      expect(listed, `${route} missing from alignment-audit.spec.ts`).toContain(route);
    }
  });
});

describe("the design scale holds across the whole tree", () => {
  /**
   * This runs the real instrument — `scripts/audit_design_scale.mjs` — and fails the gate if it
   * finds a value off any of the four scales.
   *
   * **This supersedes the "deliberately no ESLint rule yet" note in docs/FRONTEND.md**, and the
   * reasoning there is worth answering rather than ignoring: a scale nobody has stress-tested
   * through a real feature becomes a rule people disable. Two things changed. The scales have now
   * been through a real pass — 36 font sizes to 8, 18 tracking values to 4, 15 leadings to 3,
   * across 19 routes — and the alternative was measured: the 15px prose rule sat in the docs,
   * unenforced, and was broken in ten files.
   *
   * The escape hatch is deliberately not "disable this test". It is a named entry in the script's
   * own `EXEMPT` list, with a reason, which is reviewable in a diff. Five already exist.
   */
  it("reports nothing off the type, spacing, tracking or leading scales", () => {
    execFileSync("node", [join(ROOT, "scripts", "audit_design_scale.mjs")], { stdio: "pipe" });
    const report = readFileSync(join(ROOT, "test-results", "design-scale", "report.txt"), "utf8");

    const total = /OFF-SCALE TOTAL: (\d+)/.exec(report);
    expect(total, "the report did not state a total").not.toBeNull();
    expect(
      Number(total![1]),
      // The report itself names every stray with file:line — point at it rather than
      // reproducing it in an assertion message that would be truncated.
      "off-scale values found; see test-results/design-scale/report.txt for file:line"
    ).toBe(0);
  });
});
