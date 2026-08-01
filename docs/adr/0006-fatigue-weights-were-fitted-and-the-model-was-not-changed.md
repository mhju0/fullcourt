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

## What this leaves on the table, for a human decision

Not acted on here. Each changes a ratified constant, which is Michael's call.

1. **Altitude is under-weighted and back-to-backs are diffuse.** These are the two real effects,
   worth ~5pp each. Altitude currently enters as a ×1.15 multiplier on a base that is usually
   small, so it moves a typical score by ~0.3 points; the fit says it deserves to be one of the
   two largest terms.
2. **The score is dominated by a component that predicts nothing.** Travel is 45% of the mean
   score and carries no signal.
3. **The away-pick hole is live in production.** Whatever is done about the model, the shipped
   prediction rule is wrong on 54% of its 4,872 away calls.

## The harness is kept

`scripts/export_fatigue_features.ts` and `ml/prepare_fatigue_dataset.py` /
`ml/fit_fatigue_weights.py` remain. The exporter reproduces all 100,990 stored scores exactly,
so it is a faithful stand-in for the shipped model, and it turns a four-hour database pass into
a few seconds. Any future question of this kind should be answered with it rather than by
recomputing the database.

The suspension of the no-fitting rule ends here. `fatigue.ts` coefficients remain hand-set and
ratified; this ADR is the record that fitting them was tried, under a protocol built to make the
answer trustworthy, and that the answer was "the weights are not the problem".

## Related

- `docs/adr/0003-fatigue-inputs-limited-to-espn-era.md` — why the fit floor is 2002.
- `docs/adr/0004-season-exclusions-belong-to-modules-not-ingest.md` — the per-module season rule.
- `docs/audit/travel-model-accuracy.md` — §4's open ablation question, now answered.
