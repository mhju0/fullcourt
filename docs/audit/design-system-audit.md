# FullCourt — Design System Audit (READ-ONLY)

**Scope:** Map the current "Bloomberg Terminal" design system, inventory hardcoded
values, locate glassmorphism remnants, and list UX-state / a11y / responsive gaps —
as raw material for a future `DESIGN.md` token system. **Direction is already decided
(Plan A: keep the terminal aesthetic, unify completion across all pages).** This audit
diagnoses only; it prescribes no fixes and changes no code.

- **Method:** code-level only. Every numeric claim was written to a file and re-read
  with the Read tool (grep stdout digits are masked in this environment).
- **Tags:** `[Verified file:line]` = read from the literal source line ·
  `[Inferred]` = reasoned from code, not directly stated · `[Unknown]` = needs a real
  browser/contrast check (Michael).
- **Date:** 2026-07-03 · **Files changed by this task:** this report only.

---

## 1. Inventory — what actually exists on disk

### 1.1 Two coexisting design layers

| Layer | Where it lives | Status |
|-------|----------------|--------|
| **Terminal** (visible product) | Inline `style={{…}}` + `.mono` + a hardcoded hex palette, on every page/component | Active — the real UI |
| **shadcn "Liquid Glass"** (dormant) | `globals.css` `:root` tokens + `ui/{card,button,badge,skeleton,tabs,separator}.tsx` | Mostly unused; only `Button` + `Skeleton` are consumed, always with overrides |

- `globals.css:51-53` still titles the theme **"NBA Liquid Glass … glass panels stay
  white and frosted"** — stale; the shipped look is the flat terminal. [Verified globals.css:51-53]
- **Dead shadcn primitives:** `Card`, `Badge`, `Tabs`, `Separator` have **0 imports**
  anywhere in `src`. [Verified — `grep -rE 'ui/(card|badge|tabs|separator)' src` → 0 matches]
- **Used primitives:** only `Button` and `Skeleton`, imported by 10 files, always with
  inline `border/borderRadius/bg-[#F0EEE9]` overrides. [Verified used_prim.txt: 10 files]

### 1.2 Files in scope (all read in full)

`src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` (Today),
`src/app/analysis|upcoming|playoffs|shot-quality/page.tsx`,
`src/components/{analysis,upcoming}-content.tsx`, `nav-bar.tsx`, `matchup-card.tsx`,
`fatigue-bar.tsx`, `explore-game-detail-modal.tsx`, all `*-lazy.tsx`, and the
`ui/*` primitives.

### 1.3 Inline-style density (terminal = "style everything by hand")

`style={{` object count per core file — the design is expressed as literal inline
objects, **none referencing a token**:

| File | `style={{` count |
|------|------------------|
| analysis-content.tsx | 73 |
| matchup-card.tsx | 46 |
| page.tsx (Today) | 30 |
| nav-bar.tsx | 18 |
| fatigue-bar.tsx | 2 |

[Verified inline_counts.txt]

### 1.4 `termCard` surface literal is copy-pasted **7 times**

Identical `{ background:#fff, border:1px solid #E2DFD8, borderRadius:4, padding:16 }`:
`analysis-content.tsx:31`, `upcoming-content.tsx:15`, `shot-quality-content.tsx:14`,
`playoffs-content.tsx:20`, `analysis-lazy.tsx:6`, `playoffs-lazy.tsx:6`,
`shot-quality-lazy.tsx:6`. [Verified termcard.txt]

---

## 2. The current terminal system — map (scope A)

### 2.1 Color — declared tokens vs. actually-applied values

`globals.css :root` declares one palette; components apply a **different, hardcoded**
one. Distinct-hex frequency across `src/components` + `src/app` (Read-verified):

