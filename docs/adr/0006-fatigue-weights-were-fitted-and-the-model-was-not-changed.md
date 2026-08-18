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
same day and are shipped. 2 was investigated and closed the other way: travel stays.**

1. ~~**Altitude is under-weighted and back-to-backs are diffuse.**~~ *Shipped — see the
   amendment.* These are the two real effects, worth ~5pp each. Altitude currently enters as a
   ×1.15 multiplier on a base that is usually small, so it moves a typical score by ~0.3 points;
   the fit says it deserves to be one of the two largest terms.
2. ~~**The score is dominated by a component that predicts nothing.** Travel is 45% of the mean
   score and carries no signal.~~ **CLOSED 2026-08-02 — travel stays, and the premise was
   wrong.** "Carries no signal" was inferred from a fitted weight of zero and a +0.32pp ablation,
   neither of which measures what the term contributes. Measured directly: travel is the only
   reason 5,994 games get called at all, those games win 59.14%, and removing it costs 404
   correct calls above a coin flip — more than any other term in the model. It lowers the
   published *average* precisely because it widens the model's reach into slightly harder games.
   That is a term earning its place, not a passenger. See the amendment above.
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
get called, and that is what the replacement measures.

**Every term finds winners, and the win-rate movement is a misleading way to rank them.** A term
that finds extra winners at a rate below the model's own 61.17% average lowers the published
percentage while raising the number of games won. Ranked by correct calls above a coin flip
surrendered when the term is removed:

| term | games only it finds | those games win | headline if removed | calls given up |
|---|---:|---:|---:|---:|
| Travel | 5,994 | 59.14% | **+0.32pp** | **404** |
| Recent workload | 3,437 | 63.37% | −0.68pp | 336 |
| Back-to-back | 1,743 | 63.57% | −0.31pp | 210 |
| Road segment | 2,784 | 58.94% | +0.24pp | 209 |
| Altitude | 616 | 62.34% | −0.03pp | 71 |
| Schedule density | 707 | 60.54% | −0.08pp | 41 |
| Overtime | 148 | 64.86% | −0.07pp | 20 |
| Freshness | 148 | 60.14% | +0.02pp | −10 |

**This corrects a reading recorded here earlier.** The +0.32pp row was first written up as a
third route to "travel carries no signal". It is not. Travel is the widest net in the model —
5,994 calls, more than twice any other term — and contributes more correct calls than any other
single term. Deleting it would raise the headline by a third of a point while giving up 5,994
winning predictions and 404 wins above a coin flip. The fit result above still stands and is
narrower than it was made to sound: travel adds little *independent* information once workload
and road segment are known, because those terms partly restate each other. Little independent
signal is not no value.

Freshness is the only term that gives back more than it brings, by ten calls out of 3,061.

The suspension of the no-fitting rule ends here. `fatigue.ts` coefficients remain hand-set and
ratified; this ADR is the record that fitting them was tried, under a protocol built to make the
answer trustworthy, and that the answer was "the weights are not the problem".

## Addendum — 2026-08-06: the away-pick evidence was re-measured, and two of its sentences do not survive

Everything above stands as the record of what was decided on 2026-08-02 and why. This addendum
corrects the *evidence* the away-pick section rests on. The decision it produced is unchanged;
two of the sentences justifying it are not.

**The table above is the 2002-03-onward slice, not the published population.** That was correct
for this ADR — the fit floor is 2002 (ADR 0003) — but the site publishes from 1985-86, and the
figures were quoted onward into the method page, the README, the roadmap and a code docblock as
though they were the site's. Re-measured over the published population by
`scripts/measure_uncalled_half.ts`, generated into `ml/rest_split_facts.json` and pinned by
`src/lib/__tests__/rest-split-facts.test.ts`:

| rested road team | n | won |
|---|---|---|
| any gap | 11,548 | 42.4% |
| gap ≥ 3 | 2,056 | 43.6% |
| gap ≥ 5 | 342 | 46.2% |
| gap ≥ 6 | 108 | 50.0% |
| gap ≥ 7 | 26 | 61.5% |

**"Rest alone never outweighs home court at any magnitude the NBA generates" is retired.** It is
an absolute resting on a pooled 41-season rate, and the rate has drifted: a rested road team won
42.4% across all seasons, 47.6% across the last ten, and 49.3% across the last five.

Home-court advantage fell league-wide over the same period, and that turns out to be most of the
movement rather than a caveat to it. Each era's own road baseline rose 40.1% → 43.8% → 44.7%, so
the *lift* — the part attributable to rest — went +2.3 → +3.8 → +4.6. It has grown, but by far
less than the raw rate, and reading the raw rate alone would have credited rest with a league-wide
shift in home court. These figures are published on the method page's era table, and generated
into `ml/rest_split_facts.json` alongside everything else.

*(An earlier draft of this addendum said 47.7% for the last ten. It is 47.6% — 1,470 of 3,085 is
47.6499, which rounds down. Corrected 2026-08-07.)*

**"No threshold rescues it" is also retired**, for a simpler reason: it is false as written. The
row reaches even at a gap of 6 and clears it at 7. Both rungs are tiny, and the honest reading is
the schedule running out of examples rather than a signal switching on — but the sentence claimed
something the data does not say, and the ladder it was written from stopped at 5.

