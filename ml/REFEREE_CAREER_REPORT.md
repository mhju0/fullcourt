# Unequal careers — what the pre-registered measurements returned

Run 2026-08-24 by `ml/referee_career_windows.py` against
`ml/referee_career_preregistration.md` (committed before any figure ran). Raw output:
`ml/data/referee/career_window_results.json`.

## M0 — the replication gate failed first, and the failure was the most valuable result

The first run read the flat corpus tables and could not reproduce the published JSON: 62 of 74
officials off on game count, 66.7% of cells in tolerance. Reconciling (as the pre-registration
requires, before any windowed number was looked at) found **a real defect in the published
pipeline**, not in the replication:

- **ESPN lists the same official twice in one game's officials array in 228 payloads** —
  overwhelmingly Gediminas Petraitis, duplicated at the same `order`. `fetch_officials.ts`
  credited every entry, so the page's #1 row by G carried **721 games for 604 real
  appearances**, with those games double-weighted in his means and his z-scores inflated ~9% —
  his TECHNICAL cell bolded at z = 2.1 and stops bolding at the corrected 1.6.
- The same loop credited the **order-4 standby** listed in ~72 regular-season games — an
  official the extractor's own rule (`official_1..3`) excludes because they did not work the
  game.
- Separately, the corpus tables span 12,398 filtered games against the pipeline's DB-matched
  11,952 — a population gap that would have masqueraded as drift had the measurement mixed
  sources.

The fix: `parseSummary` now takes the working crew — sorted by `order`, deduplicated, first
three — matching the file's own documented contract ("every game credits all three") and the
extractor's rule. Both artifacts were regenerated (`referee-foul-style.json`,
`referee-whistle.json`, 2026-08-24); 859 unit tests stayed green, and the one prose figure
derived from this table ("the widest technical-foul gap is +26%") survives — it belongs to
Jacyn Goble / David Guthrie, not to the corrected row. The measurement then reran against the
pipeline's own intermediate (`officials-games.json`): **M0 passed 444/444 cells, zero
game-count mismatches.**

## M1 — spans (ships regardless)

Per-official first/last season extracted. **Caveat that must reach the UI: 57 of 74 published
officials are left-censored at 2015-16, the corpus's own first season** — the span says "since,
in this data", never "hired in". The 17 later starters are the genuine newcomers the column
exists to flag.

## M2 — the drift test crossed its declared bar: officials' styles do change

Among the 52 officials with ≥ 350 games, recent-200 vs earlier two-sample z: **37 of 312 cells
beyond |zΔ| ≥ 2 = 11.9%**, against ~4.6% from chance (≈ 14 cells) — above the pre-declared 10%
bar. Careers are not stationary; the career table averages over real change.

Descriptives (no decisions hang on them): 119 career-bolded type cells become 83 at the equal
window (the mechanical shrink the pre-registration predicted), and **32 of 74 officials change
leading trait** between career and window. Largest drifts, each named beside the chance count
above: Josh Tiven (fouls/game, zΔ −3.8 — from +0.2 above baseline to −1.7 below), Pat Fraher
(fouls/game +3.6), Nick Buchert (offensive −3.2), Marc Davis (offensive +3.1), James Williams
(fouls/game −3.0). A whistle-volume drift of ~2 fouls a game is large — the league's whistle
itself moved over this decade, but the deviations are season-baselined, so these are moves
against each season's own norm.

**Per the pre-registration, the equal-window table is presented to Michael for adoption**
(career G stays visible). The drift result says the window answers "what is this official like
now" with genuinely different content, at the declared cost: every z shrinks ~√(n/200), so the
table bolds less overall while bolding *fairly*.

## M3 — the per-season split passed both bars, against expectation

Declared expectation was near-blanket power failure. Measured: **245 of 2,070
(official-season, column) cells beyond |z| ≥ 2 = 11.8%** (bar: ≥ 10%), and mean within-official
sign agreement across seasons **75.2%** (bar: > 70%). Both passed, so the split is **not
refused** by the pre-registered rule. The honest gloss: officials' season-level styles are more
persistent and larger than the power arithmetic assumed — the arithmetic priced the *bolding
bar* (d ≥ 0.248 at n = 65), and roughly one cell in eight clears even that. Whether a
per-season surface is worth its UI weight (74 officials × up to 11 seasons × 6 columns) is a
design question the rule does not answer; it goes to Michael with these numbers.

## Decisions

| # | Decision | Evidence | Owner |
|---|---|---|---|
| 1 | Span column ships (M1) | presentation only, censoring caveat in the guide | done with this change |
| 2 | Adopt the equal-window table | drift real: 11.9% vs 4.6% chance; 32/74 leading traits change | Michael |
| 3 | Give seasons a surface (sparkline/split) | 11.8% of season cells clear the veteran-grade bar; 75.2% sign agreement | Michael |
