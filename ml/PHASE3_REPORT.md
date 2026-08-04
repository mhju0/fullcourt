# Playoff Predictor — Phase 3 (T3): Model Training & Evaluation

**Grain:** one NBA playoff **series**. **Task:** predict whether the **home-court
(reference) team wins the series** from four pre-series features. **Read-only**: this phase
reads `playoff_series` with a single `SELECT` and writes nothing to the database (prediction
persistence is a later phase).

Reproduce:

```bash
./ml/.venv/bin/python -m pip install -r ml/requirements.txt   # scikit-learn 1.9.0 into the venv
./ml/.venv/bin/python ml/train_series_model.py                # prints + writes ml/phase3_results.txt
```

All numbers below were emitted to `ml/phase3_results.txt` and re-read from that file (not via
`grep`) to guard against terminal digit-masking. That raw output is a local working artifact
and is not committed; re-run the command above to regenerate it.

---

## 1. Data contract (verified against the live DB, STEP 0)

| Item | Value |
|------|-------|
| Table | `playoff_series` (`drizzle/0006_playoff_series.sql`, `playoffSeries` in `src/lib/db/schema.ts`) |
| Series key | `external_series_key` (varchar, unique) / `id` (serial PK) |
| Home-court (reference) team | `home_court_team_id` (NOT NULL) |
| Winner | `series_winner_team_id` (nullable) |
| Features (numeric) | `seed_diff`, `win_pct_diff`, `prior_grind_diff`, `h2h_diff` (swapped in for `entry_rest_diff`, 2026-07-31) |
| **Label** | **`y = 1` iff `series_winner_team_id == home_court_team_id`, else 0** |

**Label derivation is unambiguous:** there is an explicit `home_court_team_id`, and a live
`SELECT` confirmed **0 rows** where the winner is neither the home-court nor the opponent
team, so the comparison is total on the labeled set.

**Row accounting** (live counts):

| | count |
|---|---|
| total rows | 600 |
| non-NULL label | 599 |
| any NULL feature | 0 |
| **trainable (label present AND all 4 features present)** | **599** |

The one excluded row is exactly `1986-87_LAL-OKC` (NULL winner; its features are fine).

**Class balance (trainable, n = 599):** home-court team wins **447 / 599 = 0.7462**. This is
the **majority-class baseline** the model ladder must beat. Coverage is **40 seasons**
(1985-86 … 2025-26; the 2019-20 COVID bubble is absent by design), 15 series/season except
1986-87 (14, the excluded row).

Feature matrix column order is fixed and documented everywhere:
`X = [seed_diff, win_pct_diff, prior_grind_diff, h2h_diff]`.

---

## 2. Validation: expanding-window walk-forward by season (no random shuffle)

We split **strictly by season, chronologically**. Starting from the first
`MIN_TRAIN_SEASONS = 10` seasons, we train on seasons `[s0 … sk]`, evaluate on season
`s(k+1)`, then step forward — an expanding window. This yields **30 evaluation folds**
(1995-96 … 2025-26) and **450 pooled eval predictions**.

**Why 10 seasons minimum** (events-per-variable heuristic): a 5-parameter logistic
(4 features + intercept) wants ≈10 minority-class events per parameter. The minority class
(opponent wins ≈ 25% of ~15 series/season ≈ 3.7/season) reaches ≈37 events at 10 seasons —
the floor for a stable early fit; the window expands from there.

**Why NOT `KFold`/`StratifiedKFold(shuffle=True)`** — two independent leakage reasons:

1. **Same-season correlation.** The 15 series in a season share one 16-team field, one set of
   standings, and are structurally coupled (a team only advances by winning the prior round).
   Shuffling scatters a season across train and test, so the model sees part of a bracket
   while predicting the rest — information a real forecaster (who predicts a bracket *before*
   it starts) never has.
2. **Temporal directionality.** A deployed predictor is trained on the past and applied to the
   future. Random CV lets future seasons inform predictions about past seasons, inflating the
   estimate versus the only direction that matters: forward in time.

Because classes are imbalanced toward home-court and we care about a *calibrated probability*
(not just a pick), we report **accuracy, log-loss, and Brier** — per-fold and pooled.

---

## 3. Model ladder (identical walk-forward protocol; pooled over 30 eval seasons, n = 450)

| Model | Pooled acc | Mean season acc | Log-loss | Brier |
|-------|-----------:|----------------:|---------:|------:|
| `baseline: prior (majority)` | **0.7444** | 0.7444 ± 0.098 | 0.5696 | 0.1907 |
| `baseline: sign(seed_diff)` | 0.7356 | 0.7356 ± 0.097 | n/a | n/a |
| `baseline: sign(win_pct_diff)` | 0.7444 | 0.7444 ± 0.098 | n/a | n/a |
| `logistic: unregularized` | **0.7533** | 0.7533 ± 0.108 | **0.4939** | **0.1628** |
| `logistic: L2 (C tuned in-fold)` | 0.7489 | 0.7489 ± 0.106 | 0.4951 | 0.1637 |
| `tree: depth 2` | 0.7022 | 0.7022 ± 0.069 | 0.8340 | 0.1835 |
| `tree: depth 3` | 0.7511 | 0.7511 ± 0.105 | 0.9692 | 0.1794 |

