# The fatigue weights were fitted out-of-sample, and the model was left alone

Status: accepted (2026-08-02)

The standing rule is that `src/lib/fatigue.ts` holds ratified coefficients, hand-set before the
backtest ran, and that tuning them against it would make the result circular. That rule was
deliberately suspended for this exercise under a protocol designed to remove the circularity:
walk-forward fitting on 2002-03 onward, every season from 2010-11 graded blind, a home-court
intercept in every model so the weights measure rest net of venue, and a team-strength control
so they cannot quietly absorb team quality.

**The model is unchanged.** Nothing in `fatigue.ts` moved, no schema migration was written and
no recompute was run. This ADR records why, because the evidence is worth more than the
non-change it produced, and because `docs/audit/` is gitignored.

## What was measured

19,118 held-out games across 16 blind seasons. All figures are pooled and weighted by held-out
games. Log loss, lower is better.

| model | log loss | vs the layer above |
|---|---|---|
| home court only | 0.68333 | — |
| + the shipped rest-advantage score | 0.68227 | +0.00106 |
| + fitted fatigue factors | 0.68109 | +0.00224 |
| team strength + schedule position, no fatigue at all | 0.62328 | — |
| + fitted fatigue factors | 0.62083 | **+0.00245** |

The second block is the honest one. Once you know who is at home and how good the two teams
are, **every fatigue factor in this model put together is worth +0.00245 log loss.** Team
strength alone is worth +0.060 — roughly **twenty-five times** as much.

A fitted model does beat the shipped one, by +0.00119 log loss (+0.00215 on 2016+). It is real
and it is negligible, which is the same verdict the 2026-07-30 recompute reached by a different
route.

## Which factors survive

Fitted under a sign clamp, since a factor that tires a team cannot physically make it play
better. Weights are log-odds per unit, averaged across folds, with the strength control in.

| factor | weight | stability | verdict |
|---|---|---|---|
| back-to-back | **0.208** | cv 0.06, same sign 16/16 | real, ≈5.0pp of win probability |
| visiting altitude | **0.241** | cv 0.10, same sign 16/16 | real, ≈5.8pp |
| prior-game overtime | 0.084 | cv 0.22, same sign 16/16 | real, ≈2.0pp |
| schedule density | 0.032 | cv 0.12, same sign 16/16 | real but small, ≈0.8pp per point |
| back-to-back turnaround hours | 0.026 | cv 1.09 | unstable |
| workload (games, minutes or possessions) | 0.008 | cv 1.41, same sign 11/16 | **nothing** |
| home-stand recovery | 0.002 | cv 2.16 | nothing |
| jet lag | 0.001 | cv 3.24 | nothing |
| altitude carryover | 0.003 | wanted to go backwards | nothing |
| travel (7-day) | **0.000** | pinned by the clamp; wanted −0.040 | nothing |
| road-segment load | **0.000** | pinned; wanted −0.014 | nothing |
| rest recovery (days off) | **0.000** | pinned; wanted −0.235 | nothing |
| body-clock tip time | **0.000** | pinned; wanted −0.015 | nothing |

Refitting with only the four survivors gives log loss **0.62069** — *better* than the
thirteen-term model at 0.62083. The nine terms it drops are worth **−0.00014** between them.
They are not merely inert; they are very slightly harmful.

Three of those results deserve to be said plainly:

