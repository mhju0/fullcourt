# Adding a surface — the contract for a new page or tab

Written 2026-08-18, after a full UI pass found the site declaring 36 font sizes, 18 tracking
values and 15 line-heights, and eight independent implementations of "a labelled figure in a box".
None of that was carelessness. Every rule it broke was **written down somewhere and enforced
nowhere**, and a convention that lives only in prose holds until the next contributor.

So this file is the readable half of a contract whose other half is executable. Each rule below
names the test that holds it. If you follow the contract, a new page looks like the product on the
first render, and you will not need a design pass afterwards.

**Read this with [FRONTEND.md](FRONTEND.md), which says *why* each rule is what it is.** This file
says *what to do*.

---

## The short version

1. Give it a `PageHeader`.
2. Make its root `<div className="flex flex-col gap-12">`.
3. Use `TYPE` / `SPACE` / `TRACK` / `LEAD` — never a literal.
4. Use `DataTable` for a table, `StatTile` / `StatFigure` for a figure, `MessageCard` for a failure.
5. Register it in `primary-navigation.ts` and add its route to `e2e/alignment-audit.spec.ts`.
6. Run `pnpm test:run`. The contract is enforced, so it will tell you what you missed.

---

## 1 · The page shell

```tsx
export default function Page() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="WHAT THIS MEASURES · IN WHAT UNIT"
        title="Plain Noun Phrase"
        description="One or two sentences. What the page answers, and what it refuses to claim."
      />
      {/* controls */}
      {/* results */}
    </div>
  )
}
```

- **`PageHeader` is not optional.** It supplies the eyebrow, the 32px title, the 15px description
  on the one prose measure, and the optional `AS OF` data stamp. Two pages used to hand-copy this
  markup — one for a data-dependent eyebrow, one for a narrower measure — and the measure is now
  fixed for everyone, because 4rem of extra line length was not worth every reference page
  introducing itself differently. *Enforced: `page-contract.test.ts` → "renders PageHeader".*
- **`gap-12` is the chapter gap** between heading, controls and results. Tighter spacing goes
  *inside* a chapter. A uniform `gap-4` gave a heading the same separation as two halves of one
  control panel. Loading and error branches carry the same `gap-12`, so the layout does not shift
  when data lands. *Enforced: same file, "builds its column on the chapter gap".*
- **Do not add a container, a gutter, or vertical page padding.** `layout.tsx` owns
  `mx-auto max-w-7xl px-4 py-8 sm:px-6`, and the brand bar, nav row and footer match it exactly.
  A page that adds its own gutter puts its title off the rail every other page's title is on.

## 2 · Type, spacing, tracking, leading

Four scales, all in [`src/lib/terminal-styles.ts`](../src/lib/terminal-styles.ts). **Pick the entry
whose *job* matches. Do not round to the nearest.** Rounding is how a scale decays back into a
range, which is what happened last time.

| | tokens | steps |
| --- | --- | --- |
| Size | `TYPE` | `micro` 10 · `label` 11 · `data` 12 · `body` 15 · `emph` 18 · `stat` 24 · `title` 32 · `figure` 40 |
| Space | `SPACE` | 4 · 8 · 12 · 16 · 24 · 32 · 48 |
| Tracking | `TRACK` | `label` 0.08em · `data` 0.06em · `sub` 0.04em · `figure` −0.01em |
| Leading | `LEAD` | `figure` 1.1 · `label` 1.4 · `body` 1.55 |

```tsx
// An inline style reads the token.
<span style={{ fontSize: TYPE.label, letterSpacing: TRACK.label }}>GAMES</span>

// A class reads the same step by name — `globals.css` generates these from a `@theme` block.
<p className="text-body leading-body">…</p>
```

Use the class form when the step has to be **responsive**, which an inline style cannot be. The one
standing case is the iOS input-zoom floor: `text-[16px] sm:text-data` on any focusable control.
**That 16px stays a literal** — it is mobile Safari's threshold, not a step of ours. Below it,
Safari zooms the page on focus and does not undo it on blur.

Two rules that follow from the scales rather than being extra:

- **Any sentence is `TYPE.body`.** Uppercase mono is for labels of about three words or fewer.
  All-caps removes word-shape cues and measurably slows reading past a few words.
- **Never hand-roll a signed number.** `signedNumber()` (`src/lib/signed-number.ts`) — U+2212, not
  a hyphen, and a bare zero.