**What still holds, and is the actual load-bearing argument.** Folding home court into the score
and letting the combined number pick covers 96.5% of games at 59.7% — *below* the 59.9% you get
by backing the home team in every one of the 47,143. Adding a constant to both sides creates no
information. (The 58.39%/776 figures above are the 2002-03 slice; the full-population equivalents
are 59.7% and 752.) The rule survives; only its justification needed re-basing.

**Related, and larger than this ADR:** the same re-measurement established that every rate the
site published was stated against a coin flip while every game in it was a home game. `/analysis`
moved to a venue baseline on 2026-08-06. That is a presentation decision rather than a model one,
so it is not an amendment here — but it is the reason this correction was found.

## Addendum — 2026-08-18: the circadian question was asked narrowly, and answered no

Michael asked whether crossing 3+ time zones costs anything, on the reasoning that athletes peak
in the evening and a long flight moves the body clock away from that. Two things above already
bore on it — jet lag (weight 0.001, cv 3.24) and body-clock tip time (pinned at 0; the
unconstrained fit wanted −0.015) — but both were measured as **main effects across all games**.
The narrower claim was untested: that the cost concentrates where the traveller has no time to
re-entrain, a long **eastward** shift arriving on **short rest**.

Pre-registered in `ml/timezone_preregistration.md` before any figure was seen, including the
prior expectation (null) and the three conditions a finding had to clear. Run by
`ml/timezone_test.py`; report at `ml/data/timezone_report.txt`. Same protocol, same folds:
walk-forward, 16 blind seasons, 19,118 held-out games, sign-clamped, strength control in.

Direction was not separable from the exported columns before this: `zones_crossed` is
`Math.abs(shift)` and `jetlag_units` folds the east/west multiplier together with the
re-entrainment fraction. A signed `zone_shift_hours` was added to `FatigueFeatures` and to the
exporter. It is reported, never scored — every score is unchanged, and the exporter still
reproduces all 100,990 stored rows exactly.

**The pre-registered hypothesis fails all three conditions.**

| condition | result |
|---|---|
| held-out log loss improves | **no** — the four candidates together are worth **−0.00003** |
| sign stable across folds | **no** for the primary term: `d_east3_short` is pinned at 0 in **16 of 16** folds |
| east beats west | **no, and reversed** — see below |

| term | mean weight | cv | folds non-zero | added alone |
|---|---:|---:|---:|---:|
| `d_east3_short` *(primary)* | 0.0000 | — | 0/16 | −0.00000 |
| `d_west3_short` | 0.0997 | 0.40 | 16/16 | −0.00002 |
| `d_east3` | 0.0069 | 1.77 | 6/16 | −0.00002 |
| `d_west3` | 0.0435 | 0.65 | 14/16 | +0.00003 |

For scale: every fatigue factor in this model combined is worth +0.00245, and team strength alone
+0.060. The best of these is +0.00003.

**Two results here would have been read wrongly without measuring them, and both were.**

*The raw split looks like a real and sizeable asymmetry.* Home teams win 54.41% against a visitor
who flew 3+ hours east (n = 1,643) and 61.96% against one who flew 3+ hours west (n = 1,635),
either side of a 58.39% era baseline. Read cold that is a 7.5-point swing in the direction
opposite to the circadian literature — travelling *east* would be helping. It is geography and
quality. A ≥3h westward trip is an Eastern team visiting the Pacific coast and a ≥3h eastward trip
is the reverse, and the mean strength edge to the home side flips sign with the direction:
**−0.0281 in the eastward cell, +0.0218 in the westward one, −0.0021 where no long shift
happened.** The win rate follows the strength, and once `d_strength` is in the model the
asymmetry stops paying.

*`d_west3_short` holds a stable non-zero weight in 16 of 16 folds and is still worth nothing.*
That combination is the exact reading this ADR had to correct itself for once already. Measured
rather than inferred: **86.4% of those games are back-to-backs**, and `d_is_b2b` is already in
the baseline. The term is largely restating something the model has.

**Altitude is not the confound, though it looked like the obvious one.** Denver and Utah sit in
Mountain time, a 2-hour shift from Eastern, so the ≥3h threshold excludes them: overlap between
every candidate term and `d_alt_visit` is **0.0%**.

`fatigue.ts` is unchanged. `TIME_ZONE_DISPLACEMENT_BONUS`, `TIME_ZONE_EASTWARD_MULTIPLIER` and
`TIME_ZONE_WESTWARD_MULTIPLIER` keep their ratified values — this measured no reason to move
them, and it is worth saying plainly that it also produced **no evidence the shipped 1.25/0.85
asymmetry is right**. It found no directional effect to be asymmetric about.

What would change the answer is not a better cut of this data. It is knowing who actually
travelled and how — arrival times, chartered legs, whether the team flew in the night before —
none of which is in any source this project can reach. The ceiling this ADR describes still
stands: **new information, not new mathematics.**

## Related

- `docs/adr/0003-fatigue-inputs-limited-to-espn-era.md` — why the fit floor is 2002.
- `docs/adr/0004-season-exclusions-belong-to-modules-not-ingest.md` — the per-module season rule.
- `docs/audit/travel-model-accuracy.md` — §4's open ablation question, now answered.
