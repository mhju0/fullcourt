# Pre-registration — does a long eastward flight on short rest cost anything?

Written **before any figure from this test was seen**, following the convention ADR 0007 set for
the referee axes and the decide-in-advance rule ADR 0006 used for the weight fit. The result is
published either way.

Date: 2026-08-18. Requested by Michael after the question was raised on 2026-08-18.

## The question, and why it is not already answered

ADR 0006 measured two things in this area and found both to be nothing:

| factor | fitted weight | verdict there |
|---|---|---|
| jet lag | 0.001, cv 3.24 | nothing |
| body-clock tip time | 0.000 — pinned by the clamp; unconstrained fit wanted **−0.015** | nothing |

Both were tested as **main effects across all games**. The narrower claim has not been tested:
that the cost is concentrated where the traveller has no time to re-entrain — a long **eastward**
shift arriving on **short rest**. Eastward matters because advancing the body clock is harder
than delaying it, which is why `fatigue.ts` already ships an asymmetry
(`TIME_ZONE_EASTWARD_MULTIPLIER = 1.25` against `WESTWARD = 0.85`).

ADR 0006 did fit back-to-back × flight and back-to-back × altitude interactions and preferred the
four-term linear model to all of them, so this is *adjacent* to tested. It is not identical, and
the distinction it turns on — direction — was not available: `zones_crossed` is `Math.abs(shift)`
and `jetlag_units` folds direction into the re-entrainment term, so neither column can separate
east from west. A signed column is added to the exporter for this test.

## Population

- Regular season only, `game_type = 'regular'`, the same regime filter every published figure uses.
- **2002-03 onward.** Before that ESPN carries no tip-off time, so a zone shift can be computed
  but the arrival window cannot (ADR 0003).
- Both sides present, which is what `prepare_fatigue_dataset.py` already requires.
- The travelling side is the **away** team by construction: a home team crosses zero zones, so
  the per-game difference term is the away team's value.

## Terms

Positive means "favours the home team", matching every other `d_` column in the model table.

| term | definition |
|---|---|
| `d_east3` | away team's venue is **≥ 3 hours east** of its home arena |
| `d_west3` | away team's venue is **≥ 3 hours west** of its home arena |
| `d_east3_short` | `d_east3` **and** the away team is on ≤ 1 day of rest |
| `d_west3_short` | `d_west3` **and** the away team is on ≤ 1 day of rest |

`d_east3_short` is the **primary** term. The other three are reported so the primary cannot be
read without its controls: if east-on-short-rest matters and west-on-short-rest matters equally,
the finding is about short rest, not about direction.

## Protocol

Identical to ADR 0006's, so the numbers are comparable to the table already published there:

- Walk-forward by season. Train on 2002-03 through the season before, predict the held-out season
  blind, never look ahead. First test season 2010.
- Sign-clamped L2 logistic on raw columns. A factor that tires a team cannot make it play better.
- **The team-strength control is in** (`d_strength`). Without it any schedule term partly proxies
  for who is good, which is the error that made the unconditioned figures look larger.
- Reported against the **four-term baseline** (`d_is_b2b`, `d_alt_visit`, `d_prior_ot`,
  `d_density_points`) — the model ADR 0006 landed on — not against nothing.

## What would count as a finding

Decided now, before the numbers:

1. **Held-out log loss must improve** over the four-term + strength baseline. The improvement is
   reported next to ADR 0006's own scale, where every fatigue factor combined is worth +0.00245
   and team strength alone is worth +0.060.
2. **The sign must be stable** across held-out seasons — the standard ADR 0006 applied when it
   called `turnaround_hours` (cv 1.09) unstable and `jet lag` (cv 3.24) nothing.
3. **`d_east3_short` must beat `d_west3_short`.** If both move together the result is about rest,
   not about direction, and the circadian reading is not supported.

A term that clears all three is a candidate for a `fatigue.ts` change — which is Michael's call
and needs an ADR, per the standing rule. **Nothing ships from this test on its own.**

## What is also reported regardless

The raw descriptive split — win rate by (direction × zones × rest) cell, with denominators —
because a null with n = 40 in the decisive cell is a different statement from a null with
n = 3,000, and the published figure must say which it is.

## Prior expectation

Stated so it can be wrong: **I expect this to come back null.** The scoping split run on
2026-08-18 found 3,025 three-zone road games with a home win rate of 58.15% against 58.39% for
all games in the same era — the travelling team doing marginally *better*, uncontrolled. ADR 0006
found the unconstrained body-clock weight wanted the wrong sign. The reason to run it anyway is
that the narrow cut is genuinely untested and cheap, and a measured null is publishable where an
argued one is not.