| Hex | Uses | Role in terminal UI | In `globals.css` token? |
|-----|-----:|---------------------|--------------------------|
| `#8A8478` | 98 | muted / label text ("terminal gray") | **No** |
| `#E2DFD8` | 62 | hairline border / divider | **No** |
| `#F0EEE9` | 61 | subtle surface, hover, skeleton fill, table head | **No** |
| `#0f172a` | 47 | primary body text | = `--foreground` (but hardcoded, not referenced) |
| `#C9082A` | 42 | red: danger / high-conf / LIVE / away-adv | = `--destructive`/`--chart-2` (hardcoded) |
| `#17408B` | 40 | blue: primary / med-conf / home-adv / bars | = `--primary`/`--chart-1` (hardcoded) |
| `#ffffff`(+`#fff` 8) | 44 | card surface | = `--card` (hardcoded) |
| `#C4853C` | 8 | hardwood accent (neutral left-border) | = `--accent` (same value) |
| `#F7F6F3` | 7 | page background / zebra row | = body bg (globals.css:165, hardcoded twice over) |
| `#C9C5BC` | 6 | faint gray (`@` separators, RA midline) | **No** |
| `#22c55e` | 3 | ticker "up" green | **No** |
| `#17A34A` | 3 | WON / penalty-"N" green | **No** |
| `#888888`/`#888` | 4 | neutral fatigue-bar gray | **No** |
| `#4A4A4A` | 2 | nav / tab inactive-link text | **No** |
| `#ef4444` | 1 | ticker "down" red | **No** |
| `#EFEAE0`,`#C0BAAE`,`#A8A296`,`#FCFBF9` | 1 each | shot-quality court hexbin palette (self-contained) | **No** |

[Verified hex_counts.txt + oneoffs.txt]

**Semantic-color fragmentation** (multiple hexes for one meaning):

- **Positive/green:** `#17A34A` (WON, penalty-N) vs `#22c55e` (ticker up) vs `#10b981`
  (`--chart-4`). Three greens. [Verified matchup-card:424, nav-bar:34, globals.css:94]
- **Negative/red:** `#C9082A` (brand red, everywhere) vs `#ef4444` (ticker down).
  [Verified fatigue-bar:9, nav-bar:35]
- **Neutral gray:** `#888888` (fatigue neutral) vs `#8A8478` (muted text) vs `#C9C5BC`
  (faint) vs `#4A4A4A` (inactive). Overlapping roles. [Verified fatigue-bar:11, matchup-card:230/339, nav-bar:99]
- **Near-black text expressed 3 ways:** inline `#0f172a` (×47), Tailwind `text-slate-900`
  (all h1s), token `text-foreground` (body). [Verified page.tsx:57 vs h1_all.txt vs layout.tsx:45]

### 2.2 Typography

- **Fonts:** `Inter` → `--font-inter` (sans), `Outfit` → `--font-outfit` (headings),
  loaded in `layout.tsx:6-18`. [Verified]
- **Mono is defined twice, inconsistently:** `@theme --font-mono` = `ui-monospace,
  SFMono…` (globals.css:12) **but** the `.mono` class every component actually uses =
  `'Courier New', Courier, monospace` (globals.css:174). The whole terminal UI rides on
  `.mono` = Courier New. [Verified globals.css:12, 174]
- **Heading rule:** `h1,h2,h3` → Outfit + `font-bold tracking-tight` (globals.css:157-162).
- **h1 size is inconsistent:** `text-2xl` on Today / Analysis / Playoffs / Shot-Quality,
  but **`text-4xl` on Upcoming**. [Verified h1_all.txt: upcoming/page.tsx:18 vs 4 others]
- **No type scale:** font sizes are raw inline numbers — `9, 10, 11, 12, 14, 18, 20, 36`
  px scattered across files. [Verified e.g. page.tsx:54/57/192, matchup-card:307, analysis-content:794]
- **Letter-spacing** is ad hoc: `0.04 / 0.05 / 0.06 / 0.08 / 0.12 em`. [Verified across files]

### 2.3 Radius

- **Terminal actual:** `4` (cards/buttons/inputs), `2` (badges/logos/pills), `1`
  (bars). Flat, near-square. [Verified matchup-card:612/98/236, fatigue-bar:30]
- **Declared but unused:** `globals.css:42-48` defines a full `--radius` scale
  (base `0.75rem` = 12px, sm…4xl). Only the dormant shadcn primitives use it
  (`rounded-xl`, `rounded-4xl`). **The terminal ignores it entirely.** [Verified globals.css:42-48, 97; card.tsx:15; badge.tsx:8]

