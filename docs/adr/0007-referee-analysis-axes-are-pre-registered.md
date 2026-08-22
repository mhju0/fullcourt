# The referee analysis axes are pre-registered, and a null still ships

Status: accepted (2026-08-06)

`/referees` was built and deliberately unpublished when this ADR was accepted; it went live on
2026-08-22, and the addendum at the foot of this file records what the axes returned. The ingest, `src/data/referee-foul-style.json`
(11,952 games, 684 excluded, 128 officials, 2015-16 → 2025-26, generated 2026-07-31),
`RefereeStyleContent` and its unit tests all exist and work; the page renders an in-progress
`MessageCard` instead, and `e2e/referees.spec.ts` keeps the table block as `describe.skip`.

The stated reason has been that the writing around the table is unfinished. That was true and
incomplete. The actual gate is that one finding — officials differ in the *kinds* of foul they
call — is thinner than the surface deserves, and the intention is to look for more before
publishing anything. This ADR fixes what "look for more" is allowed to mean, **before any of it
runs**, because the value of the constraint is entirely in its coming first.

## Why a pre-registration and not just an analysis

The cached corpus is `ml/data/officials/` — 5.4 GB, 18,359 events, gitignored [verified
2026-08-06]. Every foul play in it carries `type.text`, `team.id`, `participants[].athlete.id`,
`period`, `clock`, `awayScore`/`homeScore`, `wallclock` and a shot `coordinate`. Nothing needs
refetching, so the marginal cost of asking one more question of it is close to zero.

That is exactly the hazard. Six plausible axes across 128 officials is thousands of tests, and at
|z| ≥ 2 roughly one in twenty comes back "significant" from noise alone. A sweep run without a
declared stopping point will always find something, and the something will always be writeable.
This is the same circularity the repo already refuses in `src/lib/fatigue.ts`, where coefficients
are ratified before the backtest runs so the backtest cannot be used to tune them — see
[ADR 0006](0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md). The exposure here
is worse, not better: a spurious fatigue coefficient is a rounding error on a win rate, while a
spurious referee finding is a named person on a public page.

## The axes, in order

**A — foul type × home/away.** Per-official, paired within official: home count minus away count
per game, for each foul type. Repeated on shares as the pace control; if a count effect vanishes
on shares it was pace, and the write-up says so.

The pairing is what makes this worth re-asking. The 2026-07-31 home-tilt test measured **FTA
volume and home win rate** and returned a null — 10 of 60 officials beyond |z| ≥ 2 against ~3
expected. It never split the tilt by foul *type*, and `team.id` is present on 99.9% of foul
plays. An official even on shooting fouls but lopsided on loose-ball would have been invisible to
the test that was run.

**C — timing.** Per-quarter foul rate first, on the full corpus. Only if officials separate there
does the Q4 final-2:00 cut follow. Running the narrow window first would spend the sample to
answer a question the coarse version can rule out for free — a game averages 38.8 fouls across
four quarters and three officials, so a two-minute cut leaves single digits per game.

Margin-gated "clutch" is **excluded by decision, not by oversight**. "Officials differ in what
they call late" is a style claim. "Officials call close games differently" is a fairness claim,
and this surface exists to refuse fairness claims it cannot support.

**B — score state**, using the per-play score. Runs only if A or C lands.

**D — player-level effects are deferred.** `participants[].athlete.id` is present on 99.7% of
foul plays, so "does this official call fewer fouls on stars" is mechanically easy and is the
most interesting question on this list. It is also the most damaging to get wrong, and it is
where the three-officials-per-game dilution hurts most. It gets its own decision, with its own
pre-registration, or it does not happen. It is not smuggled in as one more column of a sweep.

**The list is closed.** An axis that suggests itself *after* seeing output is not added to this
round. It goes in a separate round with its own stated expectation, so that a hypothesis born
from noise cannot be tested on the data that produced it.

## The bar

Unchanged from what the module already uses, deliberately: officials beyond |z| ≥ 2 counted
**against the number chance predicts**, with the season, arena and pace controls.

This is the bar that correctly called home tilt a null at 10-vs-3, and correctly called foul-type
mix real at 32/30/26/25/20/18 officials against 3.7 expected — a 5–9× excess. Substituting a
different multiple-comparison correction now would make the new results incomparable with the
published nulls, which is a worse failure than the one it would fix. The observed-vs-expected
count already prices multiplicity honestly.

