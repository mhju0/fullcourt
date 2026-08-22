# Pre-registration — do officials treat individual players differently?

Written **before any player-level figure was computed**, on 2026-08-21, at Michael's request to
open the axis [ADR 0007](../docs/adr/0007-referee-analysis-axes-are-pre-registered.md) deferred.

ADR 0007 named player-level effects as **axis D** and deliberately refused to run them as one more
column of a sweep: *"It gets its own decision, with its own pre-registration, or it does not
happen."* This file is that pre-registration. The decision to open it is Michael's, taken
2026-08-21. Nothing here may be revised after results are seen; a revision is a new file.

The pre-registered axes A and C were run first and are reported in `ml/REFEREE_AXES_REPORT.md`.

## Why this axis is the most dangerous one in the module

Everything the module has published so far is a statement about a **crew's game**: how many fouls,
of which kinds, in which quarter. This axis attaches a claim to a **named player and a named
official at once**, which is the shape of an accusation. Three hazards, all of them structural:

1. **The grid is enormous.** 126 officials x 1,548 players is a six-figure space. At |z| >= 2 one
   test in twenty clears the bar from noise, so a sweep *will* return a list of names, and every
   name on it will be writeable.
2. **The famous cases were found by looking.** "Chris Paul never wins with Scott Foster" entered
   public circulation because somebody scanned outcomes and found the most extreme pair. Re-running
   that scan and re-finding it is not evidence — it is the same search returning the same answer.
   The only honest test of a claim discovered in-sample is one run **out-of-sample**.
3. **Three officials work every game and the play stream never records which one blew the
   whistle.** Every per-official figure is therefore roughly a third of the effect it names, and no
   figure here can be attributed to an individual's judgment even when it is real.

## Population

Regular-season games from the cached ESPN corpus, `ml/data/officials/`, flattened by
`ml/extract_referee_corpus.py`: **12,813 games** with three named officials, a play stream and a
box score, seasons **2015-16 through 2025-26**.

**There are no playoff games in the corpus** — `scripts/fetch_officials.ts` fetched the regular
season only. This is a stated limit of every result below, and it bites hardest on the Scott
Foster claim, which is chiefly a *playoff* legend. What is testable here is the regular-season
version of it, and the write-up must say so in those words rather than implying the legend itself
was tested.

The 2019-20 restart (from 2020-07-30, no crowd, neutral floor) is excluded from any statistic
split by home/away, and kept elsewhere.

## The power arithmetic, fixed in advance

Measured from the corpus structure before any outcome was examined: the **largest number of shared
games any (official, player) pair has in eleven seasons is 55**, nine pairs reach 50, and 2,249
reach 30.

This is decisive and is recorded here so that a null is not later mistaken for an absence of
effort. At 30 shared games, a player's team win total has a standard deviation of about 2.7 wins
around its expectation. A pair must therefore miss its expected record by **more than five and a
half wins** to reach |z| >= 2 on win-loss — and across the ~9,500 pairs with 20+ shared games,
roughly 430 will do so from noise alone. **Win-loss at this sample size cannot distinguish a real
grudge from chance, and the question is not whether the analysis finds extreme pairs — it will —
but whether there are more of them, and wider ones, than the null produces.**

Foul counts are better powered than win-loss because a game yields several of them rather than one
bit, which is why D1 leads and D2 follows.

## The axes, in order

**D1 — official x player foul rate.** For each pair with at least 30 shared games: personal fouls
called on that player per 36 minutes with that official, against the same player's rate with all
other officials in the same seasons. The player is his own control, so a foul-prone player and a
star who never gets called are both on the same scale.

**D2 — official x player team record.** The Scott Foster axis. For each pair with at least 30
shared games: the player's team's actual wins against expected wins, where expectation is the
team's own season-long win rate in the same venue split (home or road). Team quality and home
court are the two things that would otherwise masquerade as an official effect, and this removes
both. Reported with the power arithmetic above attached to every figure.

**D2-OOS — the famous claims, tested out-of-sample.** The only test of a discovered claim that
carries information. The claims below are named **now**, from public circulation, before their
numbers are computed:

  * Scott Foster x Chris Paul
  * Scott Foster x James Harden
  * Tony Brothers x Luka Doncic
  * Tony Brothers x Kevin Durant
  * Marc Davis x Russell Westbrook

Each was in circulation by the end of **2019-20**. The corpus is therefore split at that line:
2015-16 through 2019-20 is the era the claim was formed in and is reported as *in-sample*, and
**2020-21 through 2025-26 is the out-of-sample test**. A claim that holds only in-sample has been
explained rather than confirmed. If a pair's out-of-sample games number fewer than 15 the pair is
reported as **untestable** and no verdict is drawn from it.

**D3 — early foul trouble on stars.** Michael's hypothesis: some officials call quick fouls early
and take a star off the floor. A **star** is a player in his season's **top 30 by points per game
among players with at least 40 games played** — fixed here, computed per season, 96 distinct
players across 330 player-seasons. Per official, over their star-games:

  * the share in which the star is called for **2+ personal fouls in the first quarter**
  * the share in which the star is called for **3+ by halftime**
  * conditional on 2+ in Q1, the star's **minutes played** that game, against his own season mean

Each is additionally split **home vs road**, which is the part of the hypothesis that would make it
a bias claim rather than a style one.

## Protocol

Every axis is tested the same way, and the **global test is the headline in each case**:

1. **Global.** Does the official dimension carry any variance at all? The observed spread of
   per-official (or per-pair) statistics is compared against a permutation null in which each
   official's games are redrawn at random from the same seasons, holding games-per-season fixed so
   that era-level changes in foul rates cannot manufacture a difference. One test, one p-value, no
   multiplicity to correct. **If the global test does not clear p < 0.01, no named figure from that
   axis may be published**, however extreme an individual name looks.
