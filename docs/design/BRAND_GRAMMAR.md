# Brand grammar

The single source for FullCourt's brand and visual direction. It holds two things: the
**grammar** — the premise, name, mark, color, type and voice rules, each pointing at the
mechanism that enforces it — and the **direction record** — what was considered on
2026-08-09, what was chosen, and why the rest lost. This file absorbed
`docs/design/README.md` on 2026-08-19; the four mock files it described are unchanged in
[`mocks/`](mocks/).

Boundaries, so this file does not sprawl: [FRONTEND.md](../FRONTEND.md) is the
*implementation law* (rails, tokens, page rhythm, the table module);
[UIUX_CHECKLIST.md](../UIUX_CHECKLIST.md) is the *living ledger* of adopted/open/refused
conventions; [ADDING_A_SURFACE.md](../ADDING_A_SURFACE.md) is the *contract* a new page
signs. This file says **why the identity is what it is** and holds the rules that live in
prose rather than tests.

"FullCourt" is the product; "rest advantage" is a metric. The two vocabularies never trade
places — see the hard ban in `CLAUDE.md` and the glossary's `_Avoid_` lines.

## 1. The premise

The category default for sports analytics is a dark UI, neon accents, and a headline win
rate with no denominator. FullCourt's founding refusals are the brand:

- every rate carries its sample size;
- every claim carries its baseline;
- the nulls are published (the win-total null, the fitted-weights null, the pre-registered
  referee axes in [ADR 0007](../adr/0007-referee-analysis-axes-are-pre-registered.md));
- limits ship beside results.

Even the palette argues: the category goes dark, FullCourt is **daylight, light-only** —
with one deliberately dark surface, the front door (`/`), where the story is told.

The thesis sentence, and the best line the brand owns, is the front door's hero:

> **Every game starts uneven. The schedule decided that months ago.**

Everything else answers to it.

## 2. The name

**FULLCOURT** — one word, no space, set in Geist caps. The lockup is **W4** (2026-08-19):
one weight, the halves separated by color — COURT takes the accent — one rule for the nav
and the OG card, which had each been half-doing it differently (dimmed split vs. amber
split). Running prose still writes "FullCourt"; wordmark and prose are different jobs.

**The lockup is optically kerned (2026-08-24).** Measured in Geist 700 with the font's own
kerns applied, the inter-letter ink area spread 2.7:1, and the widest gap was L·C — exactly
the color seam, so the compound read as two words touching. The ratified per-pair preset
(spread → 2.1:1, width −1.5%) lives in `src/lib/brand/wordmark-kern.ts`, the one table all
three renderers consume; its test pins the values. Changing a kern is a brand decision,
Michael's. The exploration record is the 2026-08-22 kerning bench artifact.

**The lockup is plain on purpose — the Second Key was shipped and withdrawn (2026-08-22/23).**
A one-point treatment rendered the second U — the away key of the full court the word's two
U's draw — hollow (PR #51), and Michael reversed it the next day in favour of the full-color
lockup (PR #52): the hidden-code reading was liked, the hole in the word was not. This
paragraph exists so the idea is not "restored" from the surviving exploration artifacts or
memory by a later pass — same rule as the `/referees` ban inversion: shipping and unshipping a
brand move are both deliberate acts, never a tidying side effect. If the idea ever returns it
returns through Michael, with the PR #51 implementation (geometry module, ghost fallback,
per-surface pins) as the reference.

- **FULL — the sample.** The whole record: every season since 1985-86, both arms of every
  split, the nulls included. "Full" is a claim about honesty of sample — nothing
  cherry-picked, nothing pooled to flatter a headline. The rested-visitor row is published,
  not dropped.
- **COURT — the floor, and the trial.** Double reading, both kept. The *floor*: home court
  is the confound the model refuses to take credit for. The *court*: where claims are
  tried — against a baseline, on the record, with the evidence attached.
- **FULL-COURT — the idiom.** A full-court press covers both ends of the floor. So does the
  model: the called side and the declined side, the win rate and the venue baseline, the
  finding and its limit. Nothing is measured on half the floor.

## 3. The baseline rule

FullCourt has **no brand number** — deliberately. The venue baseline is a confound to be
subtracted, not a mascot; branding it would do to our own number what the premise
criticizes in others. What the brand owns is the **rule**:

> A rate never appears without its baseline, and the baseline's value is never typed —
> it derives from the database, per season, and renders live.

