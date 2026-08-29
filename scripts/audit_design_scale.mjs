#!/usr/bin/env node
/**
 * The design-scale instrument.
 *
 *   node scripts/audit_design_scale.mjs
 *   → test-results/design-scale/report.txt
 *
 * "The spacing looks random" is not a reviewable claim, so this turns it into one. It reads every
 * `.tsx` and `.css` file under `src/` (plus `terminal-styles.ts`, the one `.ts` that declares
 * styles) and extracts every type size, spacing value, content width, tracking and leading the app
 * declares — from inline style objects, Tailwind utilities (named and arbitrary) and
 * `globals.css` — then reports the distribution and every value that is off the scales in
 * `src/lib/terminal-styles.ts`, with `file:line`.
 *
 * It exists because the scales are enforced by nothing but attention. `SPACE` has been a token
 * object since 2026-08-11 and `TYPE` since 2026-08-18, and in between the app still drifted to 36
 * distinct font sizes — because a docblock is not a check and nobody can hold twenty numbers in
 * their head across twenty files.
 *
 * **A REPORTER, NOT A LINT RULE.** It always exits 0. docs/FRONTEND.md records the reasoning:
 * a scale nobody has stress-tested through a real feature becomes a rule people disable, and
 * the moment this fails a build someone adds an ignore comment instead of a token. Read the
 * report; do not wire it into CI without deciding that question first.
 *
 * It measures what the source *declares*. It cannot see a size arriving through inheritance or a
 * cascade — for that, read a rendered page's computed styles. In practice this app sets nearly
 * every size explicitly, so the two agree.
 *
 * Written to a file rather than stdout on purpose: this environment has masked numeric digits in
 * Bash stdout before (CLAUDE.md, Evidence discipline), and a scale audit read off a corrupted
 * stdout is worse than no audit. Same reason as e2e/alignment-audit.spec.ts.
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
/** The only `.ts` file that declares styles rather than data — verified, not assumed. */
const STYLE_MODULE = join(SRC, "lib", "terminal-styles.ts");

/** The scales, kept in step with `src/lib/terminal-styles.ts` by `design-scale.test.ts`. */
const TYPE_SCALE = [10, 11, 12, 15, 18, 24, 32, 40];
const SPACE_SCALE = [4, 8, 12, 16, 24, 32, 48];
const TRACK_SCALE = ["0.08em", "0.04em", "0.06em", "-0.01em"];
const LEAD_SCALE = [1.1, 1.4, 1.55];
/** 0 is not a step but is always legitimate; 28 is `SPACE_NESTED_ROW`, the one third rail. */
const SPACE_OK = new Set([...SPACE_SCALE, 0, 28]);

/**
 * The documented exemptions, listed in `terminal-styles.ts` beside `TYPE`. Values in these files
 * are reported under their own heading rather than as strays, so the stray list stays actionable
 * — a report that always shows the same twenty known lines is a report nobody reads.
 */
const EXEMPT = [
  // A full-bleed editorial surface on its own fluid clamp() display scale. Exempt by name from
  // e2e/alignment-audit.spec.ts for the same reason.
  { match: /^src\/components\/about-content\.tsx$/, why: "the front door: fluid clamp() display scale" },
  // A fixed 1200×630 brand asset, not a page.
  { match: /^src\/app\/opengraph-image\.tsx$/, why: "brand asset, not a page" },
  { match: /^src\/lib\/brand\//, why: "brand asset, not a page" },
  // Vendored shadcn; its sizes live inside has-data-* variant selectors.
  { match: /^src\/components\/ui\/button\.tsx$/, why: "vendored shadcn" },
  // Line-level: everything else in this file is on the scale, so exempting the whole file would
  // hide real drift. The wordmark is sized to the brand zone beside a 34px mark, not to a
  // text role; resizing it is a branding decision.
  {
    match: /^src\/components\/nav-bar\.tsx$/,
    raw: /fontSize: "22px"/,
    why: "the brand wordmark, sized to the brand bar",
  },
];

/**
 * Values that are deliberately not scale entries wherever they appear.
 *
 * `16` on type: the iOS input-zoom floor, a functional value rather than a typographic one.
 * `2` and `3` on spacing: geometry inside a data mark — the gap between two bar segments, a
 * shot-grid cell — which the SPACE docblock exempts explicitly. Those are *drawing*, sized
 * against the data and the pixel grid, not layout sized against the page.
 */
const TYPE_ALWAYS_OK = new Set([16]);
const SPACE_ALWAYS_OK = new Set([2, 3]);
/**
 * `14px` as a line-height is a **badge chip's box height**, fixed independently of its font size
 * so a row of chips is one height whatever is in them. That is geometry, like a data mark's gap —
 * not leading. `normal` and `inherit` are refusals to set the property at all, which is fine.
 */
const LEAD_ALWAYS_OK = new Set(["14px", "normal", "inherit"]);
const TRACK_ALWAYS_OK = new Set(["normal", "inherit"]);

const TW_SPACE_UNIT = 4; // Tailwind v4: 0.25rem
const TW_TEXT = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30,
  "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== ".next") walk(p, out);
    } else if (/\.(tsx|css)$/.test(name) || p === STYLE_MODULE) {
      // `.tsx` and `.css` only, plus the one `.ts` that declares styles. Plain `.ts` files hold
      // DATA, and one of them killed an earlier version of this report: `rest-split-facts.ts`
      // records rest gaps as `{ gap: 5, games: 3782, … }`, which a property-name scan reads as
      // nine off-scale CSS gaps. A `gap` of five days is not a five-pixel gutter.
      out.push(p);
    }
  }
  return out;
}