Two statements are mandatory in any write-up, because both are true and neither is optional:

1. **A call cannot be attributed to one of the three officials.** Every game credits all three,
   so measured effects are diluted roughly threefold and the true individual spread is *larger*
   than what is reported. Crew instability is what rescues this — partners are effectively
   randomised, so co-official contamination is noise rather than bias.
2. **This is style, not bias.** "Calls more offensive fouls" says nothing about whom it favours.

## The unit of analysis is the individual official

Measured 2026-07-31: 11,981 games produced 10,450 distinct trios, **87.3% of which appear exactly
once**, and the most-repeated trio across ten seasons appears five times. There is no such thing
as a crew in this data. Any crew framing in schema, analysis or copy is wrong.

Crew *chief* is a real NBA role, but ESPN's `order` field only encodes it reliably from 2024-25 —
10/10 against archived ground truth for 2024-25 and 2025-26, 2/4 for 2023-24, failing in 2015-16.
In the two validated seasons there are 56 distinct chiefs at a median of 32 games each, against a
per-official median of 288 games over ten seasons. That is a ~9× sample cut, which would take the
Scott Foster result from z ≈ +7.2 down to roughly z ≈ 1.7. Crew chief can be a label or a
2024-25-onward filter. It cannot be the unit the claims rest on.

## A null still ships the page

Decided before running anything, on the same principle as ADR 0006's "a failure gets published
rather than buried": if A and C both come back inside noise, the page ships saying so.

"Here is the one thing about officials that is real, and here are the things everyone assumes
that are not" is a stronger page than the foul-mix finding alone, and it is the version that
cannot be misread as an accusation. The precedent is `/schedule`'s win-total check — a null
published on purpose, r = −0.016 across 884 team-seasons.

This is not a commitment to publish. Publishing `/referees` remains a deliberate editorial act by
Michael, and a currency pass must still never flip the in-progress label on its own. What this
settles is that "the numbers came back boring" is not by itself a reason to keep the surface
stubbed for another year.

## The analysis code is committed this time

As `scripts/analyze_officials_*.ts`, separate from `scripts/fetch_officials.ts`.

The 2026-07-31 exploratory scripts were throwaway, run from a job temp directory and never
committed, which is why reproducing any of the figures above requires a rebuild recipe carried in
prose. These are offline reductions over files already on disk and fetch nothing, so folding them
into the fetcher would make its name a lie; they sit apart for the same reason
`scripts/analyze_player_shooting.py` sits apart from the fetchers.

## Results, 2026-08-06 — A is a null, C is real and narrow

Run by `scripts/analyze_officials_splits.ts` over 12,403 usable regular-season regulation games,
2015-16 → 2025-26, from 13,209 cached summaries with 0 unreadable. 74 officials clear the
200-game bar, so chance predicts **3.4** past |z| ≥ 2 per column. Foul plays naming neither side
are 0.03% of the total. Everything below is in `ml/data/officials-splits.json`, which is
gitignored — regenerate it rather than cite it.

The sections above were committed before this ran. That is the whole point of them.

**A — foul type × home/away: null.**

| column | counts | shares |
|---|---|---|
| shooting | 6 (1.76×) | 7 (2.06×) |
| personal | 7 (2.06×) | 7 (2.06×) |
| loose ball | 5 (1.47×) | 6 (1.76×) |
| offensive | 6 (1.76×) | 7 (2.06×) |
| technical | 4 (1.18×) | 1 (0.29×) |

Against foul *mix*, which ran 5–9× on the same bar, this is noise with a slight lean. It is also
**weaker than the home-tilt null it was meant to rematch** (10 of 60 ≈ 3.3×). Splitting home tilt
by foul type does not rescue it, and the question is now answered twice by two different measures.

The league means are a useful check that the pipeline agrees with itself: home teams commit
**0.192 fewer shooting fouls** and 0.109 fewer personals per game than visitors, which is the
same home whistle the published +0.62 home FTA/game already describes, reached independently.

**C — timing: real on the quarter, null in the last two minutes.**