### 2.4 Spacing / borders / layout — the well-established patterns (**PRESERVE**)

These are consistent and define the aesthetic — they are the keep-list, not the
tear-down list:

- **Surface:** `termCard` — white / `1px solid #E2DFD8` / radius 4 / padding 16. [Verified analysis-content:31]
- **State via left accent border (2px):** red `#C9082A` = high-conf/error, blue
  `#17408B` = med/insight, hardwood `#C4853C` = neutral. [Verified matchup-card:610, page.tsx:152, analysis-content:663/856]
- **Page header:** eyebrow (`.mono` 10px `0.08em` red-700) + `text-2xl` h1 +
  `.mono` 11px gray subhead. [Verified page.tsx:418-424, analysis-content:693-700, playoffs/page:13-23, shot-quality/page:12-23]
- **StatCard:** `#F0EEE9` bg, 10px label + 20px tabular-nums value. [Verified page.tsx:48-61, analysis-content:93-110]
- **SectionDivider:** label — 1px hairline — count/descriptor. [Verified page.tsx:87-97, analysis-content:78-89]
- **Terminal table:** `thStyle` (`#F0EEE9` head, 10px `0.08em`), zebra rows `#F7F6F3`,
  hover `#F0EEE9`. [Verified analysis-content:58-74/500/514, upcoming-content:22-38/211]
- **Container:** `max-w-7xl` + `px-4 sm:px-6 py-8` (layout.tsx:49) on every page. [Verified]
- **Badges:** solid fill (`#17408B`/`#C9082A`) + white text, radius 2. [Verified matchup-card:103-121]

---

## 3. Hardcoded-value → token-promotion candidates (scope B)

Everything in §2.1's "No" rows plus the token-shadowing hexes are promotion candidates.
Highest-leverage (by frequency): `#8A8478` (98), `#E2DFD8` (62), `#F0EEE9` (61),
`#0f172a` (47), `#C9082A` (42), `#17408B` (40), white (44). Draft names in §7.

- **rgba inventory** (Read-verified rgba_all.txt): navy-ticker text `rgba(255,255,255,0.4|0.85)`
  (nav-bar:36/123/142), selected date-chip subtext `rgba(255,255,255,0.7)` (page.tsx:195),
  chart cursor `rgba(23,64,139,0.06)` (analysis-content:228/750), plus the glass holdout in §4.
- **Footer** hardcodes a *fourth* set of grays: `#F0EEE9` bg, `#E2DFD8` border,
  `#8A8478` text, `10px`, `0.04em`. [Verified layout.tsx:55-69]
- **Hardcoded season/state strings** (CLAUDE.md warns against hardcoded derived season
  labels): `SEASON_LABEL="2025-26 SEASON"` + `HAS_LIVE_GAMES=false` + a fully **fake
  ticker** (`TICKER_ITEMS` BOS 2.4…) in nav-bar (nav-bar:15-26); `season="2025-26"` in
  upcoming-content:104; `"2025–26 Season"` (en-dash) in upcoming/page:16. Two different
  renderings of the same season label. [Verified]

---

## 4. Glassmorphism-migration delta (scope C)

**Premise correction (trust the code):** the prompt names `upcoming-content.tsx` and
`explore-game-detail-modal.tsx` as "still glassmorphism." **Both are already fully
terminal** — white/`#E2DFD8`/radius-4/`.mono`, no blur, no `rounded-3xl`, no translucent
surface. [Verified upcoming-content:15-38, explore-game-detail-modal:23-27/285-289]

A whole-repo scan for glass markers (`backdrop-blur`, `rounded-2xl/3xl`, `bg-white/NN`,
"glass") returns **exactly one hit**:

**`upcoming-lazy.tsx:9-23` — the Upcoming page's loading skeleton is still Liquid Glass.**
[Verified glass.txt + upcoming-lazy.tsx:11-20]

