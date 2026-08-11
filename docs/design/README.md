# Design direction mocks

Four visual-direction studies of the Games data page, produced 2026-08-09 during a UI
re-evaluation. Each file in [`mocks/`](mocks/) is a fully self-contained HTML document —
fonts are embedded as data URIs, there are no external requests — so it opens directly in a
browser from a fresh clone.

All four render the **same content** (the real IA: nav, stat tiles, day controls, three
matchup cards, an 8-game slate table, the backtest record) so the styles compare honestly.
Every mock obeys the domain rules from the live product: the threshold chart's zero line is
the **59.9% venue baseline** and says so (never a 50% line), evidence sentences keep rate
and baseline in one sentence, confidence tiers never ride on color alone, minus signs are
U+2212, team colors are chrome and never data. Data palettes passed a six-check
colorblind/contrast validation (worst-pair CVD ΔE and normal-vision floors; results noted
below). Slate scores and per-game RA values on the fictional 2026-01-16 slate are invented
for the mock; every backtest figure (61.2% / 65.3% / 57.6%, the threshold lifts, the n's)
is real.

These four were round two of the exploration — light-only, professional, data-forward —
after a first round of five wider-ranging directions (arena-dark "Jumbotron", newspaper
"Paper Trail", consumer "Bento Court", neo-brutalist "Full Press", dark-glass "Glass
Court") was reviewed and narrowed.

| # | Direction | One line | Type | Data poles (fatigued / rested) | Accent |
|---|-----------|----------|------|-------------------------------|--------|
| 06 | [Daylight Jumbotron](mocks/06-daylight-jumbotron.html) | Broadcast graphics package at noon: ink-reversed section bars, Anton scoreboard numerals, LED fatigue segments, one amber signal | Anton · IBM Plex Mono | `#DC2626` / `#2563EB` (current brand tokens, validated as-is) | `#C2410C` amber |
| 07 | [The Data Desk](mocks/07-data-desk.html) | Data-journalism grade: Oxford-ruled modules, Fraunces display over mono figures, one crimson spot color | Fraunces · Newsreader · IBM Plex Mono | `#C8102E` / `#1D4ED8` | crimson doubles as spot |
| 08 | [Front Office](mocks/08-front-office.html) | The daylight pro instrument: one continuous 11-game table as the page's spine, indigo spent one moment at a time | Geist · Geist Mono | `#E11D48` rose / `#0891B2` teal | `#4F46E5` indigo |
| 09 | [Stat Sheet](mocks/09-stat-sheet.html) | Swiss-modern data poster: chrome is ink, **color is data** — monochrome structure, oversized numerals | Instrument Sans · JetBrains Mono | `#DC2626` / `#2563EB` | none (ink) |

**Status: direction 08 · Front Office was selected** (2026-08-09) and **is fully applied** —
tokens, Geist type, the indigo accent, the rose/teal data poles, and the Games slate rebuilt as
one continuous table. Two follow-on passes on 2026-08-11 finished the job: the two-rail
alignment law, and one `DataTable` module that now draws every table on the site. The other
three directions are kept as the record of what was considered and why; 06 is the closest
fallback (it is a pure token-level restyle — it validated with the brand's existing hexes
unchanged).

These are static pitches, not implementation specs: exact hexes, spacing, and structure in
the app go through the normal token system (`globals.css` `--term-*`) and review, and the
mocks' fictional slate content never ships.
