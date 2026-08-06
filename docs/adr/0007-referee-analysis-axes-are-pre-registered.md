# The referee analysis axes are pre-registered, and a null still ships

Status: accepted (2026-08-06)

`/referees` is built and deliberately unpublished. The ingest, `src/data/referee-foul-style.json`
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

## Related

- [ADR 0006](0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md) — the same guard
  against circularity, aimed at model coefficients rather than at hypothesis selection.
- `docs/GLOSSARY.md` — REFEREE EFFECT, and why the page is not called Referee Bias.
- `src/lib/referee-foul-style.ts` — the |z| ≥ 2 emphasis rule and the 200-game bar, already shipped.