2. **Named extremes**, reported only after the global test, and always printed beside the count
   that noise alone produces at the same bar. A list of names with no expectation attached is
   forbidden.
3. 2,000 permutations, seed fixed in the script.

## What would count as a finding

A global p < 0.01 **and** an effect size stateable in a unit a reader already owns — a foul per
game, a percentage point of minutes, a win over a season. An effect that is real but too small to
state in such a unit is reported as **real and negligible**, not as a finding.

## What is reported regardless

All of it, including every null, in `ml/REFEREE_PLAYER_REPORT.md`. Per ADR 0007's standing rule, a
null ships the page rather than extending the stub — and for this axis specifically, a null is the
**most likely** outcome and a genuinely useful one to publish: the arithmetic above means "nobody
can tell, and here is why" is a defensible thing for the site to say about the most confidently
repeated referee claims in the sport.

## Prior expectation

Recorded so it cannot be revised afterwards. D1 is expected to show a small real spread, since
officials already differ in what they call and players differ in what they draw. D2 and D2-OOS are
expected to be **null**, on the power arithmetic alone. D3 is the one with a plausible mechanism
and adequate sample, and is where a real finding is most likely.

**Publishing anything from this axis remains Michael's explicit decision**, never a side effect of
this file existing.

---

# Amendment — 2026-08-21, written before these three axes were run

Axes A and C landed (`ml/REFEREE_AXES_REPORT.md`), which under ADR 0007 authorises **axis B**.
Michael's brief also asked the module to go past the axes already on the books. Three questions are
added here, and as with everything above, **this text was committed before any of their numbers were
computed**. Each is a belief a basketball audience already holds, which is the point: the module is
worth publishing only if it can check the folklore rather than restate it.

**B — score state.** ADR 0007's deferred axis, now authorised. Per official, the foul tilt toward
the trailing team, and whether officials differ in it. The folk version is "referees keep games
close."

**E — does the home whistle need a crowd?** A natural experiment the corpus contains by accident.
In **2020-21**, 560 games report no attendance at all and 483 report a median crowd of about 3,100
— one season, one rulebook, one set of officials, with and without an audience. The 2019-20 restart
(88 games, neutral floor, no crowd) is the second comparison, against its own season's normal games.
Reported three ways: within 2020-21 (crowd vs none), a dose-response on attendance across all
eleven seasons with season held fixed, and the restart against its own season.

*A stated caution, fixed now:* a missing attendance field is being read as "no crowd", which is an
inference. It is supported by 2019-20, where the 88 missing games are exactly the restart, and by
the fact that missingness is otherwise rare (1,207 of 1,207 present in 2015-16). It is not proof.
The within-2020-21 comparison is reported both with and without the missing-attendance games.

**F — are make-up calls real?** The most repeated belief about officiating: a foul on one team is
followed by a compensating foul on the other. Measured as the share of consecutive foul pairs that
switch teams, against a **within-game permutation null that holds each team's foul total fixed and
shuffles only the order** — which is what separates a real alternation from the mechanical fact
that possession changes hands. Restricted additionally to pairs less than two minutes apart, since
the folk claim is about *quick* compensation. Then per official.

**The gate is unchanged.** Global p < 0.01 before any name is printed, effect sizes in units a
reader owns, and every null reported. Publishing remains Michael's explicit decision.

**Additionally, the D1/D2 gate is re-run properly.** The analytic per-pair null treats pairs as
independent and they are not — one player appears in many pairs. The spread of z across pairs is
therefore re-tested against a **full-grid permutation** that reassigns officials to games and
recomputes every pair, which respects that dependence. The pre-registered p < 0.01 gate applies to
that figure, not to the analytic approximation.

---

# Correction and playoff extension — 2026-08-21, after the first run

Two changes to the population, both recorded here rather than quietly folded into a re-run.

**1. A filter bug, found and fixed.** The first run required exactly three listed officials. ESPN
also lists a **standby fourth** at `order` 4 — on 295 regular-season games, and on 309 of the 919
playoff games, rising to most playoff games by 2025-26. Those games were silently dropped. The
array is always sorted by `order` (checked on a 1,200-payload sample: zero unsorted, zero missing
an order value), so the working crew is the first three entries and the filter is now `>= 3`.
Regular-season population 12,813 → **13,114 games**. Every figure in
`ml/REFEREE_PLAYER_REPORT.md` is the corrected run. The pre-registered questions, thresholds and
protocol are unchanged; this was a data-handling defect, not a change of mind.

**2. The playoffs were added, and the claim list predates them.** The pre-registration above
recorded "there are no playoff games in the corpus" as a stated limit, and named its five claims
under it. Michael asked for the postseason on 2026-08-21, and
`scripts/fetch_playoff_officials.ts` fetched **919 games** (2015-16 … 2025-26, 913 usable) from
scoreboards already on disk. **The five pairs were committed in 91715b8 before that script
existed**, which is the only reason the postseason result carries any evidential weight at all.

One addition to the protocol was required and is stated before its result is read: playoff
expectation is **opponent-aware**, from a win model fitted on all playoff team-games using each
side's regular-season strength and home court. Senior officials draw later rounds against stronger
teams, and the venue-split expectation used for the regular season does not remove that.

The reporting rule is unchanged and matters more here than anywhere else: playoff pairs share a
handful of games, the count that noise alone produces is printed beside every count, and a pair
under the minimum is **untestable**, whatever its record.
