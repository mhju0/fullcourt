# Playoff Rest — the round before decides the round after

**Date:** 2026-07-31 · **Status:** Approved

## Goal

Rebuild `/playoffs` around a finding an average fan can hold in their head: **surviving a long
series taxes you in the round that follows.** The tab renames from PLAYOFF PREDICTIONS to
**PLAYOFF REST**, the page leads with the argument and its confound test, and the series
predictor moves below as the applied bracket rather than the pitch.

The model is recalculated, not rebuilt: one feature swap (`entry_rest_diff` →
`prior_grind_diff`) and a round-split reporting change. Both were chosen from measurement, not
taste — see §0.

**Why the current page fails.** It headlines "13% better log-loss, 0.2 points of accuracy,
inside noise." That is an honest sentence about a model and a meaningless one to a fan. The
underlying data has a much louder story in it that the page never surfaces, because the
feature carrying that story (`entry_rest_diff`, standardized coefficient +0.23) is buried
under `win_pct_diff` (+0.72) and never named in prose.

**Not building:** regular-season-tail fatigue features for Round 1; postseason travel,
overtime-survived, or cumulative-games features (all screened and rejected in §0.4); any new
data ingest. No new API surface — `/api/playoffs` gains fields, not routes.

---

## 0 · Facts that shaped the design

Every number below was measured against the live database before this spec was written.
Probe scripts were throwaway; the numbers are reproduced by the implementation work in §4.

### 0.1 The postseason erases rest — with one exception

Across all 3,264 non-regular-season games in the database with both teams' prior-game dates
known:

| slot | games | equal rest | unequal | % equal |
|---|---:|---:|---:|---:|
| Game 1 | 651 | 310 | 341 | 47.6% |
| **Game 2+** | **2,613** | **2,613** | **0** | **100.0%** |
| all | 3,264 | 2,923 | 341 | 89.6% |

**Every playoff game after Game 1 — all 2,613 of them across 40 seasons — is played with both
teams on identical rest. Zero exceptions.** This is structural, not coincidental: after Game 1
the two teams are playing *each other*, so they share a schedule by construction.

The consequence for this site: rest, the variable every other tab is built on, has exactly one
place to exist in the postseason — the layoff into Game 1. That fact is the page's opening
line, and it is why this page must be about something other than what `/analysis` is about.

*Known caveat for implementation:* the 3,264 figure uses `game_type <> 'regular'`, which
includes play-in games. Play-in games are single games and cannot appear in the Game 2+ bucket,
so the 100.0% claim is unaffected; the Game 1 count of 651 (vs 600 rows in `playoff_series`) is
inflated by them. §4.1 requires the published figure be recomputed with play-in excluded.

### 0.2 The Grind Tax

**Grind is measured format-aware: games played beyond a sweep.** Best-of-5 → `len − 3`,
best-of-7 → `len − 4`. This is not cosmetic. **136 of 320 Round 1 series (1985-86 → 2001-02)
were best-of-5**, and in a best-of-5 a five-game series means the team went the *full distance*
while in a best-of-7 it means they closed early. Raw games played gives those opposite
situations the same number, across roughly half the historical sample. `playoff_series` already
carries `is_best_of_7` for exactly this.

Rounds 2+, `n = 279` series with both prior-round grinds known. Rows are the home-court team's
own prior-round grind, columns are its opponent's. Cells are the home-court team's series win
rate.

| | opponent closed early (0–1) | opponent went long (2–3) |
|---|---:|---:|
| **you closed early (0–1)** | 68.9% (n=74) | **85.4% (n=89)** |
| **you went long (2–3)** | 65.9% (n=44) | 59.7% (n=72) |

The lit cell is "I am fresh, they are wrecked." Everything else sits in a 60–69% band. Note the
bottom row: when *you* also went long, your opponent's grind stops mattering — it goes the wrong
way (65.9% → 59.7%). That is the signature of a **differential**, not of "long series are bad in
the absolute", and it is a real internal consistency check: a pure revealed-weakness story would
predict the opponent's length mattering in both rows.

Series-level buckets on the existing `entry_rest_diff` agree, monotonically:

| home-court rest edge | series | wins series |
|---|---:|---:|
| −2 days or worse | 67 | 65.7% |
| roughly even (−1…+1) | 92 | 59.8% |
| +2 days or more | 120 | 83.3% |