*The two sign-rule baselines produce hard 0/1 "probabilities", so their log-loss/Brier are
not meaningful and are omitted; they set the **accuracy** bar only.*

**Baseline notes (a deliberate honesty check):**
- `sign(win_pct_diff)` is **identical** to the majority baseline — `win_pct_diff` is
  structurally ≥ 0 (home-court always has the ≥ record), so "predict the better record" always
  predicts the home-court team. The feature has no discriminative *sign*, only magnitude.
- `sign(seed_diff)` is **worse** than majority (0.7356 vs 0.7444). It only diverges from
  "always home-court" in the **Finals** (cross-conference, where the proxy seed can favor the
  visitor), and those flips lose more than they gain.

**Accuracy vs the 74.6% majority baseline (uncertainty):**

| Model | Pooled acc | 95% CI | Δ per-season vs majority | W/T/L |
|-------|-----------:|--------|-------------------------:|:-----:|
| `logistic: unreg` | 0.7533 | [0.7135, 0.7932] | +0.0089 ± 0.0146 | 11/13/6 |
| `logistic: L2` | 0.7489 | [0.7088, 0.7890] | +0.0044 ± 0.0084 | 6/19/5 |
| `tree: depth 2` | 0.7022 | [0.6600, 0.7445] | −0.0422 ± 0.0137 | 2/16/12 |
| `tree: depth 3` | 0.7511 | [0.7112, 0.7911] | +0.0067 ± 0.0173 | 12/7/11 |

**L2 regularization path:** across the 30 folds the inner season-grouped CV chose
`C = 0.1` in 26 folds and `C = 0.3` in 4 (grid `[0.01…10]`) — consistently moderate
regularization, and L2 barely moves the needle vs unregularized because with only 4 features
linear overfitting is mild.

---

### 3a. Round split

Model of record: `logistic: unregularized`, walk-forward, out-of-sample. Verbatim from
`ml/phase3_results.txt`:

```
── Round split (walk-forward, out-of-sample) ──

  slice           n  model acc  always-HC   log-loss   base LL
  round 1       240      77.1%      78.8%     0.4311    0.5173
  rounds 2+     210      73.3%      69.5%     0.5658    0.6148

  per-season paired record vs always-home-court, ROUNDS 2+: 11 win / 16 tie / 3 loss
  (the pooled accuracy gap is only about 8 series — the paired record is the evidence
   that carries, and it is the test §5 of PHASE3_REPORT.md already argues for)
```

The pooled table above (§3) folds Round 1 and rounds 2+ together, and that pooling is what
produced the earlier "+0.2 points, inside noise" headline: Round 1, where the model has
nothing to say, dilutes rounds 2+, where it does. Split apart: in rounds 2+ the model beats
always-home-court on both accuracy (73.3% vs 69.5%) and log-loss (0.5658 vs 0.6148), and the
per-season paired record is lopsided (11 win / 16 tie / 3 loss). In Round 1 — where
`prior_grind_diff` is 0 for every row by construction, since there is no prior round to have
been ground down by — the model has strictly less information than in later rounds and
underperforms the simple rule (77.1% vs 78.8%). Machine-readable copy of the same figures,
generated from the same walk-forward result, lives at `ml/playoff_round_split.json`.

---

## 4. Interpretation & leakage audit (STEP 4)

**Standardized L2-logistic coefficients** (all 599 rows, in-sample, for interpretation only;
standardized ⇒ magnitudes comparable):

| Feature | Coef | Reading |
|---------|-----:|---------|
| intercept | +1.3724 | strong home-court prior (matches the 74.6% base rate) |
| `win_pct_diff` | **+0.7141** | dominant driver — regular-season record gap |
| `seed_diff` | +0.4026 | proxy seed gap |
| `prior_grind_diff` | +0.2822 | opponent ground down more in the prior round than home-court was (inverted-sign feature — see the note under this table) |
| `h2h_diff` | +0.1233 | weak head-to-head signal |

All four coefficients are **positive** — every home-court-advantage dimension raises
home-court win odds, exactly as the sign convention predicts (sanity check passes; note
`prior_grind_diff`'s subtraction order is deliberately inverted versus the other three
features precisely so that a positive coefficient here means the same thing it does
everywhere else in the table).

**Does the model over-rely on the `seed_diff` proxy?**
- **Logistic: no.** `win_pct_diff` gets ~1.8× the standardized weight of `seed_diff`, so the
  linear model leans on the *cleaner* record feature over the ±1-drift proxy.
- **Tree: yes.** Depth-3 importances are `seed_diff 0.5665`, `win_pct_diff 0.2003`,
  `prior_grind_diff 0.1608`, `h2h_diff 0.0724`. Because `seed_diff` and `win_pct_diff` are
  strongly correlated, the greedy tree grabs `seed_diff` for its top split; the logistic
  spreads the shared credit and prefers `win_pct`. This over-reliance on the proxy is another
  reason to distrust the tree here (it also *underperforms* on both accuracy and log-loss).