| Property | Glass (now) | Terminal (target) |
|----------|-------------|-------------------|
| radius | `rounded-3xl` (line 11) | `borderRadius: 4` |
| border | `border-white/50` (line 11) | `1px solid #E2DFD8` |
| surface | `background: rgba(255,255,255,0.6)` (13) | solid `#ffffff` |
| blur | `backdropFilter: blur(16px)` (14) | none |
| skeleton fill | `bg-slate-200/80` + `rounded-lg/xl` (17,20) | `bg-[#F0EEE9]` + radius 4 |
| padding | `p-6` (11) | `padding: 16` |

Effect: `/upcoming` flashes a frosted card on first paint, then swaps to the flat
terminal table. (The other lazy loaders — analysis/playoffs/shot-quality — already use
`termCard`+`#F0EEE9` skeletons. [Verified analysis-lazy.tsx:6-27])

**Second, softer remnant — the Upcoming page *header* is legacy (not glass, not
terminal):** lucide `Calendar` icon + `text-base font-semibold text-[#17408B]` eyebrow +
`text-4xl` h1 + `text-lg text-slate-500` subhead + outer `gap-8`. Every other page uses
the mono-eyebrow/`text-2xl`/mono-subhead/`gap-4` terminal header. [Verified upcoming/page.tsx:11-24 vs playoffs/page.tsx:10-24]

---

## 5. UX-states inventory (scope D)

| Surface | Loading | Empty | Error | Notes |
|---------|---------|-------|-------|-------|
| Today (page.tsx) | `SkeletonList` (5 rows) + dates skeleton | `EmptyState` "NO GAMES SCHEDULED" + "NO GAMES IN THIS MONTH" | `ErrorState` + dates `role="alert"` | Most complete. [Verified page.tsx:101-160, 493-525, 564-569] |
| Analysis (content) | `AnalysisSkeleton` + table skeleton | "NO SEASON-LEVEL DATA YET", "NO GAMES MATCH…" | error card + table error cell | Complete. [Verified analysis-content:268-289, 197-199, 482-493, 659-672] |
| Upcoming (content) | 8 skeletons | offseason vs "NO SCHEDULED GAMES…" (two empties) | error card | Content complete; **lazy loader = glass** (§4). [Verified upcoming-content:160-188] |
| Modal | **plain "LOADING…" text** | (n/a) | error text | Loading is text, not skeleton — off-pattern. [Verified explore-game-detail-modal:327-336] |
| Playoffs / Shot-Quality (content) | present | present | present | [Inferred] states exist (grep: 15 / 17 state markers); not deep-audited. |

**Inconsistency:** loading is expressed **three ways** — `Skeleton` components (most),
plain `"LOADING…"` text (modal + pagination "LOADING…"), and a **glass** skeleton
(upcoming-lazy). [Verified explore-game-detail-modal:328, analysis-content:576, upcoming-lazy:9]

---

## 6. Accessibility & responsive (scopes E, G)

### 6.1 Already good (record + preserve)

- `fatigue-bar` → `role="progressbar"` + `aria-valuenow/min/max`. [Verified fatigue-bar:31-34]
- `matchup-card` clickable card → `role="button"`, `tabIndex=0`, `aria-expanded`,
  `aria-label`, Enter/Space handler, `focus-visible:ring-2`. [Verified matchup-card:616-625, 593-601]
- Analysis table rows → `role="button"`, `tabIndex`, Enter/Space, `aria-label`,
  `focus-visible:bg`. [Verified analysis-content:502-515]
- All `<select>` have `aria-label`; DateChip `aria-label`+`aria-current`; month buttons
  `aria-pressed`; nav `aria-label="Main navigation"`. [Verified analysis-content:401/411/420/429, page.tsx:181-182/476, nav-bar:86]