A rest gap of ≥2 days is not exotic: it is present in **67% of rounds-2+ series** (187 of 279)
and 8% of Round 1 series (26 of 320).

### 0.3 The confound test — this is not just "the sweeper was better"

The obvious objection: you earn rest by winning fast, and winning fast means you are good. So
the gap is split into the half you control (your own prior-round grind) and the half you do not
(**your opponent's**, which is decided by two other teams).

Holding the home-court team's own grind at 0–1:

| opponent's prior round | home-court wins series | mean pre-series win% diff |
|---|---:|---:|
| closed early (n=74) | 68.9% | +0.0891 |
| went long (n=89) | **85.4%** | +0.1079 |

**+16.5 points from something entirely outside the home-court team's control.** But note the
right-hand column honestly: under the format-aware measure the "opponent went long" group is
also **nominally stronger on record** (+0.108 vs +0.089, worth roughly 1.5 wins over 82 games),
so part of that 16.5 is strength rather than grind. The raw-games version of this table showed
a flat strength profile; the corrected one does not, and the spec reports the corrected one.

**The claim therefore rests on the strength-controlled number, not the headline one.**
Restricted to close matchups (\|win% diff\| ≤ 0.08, n=140), where the strength gap is bounded
tight by construction: **53.2% → 67.9%, +14.7 points** (n=62 / n=78). The effect barely shrinks
once strength is held down, which is what a real effect looks like.

The mirror check: holding the *opponent's* grind fixed and varying the home-court team's own
moves the rate −6.2 points, i.e. the wrong way. The exogenous half carries the signal; the
endogenous half does not.

### 0.4 Feature screening — swap one, drop three

Five grind features were screened under the protocol already in `ml/train_series_model.py`
(expanding-window walk-forward by season, `MIN_TRAIN_SEASONS = 10`, 30 folds, 450 pooled
out-of-sample predictions). All signed home-court − opponent so positive favors home court.

| feature set | acc | log-loss | Brier |
|---|---:|---:|---:|
| strength only (seed + win% + h2h) | 71.8% | 0.4995 | 0.1656 |
| + `entry_rest` — **today's model** | 74.7% | 0.4959 | 0.1638 |
| **+ `prior_grind` — proposed** | **75.3%** | **0.4939** | **0.1628** |
| + both | 75.6% | 0.4949 | 0.1626 |
| + `prior_grind` + postseason games | 75.1% | 0.4975 | 0.1635 |
| + `prior_grind` + OT survived | 74.9% | 0.6246 | 0.1677 |
| + `prior_grind` + postseason travel | 76.2% | 0.4971 | 0.1631 |
| all grind features | 75.3% | 0.6403 | 0.1681 |

**`prior_grind` alone beats `entry_rest` alone** on all three metrics. Using both is rejected:
they correlate at **r = 0.910**, and in the joint fit the rest coefficient flips negative
(−0.40 against `prior_grind` +0.50) — a collinearity artifact that would be published as a
finding if we shipped it. One feature, and it is the better and more legible one: "they came
off a seven-game war" is a sentence a fan already understands; "−3 days of rest" is not.

Postseason games, OT survived, and travel are all rejected. OT is actively destructive
(log-loss 0.62 — overconfident). Travel buys accuracy while losing log-loss, which is the
wrong trade for a page whose defensible claim is calibration.

**The format-aware correction does not move the model.** Screened both encodings side by side:
raw games played and games-beyond-a-sweep produce *identical* walk-forward results to four
decimals (75.3% / 0.4939 / 73.3% R2+ / 77.1% R1). The correction matters for §0.2's buckets and
for the prose — where it changes what the numbers mean — and is free for the model. We use the
format-aware encoding in both places because shipping two different definitions of the same word
on one page is how a page becomes untrustworthy.

### 0.5 The round split — the real headline

Same walk-forward runs, partitioned by round:

| | rounds 2+ (n=210) | Round 1 (n=240) |
|---|---:|---:|
| today's model (`entry_rest`) | 71.4% | 77.5% |
| **proposed model (`prior_grind`)** | **73.3%** | 77.1% |
| always pick the home-court team | 69.5% | **78.8%** |
| proposed log-loss / base | 0.5658 / 0.6148 | 0.4311 / 0.5173 |

The model gains **+3.8 accuracy points** over the one-line rule exactly where grind exists, and
**loses 1.7 points** to it where grind does not. Pooling those two halves is what produced
today's "+0.2 points, inside noise" headline: Round 1, where the model has nothing to say,
dilutes rounds 2+, where it does.

This split is the page's model claim. It is a better claim *and* a more honest one, and it
comes from reporting the existing evaluation differently rather than from tuning.

**The paired evidence backs it.** +3.8 points over 210 series is only about 8 series, so the
pooled number alone is not enough — `ml/PHASE3_REPORT.md` §5 already argues the right test here
is paired, not two CIs eyeballed for overlap. Per-season, in rounds 2+, the model **beat / tied
/ lost to** the always-home-court rule in **11 / 16 / 3** seasons. Compare today's pooled
11/11/8, which is a coin flip. 11–3 among decided seasons is the strongest form of evidence
this sample can produce, and Section D publishes it next to the accuracy figure.

### 0.6 The caveat we publish rather than bury

An opponent who needed seven games is also *revealed* weaker than their seed and record said.
That cannot be separated from fatigue with this data. One thing pushes against a pure
revealed-weakness reading — the bottom row of §0.2, where their grind stops mattering (and
reverses) once you are also ground down, which a revealed-weakness story does not predict. The
strength-controlled +14.7 points in §0.3 pushes the same way. Neither is decisive.

Against it: the per-game breakdown does **not** show a clean fatigue fade. The fresh team's
edge persists into games 4 and 5 rather than spiking in Game 1 and decaying, which is as
consistent with "they are worse" as with "they are worn down". (The raw per-game rates are also
dominated by the 2-2-1-1-1 venue pattern, so they are not clean evidence in either direction and
are **not** published as a chart.)

**The effect is solid. The mechanism is arguable.** Section C says exactly that, in those
terms. This matches how the site already handles `/analysis` and the win-total null.

---

## 1 · Page structure

`/playoffs`, tab **PLAYOFF REST**, argument first and bracket below.

```
PLAYOFF REST
The round before decides the round after

A  THE POSTSEASON HAS NO REST                     one stat, two sentences
   2,613 of 2,613 games after Game 1 on equal rest

B  THE GRIND TAX                                  the 2x2, 85.4% cell lit
   + the entry-rest bucket table as support

C  ISN'T THAT JUST THE BETTER TEAM?               exogenous test, strength columns,
   the opponent's series length isn't your call    and the mechanism caveat

D  WHAT THE MODEL DOES WITH IT                    round-split table, R1 loss included,
   +3.8 pts in rounds 2+, −1.7 in Round 1          per-season W/T/L

E  ── BRACKET ──────────────  [season selector]
   CONF FINALS
   BOS vs IND   BOS closed in 5 · IND survived a 7   78% BOS  ✓
```

**Section A** is the hook and the justification for the page existing separately from
`/analysis`. It is deliberately the smallest section: one number, a sentence naming why it is
structural, a sentence naming the one exception.

**Section B** is the finding. The 2×2 is the primary artifact — four cells, the 85.4% one
carrying the accent. The `entry_rest_diff` bucket table sits beneath it as corroboration from a
second angle, not as a second headline.

**Section C** is the section that earns the page. It states the objection in a fan's own words,
answers it with the exogenous split, shows the strength columns that make the answer work, and
then concedes §0.6 in plain language.

**Section D** publishes the round split with the Round 1 row where the one-line rule wins,
side by side, per the site's existing practice. Stated plainly in-section, not led with and not
footnoted.

**Section E** is today's bracket. The series card is rewritten so the grind state is visible on
the collapsed row — "closed in 5" / "survived a 7" — instead of living inside the SERIES
FEATURES drawer. The drawer stays for the full feature list.

**Component boundaries.** A–D and E are separate components in one column. This is a stated
requirement, not incidental: a later flip to bracket-first must be a reorder of siblings, not a
rewrite. No component may reach into another's state, and the season selector drives only E.

---

## 2 · Data model

One new column on `playoff_series`:

| column | type | meaning |
|---|---|---|
| `prior_grind_diff` | `numeric` (nullable) | opponent's prior-round grind − home-court team's, where one team's grind is `games_played − (4 if is_best_of_7 else 3)`. Positive favors the home-court team; range −3…+3. |

Named `prior_grind_diff`, not `prior_len_diff`: the value is not a series length, and a column
whose name says "len" while holding a format-adjusted quantity is the kind of thing that gets
misread into a chart two years from now.

**Nullability contract.** `0` in every Round 1 row — no prior round exists, so there genuinely
is no differential, and that is a fact rather than a fill value. Non-null for every rounds-2+
row where both teams' prior series resolve. `NULL` only where a prior series cannot be resolved
at all, which the backfill must report as a count rather than silently coerce to 0. A silent 0
would be indistinguishable from a real Round 1 value.

Derived entirely from `playoff_series` itself (the prior round's `home_court_wins +
opponent_wins` and `is_best_of_7`, for whichever series each team appeared in). No new ingest,
no new source, no dependency on `games`.

`entry_rest_diff` is **retained in the table** and still displayed in the feature drawer. It is
removed from the *model's* feature vector only. Deleting a populated column to swap a model
input would be an irreversible loss for a reversible decision.

Migration follows the `fullcourt-migration` workflow and the standalone-migration shape of
`drizzle/0006_playoff_series.sql`: a complete pasteable file, RLS and grants mirrored, scope
limited to the one column.

---

## 3 · Model contract

```
X = [seed_diff, win_pct_diff, prior_grind_diff, h2h_diff]
y = 1  iff  series_winner_team_id == home_court_team_id
```

Four features, same count as today, one swapped. Unregularized logistic, unchanged. Walk-forward
protocol unchanged. Orientation contract unchanged — `predicted_home_court_win_prob` remains
P(home-court team wins), so `playoff_series_predictions` needs no schema change.

New `model_version` string. Existing rows are **not** deleted: the unique constraint is
`(series_id, prediction_method, model_version)`, so the new version coexists and the old one
stays auditable. The API and page read the new version only.

---

## 4 · Work

1. **Verify §0.1 with play-in excluded** and pin the exact published figure. This is the page's
   opening number; it ships correct or the section does not ship.
2. **Migration + backfill** — `prior_grind_diff` column, then compute it for all 600 rows.
   Verification: every Round 1 row is exactly 0; every NULL is reported as a count with its
   series keys rather than coerced; and the §0.2 two-way table reproduces from the stored
   column, cell counts included. That last check is the one that catches a wrong sign or a
   wrong format adjustment — the marginals alone would not.
3. **Retrain** with the swapped feature vector. Regenerate the report with the §0.5 round-split
   table and the per-season W/T/L record. Write predictions under the new `model_version`.
4. **Constants** — `src/lib/playoff-model-metrics.ts` gains the round-split and Grind Tax
   figures. Same discipline as today: constants read from the generated report, one home, never
   retyped into a component.
5. **API** — `/api/playoffs` returns `priorLenDiff` and each team's prior-round games played, so
   Section E's card can say "closed in 5" without a second request.
6. **Page** — rewrite `src/components/playoffs-content.tsx` (currently 530 lines) as the five
   sections. Sections A–D are static-constant renders; only E is SWR-driven.
7. **Nav + copy** — `primary-navigation.ts` label and `guideDescription`; `page.tsx` eyebrow,
   title, description; the `/behind-the-data/playoff-predictions` method page.
8. **Tests** — the existing `e2e/playoffs.spec.ts` and the two-line page-description test both
   assert current copy and will need updating with the new copy, not around it.

**Verification gate:** `pnpm lint`, `pnpm test:run`, `pnpm build`, plus the §0.2 / §0.3 / §0.5
tables reproducing from committed code rather than from throwaway probe scripts. Every number
rendered on the page must trace to the regenerated report.

---

## 5 · Decisions taken, and what they closed off

| decision | chosen | rejected |
|---|---|---|
| direction | rebuild around the grind finding | re-headline the existing model; demote to OTHER as casual |
| layout | argument first, bracket below | bracket first (**revisit later — kept cheap by §1**) |
| Round 1 | grind features = 0, one model over 600 series | rounds-2+-only model; regular-season-tail features for R1 |
| features | swap to `prior_grind_diff`, drop the rest | keep both rest features; add travel / OT / cumulative games |
| tab name | PLAYOFF REST | PLAYOFF GRIND, SERIES REST, PLAYOFF EDGE, PLAYOFF EFFECT, keep |
| Round 1 loss | Section D, stated plainly | lead with it; footnote it to the method page |

`PLAYOFF EDGE` was ruled out because `primary-navigation.ts` uses "edge" as the qualifier that
makes SCHEDULE EDGE legible; a second EDGE tab stops it qualifying. `PLAYOFF EFFECT` was ruled
out as semantically backwards — REFEREE EFFECT means the effect referees have, whereas this page
is about the effect of rest *inside* the playoffs.