/** px for a plain length; null for anything computed (`clamp()`, `calc()`, a var). */
function toPx(raw) {
  const s = String(raw).trim();
  for (const [re, mul] of [[/^(-?[\d.]+)px$/, 1], [/^(-?[\d.]+)rem$/, 16], [/^(-?[\d.]+)$/, 1]]) {
    const m = re.exec(s);
    if (m) return parseFloat(m[1]) * mul;
  }
  return null;
}

const SPACE_PROPS = /^(padding|margin|gap|rowGap|columnGap)(Top|Right|Bottom|Left|Block|Inline)?$/;

const axes = {
  type: new Map(), space: new Map(), width: new Map(),
  tracking: new Map(), leading: new Map(),
};
function add(axis, value, rec) {
  if (!axes[axis].has(value)) axes[axis].set(value, []);
  axes[axis].get(value).push(rec);
}

for (const file of walk(SRC).sort()) {
  const rel = relative(ROOT, file);
  if (/__tests__|\.test\.|\.spec\./.test(rel)) continue;
  const rules = EXEMPT.filter((e) => e.match.test(rel));
  const isCss = rel.endsWith(".css");

  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    // A rule with no `raw` exempts the whole file; with one, only the lines it matches.
    const exempt = rules.find((e) => !e.raw || e.raw.test(line))?.why ?? null;
    const loc = { file: rel, line: i + 1, raw: line.trim().slice(0, 150), exempt };

    if (!isCss) {
      for (const m of line.matchAll(/\bfontSize:\s*(?:"([^"]+)"|'([^']+)'|([\d.]+))/g)) {
        const raw = m[1] ?? m[2] ?? m[3];
        const px = toPx(raw);
        add("type", px ?? `computed(${raw})`, { ...loc, kind: "inline fontSize" });
      }
      for (const m of line.matchAll(/\b([a-zA-Z]+):\s*(?:"([^"]+)"|'([^']+)'|([\d.]+))/g)) {
        const prop = m[1];
        const raw = m[2] ?? m[3] ?? m[4];
        if (SPACE_PROPS.test(prop)) {
          // A shorthand carries several values: `padding: "8px 12px"`.
          for (const part of String(raw).trim().split(/\s+/)) {
            const px = toPx(part);
            add("space", px ?? `computed(${part})`, { ...loc, kind: `inline ${prop}` });
          }
        }
        if (/^(maxWidth|minWidth)$/.test(prop)) {
          const px = toPx(raw);
          if (px !== null) add("width", px, { ...loc, kind: `inline ${prop}` });
        }
        if (prop === "letterSpacing") add("tracking", String(raw), { ...loc, kind: "inline" });
        if (prop === "lineHeight") add("leading", String(raw), { ...loc, kind: "inline" });
      }
    }

    if (isCss) {
      for (const m of line.matchAll(/font-size:\s*([^;]+);/g)) {
        const px = toPx(m[1]);
        add("type", px ?? `computed(${m[1].trim()})`, { ...loc, kind: "css font-size" });
      }
      for (const m of line.matchAll(/\b(padding|margin|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?:\s*([^;]+);/g)) {
        for (const part of m[3].trim().split(/\s+/)) {
          const px = toPx(part);
          if (px !== null) add("space", px, { ...loc, kind: `css ${m[1]}${m[2] ?? ""}` });
        }
      }
    }

    // Tailwind utilities, in any file.
    for (const m of line.matchAll(/(?<![\w-])text-\[([^\]]+)\]/g)) {
      const px = toPx(m[1]);
      if (px !== null) add("type", px, { ...loc, kind: "tw text-[]" });
    }
    for (const m of line.matchAll(/(?<![\w-])(?:sm:|md:|lg:|xl:|2xl:)?text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)(?![\w-])/g)) {
      add("type", TW_TEXT[m[1]], { ...loc, kind: `tw text-${m[1]}` });
    }
    const SPACE_UTILS = "p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y";
    for (const m of line.matchAll(new RegExp(String.raw`(?<![\w-])(?:sm:|md:|lg:|xl:)?(${SPACE_UTILS})-\[([^\]]+)\]`, "g"))) {
      const px = toPx(m[2]);
      if (px !== null) add("space", px, { ...loc, kind: `tw ${m[1]}-[]` });
    }
    for (const m of line.matchAll(new RegExp(String.raw`(?<![\w-])(?:sm:|md:|lg:|xl:)?(${SPACE_UTILS})-(\d+(?:\.\d+)?)(?![\w.\-\[])`, "g"))) {
      add("space", parseFloat(m[2]) * TW_SPACE_UNIT, { ...loc, kind: `tw ${m[1]}-${m[2]}` });
    }
  });
}