| metric | q1 | q2 | q3 | q4 |
|---|---|---|---|---|
| counts | 15 (4.41×) | 16 (4.71×) | 16 (4.71×) | 16 (4.71×) |
| **shares** | **10 (2.94×)** | 2 (0.59×) | 5 (1.47×) | **8 (2.35×)** |

The counts row is not a timing result — it is the published whistle-*volume* finding measured
four times, since an official who calls more fouls is high in every quarter. Shares are the
discriminating version, and they separate at the ends of a game and not in the middle. Note the
shares sum to 100, so Q1 and Q4 are one degree of freedom rather than two: the finding is that
some officials **shift fouls from early to late**, not two independent tendencies. Zach Zarba is
the clearest case at −1.21pp in Q1 (z = −5.2) and +1.18pp in Q4 (z = +4.2) across 635 games — a
near-exact mirror, which is what a single shifted distribution looks like.

**The last two minutes of Q4: null, below chance.** 3 of 74 on counts (0.88×) and 2 of 74 on
shares (0.59×), against 3.4 expected, on a league mean of 0.92 late fouls per game. Zarba, the
standout on the coarse axis, sits at z = +0.2 here. "Officials swallow the whistle at the end" is
the most repeated claim about NBA officiating in this whole area, and in ten seasons of
play-by-play it does not happen — the Q1→Q4 drift is a whole-quarter distribution effect that has
nothing to do with the closing minutes.

**One control named above was not applied to C.** Season and pace were (per-season baselines;
counts repeated as shares). Arena was not. It mattered for foul *mix* because foul type is
scorekeeper-classified and arenas vary, and it is a weaker concern for quarter timing, but it was
named in the pre-registration and is therefore outstanding rather than dismissed.

**No axis was added after seeing this.** Axis B remains unrun and its definition unfixed.

## Related

- [ADR 0006](0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md) — the same guard
  against circularity, aimed at model coefficients rather than at hypothesis selection.
- `docs/GLOSSARY.md` — REFEREE EFFECT, and why the page is not called Referee Bias.
- `src/lib/referee-foul-style.ts` — the |z| ≥ 2 emphasis rule and the 200-game bar, already shipped.

## Addendum, 2026-08-22 — the axes were run, and the page shipped

The remaining axes were run on 2026-08-21 against a corpus rebuilt by
`ml/extract_referee_corpus.py`, and `/referees` was published on 2026-08-22. What this ADR fixed
in advance held: every axis it named was run, every result was published, and the two it declared
gated stayed gated until their gate opened.

- **Axis A (foul type × home/away)** — landed, weakly. Between-official spread is 1.35× the
  permutation null (p < 0.0001) on the total, driven by shooting fouls. **This overturns the
  2026-07-31 null**, and the page's copy was corrected with it: it had asserted "no official tilts
  the whistle home" while rendering `2.06× chance` from its own artifact, held in place by a test
  that only checked the effect was not *large*. Both are now pinned two-sided.
- **Axis C (timing)** — landed on the coarse question and nowhere else. Q1 share separates
  officials (1.24×, p = 0.008) and is uncorrelated with whistle volume (r = +0.01), so it is a
  second dimension of style rather than the first one restated. **The Q4 final-2:00 cut, which
  this ADR gated behind the coarse test, returned a null** (1.05×, p = 0.27) — the gate worked
  exactly as designed, spending the coarse sample first.
- **Axis B (score state)** — authorised by A and C landing, and run. Fouls tilt hard toward
  whoever leads (49.6% at a 1–5 lead → 58.3% at 21+). Published as **basketball, not bias**: a
  trailing team attacks and a leading team protects.
- **Axis D (player-level)** — this ADR refused to run it as one more column of a sweep and
  required its own decision and its own pre-registration. Michael opened it on 2026-08-21 and
  `ml/referee_player_preregistration.md` was written and committed **before any player-level
  figure was computed** — and, as it turned out, before the playoff data that would test it
  existed at all. That ordering is the only reason the postseason result carries any weight.

The rule that "a null still ships the page" was the one that mattered most. Most of what was
asked came back empty — player-level foul rates, player-level win records, star foul trouble,
crowd effects, make-up calls — and the page publishes all of it. The finished surface is built
around the emptiest result of all: the sport's most famous referee grudge is real, is the most
extreme of 689 pairs, and is still not more extreme than the maximum a grid that size produces
from nothing.
