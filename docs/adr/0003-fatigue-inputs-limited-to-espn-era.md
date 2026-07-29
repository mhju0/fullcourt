# Fatigue terms apply where their data exists, not uniformly across 40 seasons

Status: accepted (2026-07-30)

The fatigue model spans 1985-86 to the present, but three of its inputs — overtime periods,
tip-off times, and neutral-site venues — come from ESPN, whose NBA coverage begins around 2002
and whose `neutralSite` flag is only set from 2013. Two options were on the table: restrict the
model to the era where every term has data, or apply each term where its data exists and say so.

We apply where the data exists. Restricting to 2002+ would discard 17 seasons of games to gain
uniformity in three secondary terms, and the terms it would buy are small next to decay load and
travel. The cost is real and stated plainly below rather than buried.

## What this means concretely

A pre-2002 game is scored by the same formula, with these inputs absent:

- **Overtime periods read 0.** Not "no overtime happened" — unknown, defaulting to 0. Roughly 6%
  of games in any era go to overtime, so about 1,200 pre-2002 games are missing a +0.5 or +1.0
  they would earn today.
- **Tip-off times are null**, so the back-to-back multiplier falls back to exactly its ratified
  1.38 rather than being sharpened by real turnaround hours. This is the graceful case: the
  fallback is precisely the value the model used everywhere before turnaround existed.
- **Neutral sites are unmarked.** Mexico City games from 1997 and the 2011-12 London games are
  scored at the listed home team's arena, which understates travel for the teams involved.

Every other term — decay load, travel, road segment, time-zone displacement, schedule stress,
freshness, altitude, blowout discount — is fully available across all 40 seasons. Time zones in
particular are resolved geographically rather than from a data feed, so relocated-era coordinates
(Seattle, Vancouver, Katrina-era New Orleans) work identically in 1995 and 2025.

## The honesty cost

The model is quietly a slightly different model before and after 2002. Two consequences follow,
and neither should be papered over:

1. **Cross-era score comparisons are weaker than they look.** A 1994 score and a 2024 score are
   not built from the same information. The site already declines to rank across eras in the
   Schedule Disparity module for a related reason.
2. **The 40-season backtest mixes both regimes.** Its headline number is a blend. Because the
   missing terms are secondary and their absence is unbiased with respect to who wins, this
   dilutes the measured edge rather than inflating it — the error direction is conservative, but
   it is an error.

## Alternatives rejected

**Restrict everything to 2002+.** Cleanest statistically, but throws away 17 seasons to make
three small terms uniform.

**Gate the new terms behind an explicit era flag.** Reproducible and deliberate, but it only
renames the discontinuity; the scores still differ across eras, with more code.

**Backfill pre-2002 from another source.** basketball-reference is reachable and carries overtime
results, so the overtime gap specifically is closable later. Tip-off times and neutral-site flags
for the 1980s and 90s are not reliably available anywhere public. If someone closes the overtime
gap, this ADR should be amended rather than replaced.

## Related

- `scripts/fetch_game_context.ts` — the ingest, and the source of the 2002 and 2013 boundaries.
- `drizzle/0011_games_tip_off_neutral_site.sql` — the columns, with the same gaps recorded.
- `docs/audit/travel-model-accuracy.md` — the earlier audit that first flagged neutral sites.