const numFirst = (a, b) => {
  const an = typeof a[0] === "number", bn = typeof b[0] === "number";
  if (an && bn) return a[0] - b[0];
  if (an !== bn) return an ? -1 : 1;
  return String(a[0]).localeCompare(String(b[0]));
};

/** @param onScale null for an axis with no scale yet — then everything is informational. */
function section(title, axis, onScale, note) {
  const rows = [...axes[axis].entries()].sort(numFirst);
  const strays = [];
  const exempted = [];
  let out = `\n${"═".repeat(78)}\n${title}\n${"═".repeat(78)}\n`;
  if (note) out += `${note}\n`;
  out += `\ndistinct values declared: ${rows.length}\n\n`;
  for (const [value, recs] of rows) {
    const ok = onScale ? onScale(value) : true;
    const live = recs.filter((r) => !r.exempt);
    const flag = !onScale ? "   " : ok ? " ✓ " : live.length ? "OFF" : "ex " ;
    out += `${flag} ${String(value).padStart(11)}  ×${String(recs.length).padStart(4)}\n`;
    if (onScale && !ok) {
      for (const r of recs) (r.exempt ? exempted : strays).push({ value, ...r });
    }
  }
  if (onScale) {
    out += `\n── OFF SCALE (${strays.length}) ${"─".repeat(50)}\n`;
    if (!strays.length) out += "   (none)\n";
    for (const s of strays) out += `   [${s.value}] ${s.file}:${s.line}  (${s.kind})\n       ${s.raw}\n`;
    if (exempted.length) {
      out += `\n── in exempt files (${exempted.length}, not strays) ${"─".repeat(28)}\n`;
      for (const s of exempted) out += `   [${s.value}] ${s.file}:${s.line} — ${s.exempt}\n`;
    }
  }
  return { out, strays: strays.length };
}

const type = section(
  "TYPE — font sizes (px)", "type",
  (v) => typeof v === "number" && (TYPE_SCALE.includes(v) || TYPE_ALWAYS_OK.has(v)),
  `scale: ${TYPE_SCALE.join(" / ")}   plus 16 (the iOS control floor, not a type step)\n` +
  "A value here is a LITERAL in the source. A size written as `TYPE.body` does not appear at all,\n" +
  "which is the point: this list shrinks as call sites move onto tokens."
);
const space = section(
  "SPACE — padding, margin, gap (px)", "space",
  (v) => typeof v === "number" && (SPACE_OK.has(v) || SPACE_ALWAYS_OK.has(v)),
  `scale: ${SPACE_SCALE.join(" / ")}   plus 0, 28 (SPACE_NESTED_ROW), 2–3 (data-mark geometry)`
);
const width = section(
  "WIDTH — declared min/max widths (px)", "width", null,
  "Informational. WIDTH governs CONTENT COLUMNS only (1040 / 760 / 42rem); a control or a data\n" +
  "mark with an intrinsic size keeps its own, so most values here are legitimately their own."
);
const tracking = section(
  "TRACKING — letter-spacing", "tracking",
  (v) => TRACK_SCALE.includes(String(v)) || TRACK_ALWAYS_OK.has(String(v)),
  `scale: ${TRACK_SCALE.join(" / ")}   (TRACK: label / sub / data / figure)\n` +
  "Was 18 distinct values, of which 0.08em and 0.04em carried three quarters and the rest varied\n" +
  "by nothing but which file the label lived in."
);
const leading = section(
  "LEADING — line-height", "leading",
  (v) => LEAD_SCALE.includes(Number(v)) || LEAD_ALWAYS_OK.has(String(v)),
  `scale: ${LEAD_SCALE.join(" / ")}   (LEAD: figure / label / body)   plus a chip's 14px box\n` +
  "Was 15 values, where 1 / 1.05 / 1.1 all meant \"a figure needs no air above it\" and\n" +
  "1.5 / 1.55 / 1.6 / 1.65 / 1.7 all meant \"this is a paragraph\"."
);

const total = type.strays + space.strays + tracking.strays + leading.strays;
let out =
  "FULLCOURT DESIGN-SCALE AUDIT\n" +
  "scales live in src/lib/terminal-styles.ts · exemptions are listed there and honoured here\n" +
  `\nOFF-SCALE TOTAL: ${total}  (type ${type.strays}, space ${space.strays}, ` +
  `tracking ${tracking.strays}, leading ${leading.strays})\n`;
out += type.out + space.out + width.out + tracking.out + leading.out;

const dir = join(ROOT, "test-results", "design-scale");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "report.txt"), out);
// stderr, so a digit-masking stdout cannot be mistaken for the report.
console.error(`wrote ${relative(ROOT, join(dir, "report.txt"))} — off-scale total in the file`);