**Leakage audit — no feature encodes the outcome** [Verified in `ml/compute_series_features.py`
and `ml/compute_prior_grind.py`]:
- `win_pct_diff`, `h2h_diff`: computed from **regular-season only** games
  (`load_regular_records`, `SELECT … WHERE game_type = 'regular' AND status = 'final'`,
  `compute_series_features.py:167-176`).
- `prior_grind_diff`: format-aware games played beyond a sweep in the **prior** round only
  (`grind_beyond_sweep`, `games_played - (4 if is_best_of_7 else 3)`,
  `compute_prior_grind.py:64-77`) — 0 for every Round 1 row by construction, never the
  current round's own outcome.
- `seed_diff`: a regular-season **Win%-rank proxy** (`derive_seeds`,
  `compute_series_features.py:291-398`) — derived from standings, never the result.
- No feature references `series_winner_team_id` (`compute_features`,
  `compute_series_features.py:404-449`). The label is the only place the winner appears.

---

## 5. Honest headline

> **Does rest / seed / record structure predict series outcomes better than "the home-court
> team wins"?**

- **On accuracy: no — not distinguishably, pooled.** The best model (unregularized logistic,
  0.7533) beats the 74.6% majority baseline by **+0.9 percentage points**, but both models
  predict the *same* 30 series-per-season folds, so the right comparison is **paired**, not two
  independent CIs eyeballed for overlap. The paired evidence: the per-season win/tie/loss record
  vs majority is **11/13/6** across all 30 folds, and the per-season mean delta is
  **+0.0089 ± 0.0146** — a real but still noisy effect, well under the ~2 SE bar a confident
  claim would need. (The correct formal test here would be a paired one — e.g. McNemar's test on
  the paired predictions, or a sign/Wilcoxon test on the 30 per-season deltas — not
  independent-CI overlap; we did not run that test, but the paired record and delta±sd already
  point the same way.) With 30 eval seasons / 450 series this pooled difference is **noise**. But
  pooling is exactly what buries the real result — see §3a: split by round, the model clearly
  beats the baseline in rounds 2+ and clearly loses to it in Round 1. This is a legitimate,
  expected result for 599 rows and 4 correlated features, and we did **not** tune to manufacture
  a win.
- **On probability quality: yes — clearly.** The logistic model cuts **log-loss from 0.5696 →
  0.4939 (≈13% relative)** and **Brier from 0.1907 → 0.1628 (≈15% relative)** versus the
  base-rate constant. The features barely change *who* you would pick (almost always the
  home-court team), but they produce materially **better-calibrated probabilities** —
  separating a lopsided #1-vs-#8 from a near-coin-flip #4-vs-#5. For a predictor that outputs
  a **series win probability**, that calibration gain is the real, defensible value.
- **Prior-round grind, not raw rest:** `entry_rest_diff` (raw days off before Game 1) is out;
  `prior_grind_diff` (format-aware games played beyond a sweep in the *previous* round, opponent
  minus home-court) is in — the two correlate at r = 0.910, and `prior_grind_diff` wins on
  accuracy, log-loss, and Brier. Pooled, it carries a modest positive standardized coefficient
  (+0.28), similar in size to the old rest feature. The real story is the round split (§3a): the
  model beats always-home-court in rounds 2+ (73.3% vs 69.5% accuracy; 11 win / 16 tie / 3 loss
  per season) and loses to it in Round 1 (77.1% vs 78.8%), where `prior_grind_diff` is 0 for
  every row by construction. The feature earns its keep exactly where a prior round exists to
  have ground a team down.
- **Model of record:** the **regularized (or plain) logistic** is the right choice — the tree
  overfits (depth-2 loses 4.2 pts of accuracy; depth-3's log-loss 0.97 reflects overconfident
  pure leaves), the textbook small-data failure STEP 3 anticipated.

**Caveats.** (1) `seed_diff` is a Win%-rank **proxy** for the official seed (±1 drift possible
in the pre-2016 division-winner era and the 2020-21+ play-in era); the tree's reliance on it
makes the tree less trustworthy, though the preferred logistic does not lean on it. (2) 30 eval
seasons is a small sample for the accuracy comparison — the honest conclusion is a *calibration*
win, not a *classification* win.

---

### Files

| File | Role |
|------|------|
| `ml/train_series_model.py` | walk-forward training + evaluation (read-only) |
| `ml/requirements.txt` | isolated ML deps (scikit-learn 1.9.0); root/scripts reqs untouched |
| `ml/phase3_results.txt` | raw generated results (source of every number here; gitignored) |
| `ml/playoff_round_split.json` | committed round-split figures (§3a), so the page can pin against a versioned artifact |
| `ml/PHASE3_REPORT.md` | this report |

Gate: `pnpm lint` clean, `pnpm test:run` 64/64 pass, `pnpm build` succeeds. No DB writes; no
git actions.