In practice: no chart zeroes at 50%; prose says "the venue baseline" or "roughly six of
ten," never a precise figure that would age; each season is read against its *own*
baseline, because home court has moved across four decades.

## 4. The mark

**"Split Ink"** (ratified 2026-08-19, superseding the 2026-07 "Angled Divider" — blue/red
halves with an amber circle): the court from above, one half filled in the ground's ink,
one a translucent panel of the same ink, and the indigo slash between them — "every game
starts uneven" as figure/ground. The full exploration that replaced the old mark (palette
compare, three system studies, six lockups, six colors, four finishes) is archived in
[explorations/2026-08-19-mark/](explorations/2026-08-19-mark/).

Construction — source of truth `src/lib/brand/court-mark-geometry.ts`, drift pinned by
`court-mark-geometry.test.ts` (the old mark's seven hand copies drifted twice):

- **Grid** 60×32, integer endpoints — within 0.3% of the NBA floor's 94:50.
- **Slash**: a parallelogram leaning 12-across / 32-down (≈20.6° from vertical), centroid
  pinned to the court's center (30,16) so the two panels are equal-area. Its ends are cut
  flush by the court's own top and bottom edges.
- **Finish** — P-D "keyline material": a concentric hairline (the ground's ink at 30–35%,
  2-unit gap, radius = court rx + 2) around top-lit panels, the slash graded down its own
  length in C1 indigo. **The keyline drops below 24px** — the favicon is pure material.
  P-A flat ink is the one-color reproduction fallback (print, engraving), not a second
  identity. Satori-rendered cuts (apple, maskable) flatten the gradients to their
  midpoints; that concession is documented in their files and is not drift.
- **Size ramp**: hero/nav slash 6 · tile 6.5 · favicon 8 with rx 6 and deeper tones.
- **Meaning**: the slant *is* the rest advantage — a level line would mean an even game.
  Static cuts keep the ratified tilt; a product surface may flex the angle by a live
  differential (adopted 2026-08-19; no surface uses it yet).

## 5. Color

Stated fully in [FRONTEND.md](../FRONTEND.md); the brand-level grammar is three sentences:

- **Color is data; chrome is ink.** Rose `#E11D48` is the fatigued pole, teal `#0891B2`
  the rested pole — CVD-validated as a pair. Team colors are chrome and never data.
- **Indigo `#4F46E5` is the accent, spent one moment at a time** per page.
- **The app is light-only** ("Broadcast" → "Front Office"). The front door is the one dark
  surface, scoped to itself. This has been relitigated once already; read
  [FRONTEND.md](../FRONTEND.md) before reopening it.

## 6. Type

One family: **Geist**, with **Geist Mono** for figures, labels and anything tabular.
Hierarchy separates by weight and size, never by face — the deliberate retirement of the
three-family stack (Inter, Space Grotesk, IBM Plex Mono) is part of the 2026-08-09 record
below. The four enforced type scales live in [FRONTEND.md](../FRONTEND.md).

## 7. Voice

The unusual asset: most of the voice is **enforced by the test suite**. The laws, each with
its mechanism —

| Law | Enforced by |
|-----|-------------|
| A rate never appears without its baseline; no 50% zero lines | derived claims + tests on `/analysis` (PR #21); `venueBaseline` in `AnalysisResponse` |
| Every number shows its sample size | matchup cards + Upcoming Edges (closeout #4) |
| Limits publish with results; nulls ship | ADRs 0006/0007; the pre-registration pattern |
| Counts that cannot derive are phrased to never age ("every season since 1985-86", never "41 seasons") | copy convention + [SEASON_ROLLOVER.md §7](../SEASON_ROLLOVER.md) |
| Signed numbers use U+2212, bare zero, units at the call site | `signedNumber()` (`src/lib/signed-number.ts`) |
| Confidence never rides on color alone | mock-era rule carried into product tokens |
| Failure states go through `MessageCard` | `src/components/ui/message-card.tsx` |
| The metric is never renamed while touching brand | hard ban, `CLAUDE.md` |
| **One grammar for prose surfaces** (OG, README, front door, social) | **this file** — the surfaces tests don't reach |

## 8. The lines

- **Hero thesis** (front door only): *Every game starts uneven. The schedule decided that
  months ago.*
- **Operating line** (OG card and the front-door outro, nowhere else — one moment, like the
  accent): *Read against the baseline.* On the OG card and the front-door outro since
  2026-08-19 — both homes are live; do not add a third.

The OG descriptor ("NBA analytics: rest, fatigue, and shot value") remains the functional
alt text; the operating line is the brand's sign-off, not a replacement for saying what the
product is.

## 9. Direction record (2026-08-09)

Four visual-direction studies of the Games data page, produced during a UI re-evaluation.
Each file in [`mocks/`](mocks/) is a fully self-contained HTML document — fonts embedded as
data URIs, no external requests — so it opens directly in a browser from a fresh clone.

All four render the **same content** (the real IA: nav, stat tiles, day controls, three
matchup cards, an 8-game slate table, the backtest record) so the styles compare honestly.
Every mock obeys the domain rules from the live product: the threshold chart's zero line is
the **venue baseline** and says so (never a 50% line), evidence sentences keep rate and
baseline in one sentence, confidence tiers never ride on color alone, minus signs are
U+2212, team colors are chrome and never data. Data palettes passed a six-check
colorblind/contrast validation (worst-pair CVD ΔE and normal-vision floors). Slate scores
and per-game RA values on the fictional 2026-01-16 slate are invented for the mock; every
backtest figure in the mocks was real as of the date of the record.

These four were round two of the exploration — light-only, professional, data-forward —
after a first round of five wider-ranging directions (arena-dark "Jumbotron", newspaper
"Paper Trail", consumer "Bento Court", neo-brutalist "Full Press", dark-glass "Glass
Court") was reviewed and narrowed.

| # | Direction | One line | Type | Data poles (fatigued / rested) | Accent |
|---|-----------|----------|------|-------------------------------|--------|
| 06 | [Daylight Jumbotron](mocks/06-daylight-jumbotron.html) | Broadcast graphics package at noon: ink-reversed section bars, Anton scoreboard numerals, LED fatigue segments, one amber signal | Anton · IBM Plex Mono | `#DC2626` / `#2563EB` (brand tokens of the day, validated as-is) | `#C2410C` amber |
| 07 | [The Data Desk](mocks/07-data-desk.html) | Data-journalism grade: Oxford-ruled modules, Fraunces display over mono figures, one crimson spot color | Fraunces · Newsreader · IBM Plex Mono | `#C8102E` / `#1D4ED8` | crimson doubles as spot |
| 08 | [Front Office](mocks/08-front-office.html) | The daylight pro instrument: one continuous 11-game table as the page's spine, indigo spent one moment at a time | Geist · Geist Mono | `#E11D48` rose / `#0891B2` teal | `#4F46E5` indigo |
| 09 | [Stat Sheet](mocks/09-stat-sheet.html) | Swiss-modern data poster: chrome is ink, **color is data** — monochrome structure, oversized numerals | Instrument Sans · JetBrains Mono | `#DC2626` / `#2563EB` | none (ink) |

**Status: direction 08 · Front Office was selected** (2026-08-09) and **is fully applied** —
tokens, Geist type, the indigo accent, the rose/teal data poles, and the Games slate rebuilt
as one continuous table. Two follow-on passes on 2026-08-11 finished the job: the two-rail
alignment law, and one `DataTable` module that now draws every table on the site. The other
three directions are kept as the record of what was considered and why; 06 is the closest
fallback (it is a pure token-level restyle — it validated with the brand's then-current
hexes unchanged). A generated brand kit and a product-wide dark restyle were each considered
earlier (2026-07-28) and **declined**; those decisions hold, and this file articulates the
chosen identity rather than replacing it.

The mocks are static pitches, not implementation specs: exact hexes, spacing, and structure
in the app go through the normal token system (`globals.css` `--term-*`) and review, and the
mocks' fictional slate content never ships.

## 10. Direction record — the mark round (2026-08-19)

The Angled Divider was audited against the Front Office grammar and found speaking a
retired palette (blue/red halves, amber circle, plus a hue split between the nav and icon
cuts that had drifted apart undocumented). An exploration round followed — a recolor
compare (keep vs. restyle to the poles), three quiet-mark system studies (S1 chrome court,
**S2 split ink — chosen**, S3 pole meridian), six lockup treatments (**W4 chosen**), six
colors (**C1 indigo chosen**; NBA blue and red were considered and refused — the blue
flirts with league affiliation and dies at slash weight on light ground, the red collides
with the fatigued pole), and four finishes (**P-D keyline material chosen**, P-A kept as
the one-color fallback). All four study pages are archived in
[explorations/2026-08-19-mark/](explorations/2026-08-19-mark/); the implementation is one
geometry source, `src/lib/brand/court-mark-geometry.ts`.