- Modal → `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `Escape` closes,
  backdrop is a labelled `<button>`. [Verified explore-game-detail-modal:277-280, 253-259, 271-276]

### 6.2 Gaps

- **Modal has no focus management:** no autofocus on open, **no focus trap**, no focus
  restoration to trigger on close. Tab escapes to the page behind. [Verified modal_focus.txt — only `focus-visible` + SWR `revalidateOnFocus`, no trap/autoFocus]
- **Modal title node goes empty** when `canGoBack` (`{canGoBack ? "" : "Game details"}`),
  so `aria-labelledby` points at an empty element mid-drilldown. [Verified explore-game-detail-modal:307-313]
- **Color-only meaning — fatigue bar:** tone red=higher / blue=lower / grey=neutral has
  no `aria-valuetext` or label; meaning is only recoverable from the adjacent numeric
  text, not the bar. [Verified fatigue-bar:8-12, 24-42]
- **Ticker:** up/down uses `▲`/`▼` **glyphs** (shape redundancy — OK) but has no
  screen-reader text, and presents **fake hardcoded data** as if live. [Verified nav-bar:33-37, 15-22]
- **No `prefers-reduced-motion`** anywhere → `marquee` (40s infinite), `fadeInUp`,
  `scoreFlash` run unconditionally. [Verified rrm.txt: 0 refs; globals.css:113-140]
- **Contrast [Unknown]** (needs a tool/eye): `#8A8478` on `#ffffff` and on `#F0EEE9`;
  `rgba(255,255,255,0.4)` "TICKER"/"—" on `#17408B` navy; 9–10px Courier mono legibility.

### 6.3 Responsive

- **Consistent:** `max-w-7xl` container (layout.tsx:49); tables wrapped in
  `overflow-x-auto` with `hidden sm:table-cell` columns (analysis-content:460/466,
  upcoming-content:190/196); month tabs in an `overflow-x-auto` scroller (page.tsx:467);
  date chips `flex-wrap`; stat rows `grid-cols-2 md:grid-cols-3|4`. [Verified]
- **Mobile-crush risk — matchup-card main row:** a single non-wrapping horizontal flex
  of away `w-[110px]` + bars `flex-1` + home `w-[110px]` + RA panel `w-[180px] sm:w-[200px]`,
  `gap-4` — ~400px+ of fixed width with **no stacking breakpoint**. Likely cramped/overflow
  on narrow phones. [Inferred matchup-card:638-673; actual break point = [Unknown]]
- **h1 `text-4xl`** on Upcoming is heavier on mobile than the `text-2xl` norm. [Verified upcoming/page.tsx:18]

---

## 7. Known cosmetic bugs (scope F)

- **Analysis h1 duplicate — ALREADY FIXED.** Exactly one `<h1>` renders
  (`analysis-content.tsx:696`); the server wrapper has no heading and a comment
  documenting the intent. [Verified analysis/page.tsx:8-12, h1_all.txt]
- **`--background` token is dead:** `--background:#f8f9fc` (globals.css:59) never applies
  because `html,body{background:#F7F6F3}` overrides it (globals.css:165). Token/actual
  mismatch. [Verified]
- **Stale theme comment:** globals.css:51-53 still says "Liquid Glass … frosted." [Verified]
- **`scoreFlash` end-state** applies a large glass drop-shadow
  (`0 8px 32px rgba(23,64,139,0.08)…`, globals.css:138) inconsistent with the flat cards
  (transient, cosmetic). [Verified]
- **Dead code:** `Card`, `Badge`, `Tabs`, `Separator` unused (§1.1).
- Season-label + fake-ticker hardcodes (§3).

---

## 8. Prioritized weakness list (severity — one-line rationale · NO fixes)