- **Travel earns nothing.** It is the largest single component of the published score by mean
  (1.928, against decay load's 1.472), and out-of-sample it is worth zero — the unconstrained
  fit wanted it negative in 15 of 16 folds. The open question in
  `docs/audit/travel-model-accuracy.md` §4, unanswered since 2026-07-28, now has an answer.
- **Extra rest does not help, and may hurt.** The unconstrained weight on rest recovery is
  −0.235, the same sign in all 16 folds. This is the rust-vs-rest effect, and the Playoff
  Predictor found it independently — `entry_rest_diff` was dropped from that model on
  2026-07-31 for the same reason.
- **Workload is not the missing ingredient.** Per-game minutes and possessions were joined from
  the hoopR cache specifically to close the "counts games, not work" gap. Given a free choice
  the folds preferred a minutes- or possession-based load over game counts (12 of 16), and the
  weight on it is still indistinguishable from zero.

## Why nothing shipped

Decided in advance, before any number was seen: the structural rebuild ships if not worse, the
fitted weights ship only if better, and a failure gets published rather than buried.

- **Fitted weights: better, but by +0.00119 log loss.** That does not justify a schema
  migration, a rewrite of every published figure, and a four-hour production recompute that
  leaves the site without fatigue data while it runs.
- **The additive rebuild: not worse, and not better either.** Its headline justification was
  that the 0 floor made the model unable to distinguish 4 days' rest from 14. Measured against
  all 94,462 rows, the floor binds on 2.18% of them and only really bites past 7 days' rest,
  which is 0.6% of games. The defect is real and minor.
- **The asymmetric away bar: works, and is degenerate.** The shipped rule picks the visitor
  4,872 times at **46.0%** — worse than a coin flip, on 32% of its calls. Requiring the visitor
  to out-rest home court fixes it by declining *every* away pick: 0 of 15,731. The cure
  confirms the diagnosis and deletes the feature.

## Would a more complex formula find more? No — measured, not assumed

The conclusion above came from a linear model, so using it to dismiss non-linear formulas would
be circular. `ml/ceiling_test.py` asks the question the other way round, on the same 16 blind
seasons: give a gradient-boosted model every feature at once and let it discover any curve and
any interaction it likes.

| model | log loss | vs controls only |
|---|---|---|
| controls only, no fatigue | 0.62328 | — |
| **controls + the 4 survivors** | **0.62069** | **+0.00259** |
| controls + all 20 fatigue features | 0.62125 | +0.00203 |
| controls + survivors + hand-built interactions | 0.62109 | +0.00219 |
| gradient boosting, all 22 features | 0.62425 | **−0.00096** |
| gradient boosting, fatigue features only | 0.68230 | −0.05902 |

**The simplest model wins.** Four linear terms beat twenty. They beat the physically obvious
interactions (a back-to-back that also involved a flight, a back-to-back into altitude). And
they beat a gradient-boosted model which, given everything, ends up *worse than not modelling
fatigue at all* — it finds structure in the training seasons that does not survive to the next
one.

A win/loss outcome also discards most of what a game tells you, so the same factors were
regressed on **point margin**, where the error bars are far tighter. Against a margin standard
deviation of 13.78 points:

| factor | points of margin | t | reading |
|---|---|---|---|
| back-to-back | 1.50 | 7.52 | real |
| visiting altitude | 1.49 | 4.96 | real |
| rest recovery | 2.23 | 2.41 | real, and **backwards** |
| prior-game overtime | 0.47 | 2.39 | real |
| travel (7 / 14 / 30 day) | 0.22 / −0.22 / −0.51 | 0.94 / −0.79 / −1.96 | zero |
| workload (games / minutes / possessions) | 0.51 / 1.19 / −0.57 | 0.46 / 1.29 / −0.73 | zero |
| jet lag | 0.39 | 1.83 | zero |
| road segment, 3-in-4, 4-in-6, body clock, density | ≤0.15 | ≤1.20 | zero |

The more powerful test agrees with the weaker one, and sharpens the rust-vs-rest result: extra
rest is worth **−2.2 points**, at t = 2.41.

So the limit is the information in the data, not the shape of the equation. Three real effects,
each worth about a point and a half of margin, inside a 13.78-point standard deviation. Any
future proposal to make the formula more sophisticated should be measured against this table
first — the harness runs in seconds.

The way to raise this ceiling is new information, not new mathematics. The largest missing input
is **who is actually playing**: a rested star sitting out is worth more than every schedule term
here combined, and nothing in this pipeline knows about it. A second, cheaper one: `games`
already carries `home_moneyline` / `away_moneyline` columns that no tracked script populates,
and a market line is a far better team-strength proxy than the rolling win percentage used as a
control here.

## Amendment, 2026-08-02: two of the three were acted on

Ratified the same day this ADR was written. The title still holds for what it claimed — the
*weights* were not adopted and the model was not rewritten — but two items below moved from
"left on the table" to shipped, so recording them here rather than leaving the ADR describing a
state that no longer exists.

**Altitude was raised, 1.15 → 1.29.** The absolute scale of a fatigue score is arbitrary, so the
defensible question is the ratio between terms. Altitude sat at 0.405 of a back-to-back in the
model and measures at 0.772 of one on margin — it was charging half what it should. Matching the
measured ratio inside the existing multiplier shape gives an excess of `0.772 × 0.38 = 0.293`.
This is a *descriptive* correction, not a predictive one: it barely moves accuracy, and it is
consistent with declining the fitted weights above, because the reason for declining those was
that they bought no predictive gain worth a rewrite. A term charging half its measured size is
a different complaint.

Two things were deliberately not done alongside it. The multiplier *shape* is still wrong — thin
air costs a busy team more than a rested one, where the effect measures flat — and fixing that
means the additive rewrite this ADR declined. And `ALTITUDE_CARRYOVER_MULTIPLIER` stays at 1.06
even though it was derived as half the old excess, because it measures at 0.003 points and the
unconstrained fit wanted it negative. Symmetry with how it was originally derived is not
evidence.

**The away-pick rule was changed.** The shipped rule predicted the lower-fatigue team whichever
side that was, and its road-team picks ran at 44.39% across 7,224 calls. Checking whether any
threshold rescued them:

| away rest edge | n | away wins |
|---|---|---|
| RA ≤ −1 | 5,270 | 44.23% |
| RA ≤ −3 | 1,214 | 46.05% |
| RA ≤ −5 | 171 | 50.29% |
| RA ≤ −6 | 49 | 51.02% |

It reaches a coin flip only at edges the schedule barely produces. **Rest alone never outweighs
home court at any magnitude the NBA generates**, which is a finding rather than a defect, and the
model now declines instead of making the call. Adding home court to the rule and letting it
decide was measured too and rejected: it covers 96.5% of games at 58.39% while still making 776
losing road calls, which makes "only claim an edge where one exists" hollow.

## What this leaves on the table, for a human decision

Each changes a ratified constant, which is Michael's call. Written before the amendment above,
and left in the words the fit produced them in — that is the record. **1 and 3 were ratified the
same day and are shipped; only 2 is still open.**

1. ~~**Altitude is under-weighted and back-to-backs are diffuse.**~~ *Shipped — see the
   amendment.* These are the two real effects, worth ~5pp each. Altitude currently enters as a
   ×1.15 multiplier on a base that is usually small, so it moves a typical score by ~0.3 points;
   the fit says it deserves to be one of the two largest terms.
2. **The score is dominated by a component that predicts nothing.** Travel is 45% of the mean
   score and carries no signal. **Still open.** Removing it is a larger claim than it sounds,
   because it is most of what the published number *is*; the term is physically real and
   correctly computed, which is a different claim from being useful.
3. ~~**The away-pick hole is live in production.**~~ *Shipped — see the amendment.* Whatever is
   done about the model, the shipped prediction rule is wrong on 54% of its 4,872 away calls.

## The harness is kept

`scripts/export_fatigue_features.ts` and `ml/prepare_fatigue_dataset.py` /
`ml/fit_fatigue_weights.py` remain. The exporter reproduces all 100,990 stored scores exactly,
so it is a faithful stand-in for the shipped model, and it turns a four-hour database pass into
a few seconds. Any future question of this kind should be answered with it rather than by
recomputing the database.

`ml/ablate_fatigue_terms.py` was added 2026-08-02 on the same footing. It rebuilds each score
from its exported components — `(decay + travel + road) × b2b × altitude × density + freshness +
overtime`, the assembly in `fatigue.ts` — so a term can be neutralised without touching the
model, then re-derives the call under the shipped rule. Its self-check is that the untouched
reconstruction reproduces production exactly: 27,400 games called at 61.17%.

It also records why the *previous* ablation table had to be thrown away rather than refreshed.
Holding the sample fixed measures a term only while the rule can pick either side. Now that a
called game is always a home pick, every ablated model makes the identical pick on a fixed
sample, so all eight terms would score exactly zero. What the terms do now is select which games
get called, and that is what the replacement measures. Recent workload (−0.68pp) and
back-to-backs (−0.31pp) are still the only two that cost the headline anything; travel (+0.32pp)
and road segment (+0.24pp) land above zero, though both also cut thousands of calls, and calling
fewer games can lift a rate on its own — so this is a third route to "travel carries no signal",
not evidence that travel is harmful.

The suspension of the no-fitting rule ends here. `fatigue.ts` coefficients remain hand-set and
ratified; this ADR is the record that fitting them was tried, under a protocol built to make the
answer trustworthy, and that the answer was "the weights are not the problem".

## Related

- `docs/adr/0003-fatigue-inputs-limited-to-espn-era.md` — why the fit floor is 2002.
- `docs/adr/0004-season-exclusions-belong-to-modules-not-ingest.md` — the per-module season rule.
- `docs/audit/travel-model-accuracy.md` — §4's open ablation question, now answered.