*Enforced: `page-contract.test.ts` → "the design scale holds across the whole tree", which runs
`scripts/audit_design_scale.mjs` over every `.tsx` and `.css` and fails on anything off any of the
four scales. `design-scale.test.ts` pins the token values themselves, and pins the two other copies
of the scales (the CSS `@theme` block and the audit script's own list) against them.*

## 3 · Use the component, don't rebuild it

Every one of these exists because the pattern had already been hand-rolled several times and the
copies had drifted.

| For | Use | Instead of |
| --- | --- | --- |
| A table | `DataTable` | 21 call sites, each needing to know twelve facts independently; five of the seven measurable ones had drifted |
| A row of labelled measures | `StatTile` | eight independent tiles, two of them both named `StatCard` |
| The one figure a section states | `StatFigure` | three inline copies of a 40px figure and its caption |
| A failure or empty state | `MessageCard` | nine branches in five visual shapes; six of eight announced nothing to a screen reader |
| A card | `termCardStyle` | ~20 distinct inline padding values |
| A recessed panel | `termInsetStyle` | a bordered box, which put nested text on a third rail |
| A "how this works" link | `MethodLink` | — |
| A season picker | `SeasonSelector` | — |

`StatTile` versus `StatFigure` is a real distinction, not two styles of the same thing:

- **`StatTile` puts the label first** — for a **row** of measures, where a reader scans labels to
  find the one they came for.
- **`StatFigure` puts the figure first** — for the **one** number a section exists to state, where
  there is nothing to scan and the caption qualifies a number already seen.

A row of figures with captions underneath makes the reader read every number to find the one they
wanted, so getting this backwards is a usability bug and not a style slip.

## 4 · Alignment

**Two horizontal rails, and only two.**

- The **outer rail** is the page gutter, from `layout.tsx`.
- The **inner rail** is `SPACE_CARD` (16px) in from a box's own border.

A table is a box, so it takes the inner rail like any other box; its cell padding comes from the
`.fc-table` rule and is not yours to set. A recessed panel is a **band** — rules top and bottom, no
side padding — so it bleeds to its container's content edge and its text stays on the rail. One
documented third rail exists (`SPACE_NESTED_ROW`, 28px, for a row nested inside another row) and
nothing else may take one.

**A rail must never cost layout width.** Draw a group marker as `box-shadow: inset 2px 0 0`, never
`border-left` — as a border it pushes the column it was meant to mark out of alignment.

*Enforced: `e2e/alignment-law.spec.ts` asserts the absolute parts. `e2e/alignment-audit.spec.ts`
reports every near-miss edge to `test-results/alignment/report.txt` — advisory, with a floor it
will never reach, so **diff it for new kinds of stray, never for the count**. Changing type sizes
moves every rail in it at once.*

## 5 · Register it

Three lists, and a page missing from any of them is a page nobody sees or measures.

1. **`src/lib/primary-navigation.ts`** — `DIRECT_NAV_ITEMS` for a tab in the bar,
   `OTHER_NAV_ITEMS` for the OTHER menu. Write the label's *reason* in a comment beside it, the way
   every existing entry does: the labels are the site's vocabulary and collisions between them
   misroute clicks. See [GLOSSARY.md](GLOSSARY.md). **The ⌘K palette derives from these same two
   lists** (`command-palette.tsx`), so registering here covers it. **The phone dock does not** —
   `bottom-nav.tsx` holds its own fixed `SLOTS` (four routes plus search, per ADR 0010), and a
   new surface is not meant to join it. Do not "fix" that by wiring the dock to these lists.
2. **`e2e/alignment-audit.spec.ts`** — add the route to `ROUTES`.
3. **`docs/FRONTEND.md`** — a `### /route` section, in the same PR. Docs ship with the change.

*Enforced: `page-contract.test.ts` → "is in the nav or exempt with a reason", "every nav href
points at a page that exists", "every route is in the alignment audit's route list".*

## 6 · Then check it

```
pnpm test:run          # includes the whole contract above
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e          # by hand — it needs a server and a populated database
node scripts/audit_design_scale.mjs   # → test-results/design-scale/report.txt, file:line for strays
```

**Run `pnpm test:e2e` by hand whenever a route or a page's header copy moves.** It is deliberately
outside the commit gate, so nothing else will catch a broken link — and `not-found.tsx` /
`error.tsx` are reachable by no routing at all, which is how two broken links once shipped.

---

## Exemptions

The escape hatch is **a named entry with a reason**, never a disabled test. Adding one is a
reviewable line in a diff; disabling a check is invisible six months later.

| Where | List |
| --- | --- |
| A file or line off the scales | `EXEMPT` in `scripts/audit_design_scale.mjs` |
| A page with no `PageHeader` | `NO_PAGE_HEADER` in `page-contract.test.ts` |
| A page with no nav tab | `NO_NAV_TAB` in the same file |
| A route not measured for alignment | a comment in `alignment-audit.spec.ts`'s `ROUTES` |

What is already exempt, and why — so these are not rediscovered every pass:

- **`/` (the front door)** — a full-bleed editorial surface on its own fluid `clamp()` display
  scale. It is the one page that deliberately does not look like the product, because its job is to
  argue for it. Exempt from the type scale, the alignment audit and the page contract.
- **16px on a focusable control** — the iOS input-zoom floor. A threshold, not a step.
- **The brand wordmark** — sized to the chrome bar (one 56px bar since the 2026-08-29 shell
  merge; it was a 52px brand bar before), not to a text role. Exempt by *line*, so the rest of
  `nav-bar.tsx` stays on the scale.
- **`opengraph-image.tsx`** and `src/lib/brand/` — fixed-size brand assets, not pages.
- **`components/ui/button.tsx`** — vendored shadcn; its sizes live inside `has-data-*` variants.
- **A badge chip's `lineHeight: "14px"`** — box geometry, fixing the chip's height independently of
  its font size. Like a data mark's gap: drawing, not layout.
- **Data-mark geometry** — the 2px gap between bar segments, a shot-grid cell, the fatigue bar's
  4px height. Sized against the data and the pixel grid, not against the page.

## One thing this contract does not check

**Whether the page should exist, and whether its copy states what it measured.** That is the part
no test reaches, and it is the part this project cares about most: a venue baseline rather than a
coin flip, a published null where the result is null, no figure typed into prose that a generated
artifact could pin instead. [FRONTEND.md](FRONTEND.md), [ARCHITECTURE.md](ARCHITECTURE.md) and the
[ADRs](adr/) carry those rules. `/referees` is the standing example, and it is now the whole arc:
the data, the component and the tests all worked for three weeks while the page stayed unpublished,
because the writing around them was unfinished. It shipped on 2026-08-22 once that writing existed
— and what the writing had to do was carry the numbers chance produces beside the ones a reader
wants to believe. The gap between "the tests pass" and "this is publishable" was the entire point.