| # | Sev | Weakness | Evidence |
|---|-----|----------|----------|
| 1 | **High** | Design tokens exist only in `globals.css` for a *dead* theme; the live terminal palette (`#8A8478/#E2DFD8/#F0EEE9/…`) is 100% hardcoded across ~169 inline style objects — no single source of truth. | §1.3, §2.1 |
| 2 | **High** | Semantic colors fork: 3 greens, 2 reds, 4 grays, near-black text 3 ways → drift risk on any change. | §2.1 |
| 3 | **High** | `upcoming-lazy.tsx` glass skeleton is the last glassmorphism holdout — visible flash on `/upcoming`. | §4 |
| 4 | **Med** | Upcoming page header is legacy (icon + `text-4xl` + `text-lg slate-500`), breaking the terminal header pattern used by 4 other pages. | §4 |
| 5 | **Med** | Modal lacks focus trap / autofocus / focus restore, and empties its own `aria-labelledby` target mid-drilldown. | §6.2 |
| 6 | **Med** | No `prefers-reduced-motion`; infinite marquee + entrance/flash animations always on. | §6.2 |
| 7 | **Med** | Mono defined twice (`ui-monospace` token vs `.mono`=Courier New); no type scale; ad-hoc px sizes + letter-spacings. | §2.2 |
| 8 | **Med** | `termCard` literal duplicated 7×; loading expressed 3 inconsistent ways. | §1.4, §5 |
| 9 | **Low** | Declared `--radius` scale (12px base) unused; terminal hardcodes 1/2/4px. | §2.3 |
| 10 | **Low** | Fatigue-bar tone is color-only (meaning recoverable only from adjacent numbers). | §6.2 |
| 11 | **Low** | Fake ticker + hardcoded `SEASON_LABEL`/`HAS_LIVE_GAMES`; two season-label renderings. | §3, §6.2 |
| 12 | **Low** | Dead shadcn primitives (Card/Badge/Tabs/Separator) + stale "Liquid Glass" comment + dead `--background`. | §1.1, §7 |
| 13 | **Low** | matchup-card main row has no mobile stacking breakpoint. | §6.3 |

---

## 9. DESIGN.md token draft — **candidates only (senior decides names/values)**

> These are extracted-from-code *starting points* for the token system, not decisions.
> Final naming, exact values, contrast targets, type scale, and motion policy are a
> design-direction call and must be confirmed by senior (Chat). See Escalate below.

**Color (map the live terminal palette → semantic vars):**
```
--term-bg:        #F7F6F3   /* page background / zebra (already the body bg)     */
--term-surface:   #FFFFFF   /* card / termCard                                    */
--term-surface-2: #F0EEE9   /* stat cards, hover, table head, skeleton fill       */
--term-border:    #E2DFD8   /* hairline border / divider                          */
--term-hairline:  #C9C5BC   /* faint separators (@, RA midline)                   */
--term-text:      #0f172a   /* primary text (reconcile with --foreground)         */
--term-text-muted:#8A8478   /* labels / mono meta (contrast [Unknown] — verify)   */
--term-text-dim:  #4A4A4A   /* inactive nav/tab text                              */
--term-red:       #C9082A   /* danger / high-conf / live / away-adv (= brand)     */
--term-blue:      #17408B   /* primary / med-conf / home-adv / bars               */
--term-hardwood:  #C4853C   /* neutral accent left-border                         */
--term-pos:       ??        /* pick ONE green — reconcile #17A34A/#22c55e/#10b981 */
--term-neg:       ??        /* pick ONE down-red — reconcile #C9082A/#ef4444      */
--term-neutral:   ??        /* pick ONE neutral gray — #888888 vs #8A8478         */
```
**Radius:** `--term-radius: 4px` (card/button), `--term-radius-sm: 2px` (badge/logo),
`--term-radius-bar: 1px`. (Retire or realign the unused 12px `--radius` scale.)

**Typography:** unify mono to a single definition; introduce a small scale
(`--term-fs-eyebrow:10 / -label:10 / -body:11 / -value:20 / -hero:36`) and a fixed
letter-spacing set (`0.04 / 0.08 / 0.12em`); standardize h1 to one size.

**Motion:** define durations/easings as tokens and gate all keyframes behind
`@media (prefers-reduced-motion: reduce)`.

**Also fold in as shared primitives (not colors):** a single `termCard` (kill the 7
copies), one terminal skeleton, one terminal page-header, one terminal empty/error block.

---

## 10. Open [Unknown]s — need Michael's browser/eye

1. Contrast ratios: `#8A8478` on white and on `#F0EEE9`; `rgba(255,255,255,0.4)` on
   `#17408B` navy; 9–10px Courier legibility. (§6.2)
2. matchup-card main row on a real ≤375px phone — does it crush/overflow? (§6.3)
3. Whether the `text-4xl` Upcoming h1 and the glass loader flash are noticeable enough
   to prioritize. (§4)
4. Do playoffs/shot-quality states render acceptably (skeleton→content transitions)?
   [Inferred present; not visually confirmed]. (§5)

---

*Read-only audit. No source/config/git changes. Only artifact: this file.*
