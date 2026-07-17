# Playoff Predictor — Design

> **Status (updated 2026-07-02): complete, end to end.** Every phase in this design has shipped:
> per-game ingest (`scripts/fetch_playoffs.py` for `004` playoff/finals, `scripts/fetch_play_in.py`
> for `005` tagged `play_in`); the `playoff_series` table (`src/lib/db/schema.ts` +
> `drizzle/0006_playoff_series.sql`, in `tablesFilter`) with its series-skeleton builder
> (`ml/build_series_dataset.py`) and feature pass (`ml/compute_series_features.py`, the four
> `*_diff` columns); walk-forward model training and a bake-off (`ml/train_series_model.py`,
> written up in [`ml/PHASE3_REPORT.md`](../ml/PHASE3_REPORT.md)); prediction persistence
> (`ml/predict_series.py --write` → `playoff_series_predictions`, `drizzle/0007`); and serving
> (`GET /api/playoffs` + the `/playoffs` page with a nav link). See [ROADMAP.md](ROADMAP.md) for
> the phase-by-phase build record.
>
> **Live DB verified 2026-07-02** (read-only `SELECT`s): 3,145 `004` playoff/finals + 36 `005`
> play-in game rows; **600 `playoff_series` rows**, all four feature columns non-NULL, **599
> trainable** (one 1986-87 series has no resolved winner); **1,049 `playoff_series_predictions`
> rows** (599 `full_insample` + 450 `walk_forward_oos`, `model_version = "logistic_unreg_v1"`).
> **Model of record:** the unregularized logistic — a **calibration** win over the majority
> baseline (log-loss 0.5696 → 0.4959, Brier 0.1907 → 0.1638), not a distinguishable accuracy win
> (pooled 0.7467 vs. 0.7444; paired per-season record 11/11/8) — see
> [`ml/PHASE3_REPORT.md`](../ml/PHASE3_REPORT.md) §5 for the full honest-headline writeup.
>
> This document remains the single source of truth for the module's **design rationale** (§1–§3
> below still describe why each feature and encoding choice was made, and match the shipped code).
> Values cited from source are line-referenced; when this doc and the code disagree later, **trust
> the code and fix this doc**.

## 0. Scope and locked decisions

These are fixed inputs to the design, not open for relitigation here:

- **Target:** *series winner* (binary), at the **series grain**, for both best-of-7 and
  best-of-5 series. We predict which of the two teams wins the series.
- **Scope:** all playoff eras present in `NBA_SEASONS`, carrying a **series-format flag**
  (best-of-5 pre-2003, best-of-7 from 2002-03 on).
- **Substrate:** playoff games are ingested at the **per-game grain**; series outcomes and
  all series features are **derived** from per-game data.
- **Isolation:** this must not change the existing regular-season product, which filters
  `game_type = 'regular'` everywhere.
- **No renames:** the **rest advantage** metric keeps its name and semantics.

The rest of this document makes every remaining decision explicit and grounds it in the
actual code.

---

## 1. Problem framing & target encoding

### Recommendation
Encode the binary target as **`y = 1 if the home-court team wins the series, else 0`**,
where "home-court team" is the series participant that holds home-court advantage
(plays Games 1, 2, 5, 7 at home in a 2-2-1-1-1 / 2-3-2 format). All features are then
defined as **(home-court team) − (non-home-court team)** differentials so the sign of
every coefficient is interpretable against a single, always-defined reference team.

### Why home-court team, not higher seed
- **Home-court is always defined and unambiguous.** It is decided by regular-season
  record (with a deterministic tiebreaker), and it directly drives the series structure
  (which arena hosts the swing games). Seed is *usually* aligned with home-court but not
  always: in the conference-based seeding eras and especially post-2016 (division-winner
  seeding removed in 2016) and in the play-in era (2020-21+), the nominally "higher seed"
  and the home-court holder can diverge, and re-seeding rules changed across eras in scope
  (1985-86 → 2025-26). Anchoring on home-court avoids encoding an era-dependent definition
  of "seed" into the label.
- **It matches the existing product's mental model.** The regular-season product is built
  around home/away and a home-referenced rest-advantage differential
  (`restAdvantage = away.score − home.score`, `src/lib/fatigue.ts:545`). Keeping the
  playoff label home-referenced keeps the two products conceptually consistent.
- **The naive baseline becomes a clean floor.** "Home-court team wins" is then literally
  `predict y = 1 always`, and "higher seed wins" is a second baseline computed from the
  seed feature. The model must beat both (see §5).

> **Encoding note (sign convention):** because the label is home-court-referenced, the
> entry-rest feature (§3) is also defined as `homeCourtTeamDaysOff − opponentDaysOff`.
> A positive rest differential meaning the *better-rested* team is the home-court team.
> This is a labeling convention only — it is **not** the regular-season rest-advantage
> metric and does not touch `fatigue.ts`.

### Trade-offs
- *Higher-seed encoding* is marginally simpler to explain to a casual audience ("does the
  better team win?") but requires a stable cross-era seed definition we do not have.
- *Home-court encoding* requires us to compute who holds home-court (trivially derivable
  from regular-season win% / the Game-1 host once games are ingested) but is unambiguous
  across all eras. We accept the small derivation cost for cross-era correctness.

---

## 2. THE CRITICAL FATIGUE INSIGHT (must never be violated)

**Within a single playoff series, rest is symmetric by construction.** The two teams play
the *same* games on the *same* dates in the *same* two cities. Therefore, for any game
*inside* a series:

- **Days rest is identical** for both teams (they last played each other, on the same day).
- **Travel is near-identical** (both fly the same arena→arena legs on the same days; the
  only asymmetry is "home team sleeps in its own bed," which the model does not even
  capture as a between-team difference).

Run through the actual model (`src/lib/fatigue.ts`): `calculateFatigue` is driven by
`daysSinceLastGame` (line 492), the 7-day travel window (`computeTotalTravelMiles`), the
back-to-back multiplier (`B2B_MULTIPLIER`, line 35), schedule-stress windows
(`WINDOW_STRESS`, lines 52–58), and freshness (`FRESHNESS_*`). **All of these inputs are
shared by both teams inside a series.** Consequently
`calculateRestAdvantage(home, away)` (line 545) will be **≈ 0 for essentially every
within-series game**, and the `NEUTRAL_THRESHOLD = 0.5` band in
`src/lib/db/queries.ts:21` will classify nearly all of them as **neutral / no-call**.

**Implication — do NOT naively apply the per-game fatigue model to playoff games and
average it.** Doing so would (a) report "neutral" everywhere and (b) falsely suggest that
rest is irrelevant in the playoffs. That would be a measurement artifact of series
symmetry, not a finding.

**Where the real, asymmetric fatigue signal lives:** the **rest differential entering the
series** (the classic *rust-vs-rest* effect). Before Game 1, the two teams arrive having
finished their *previous* series (or the regular season) on *different* dates — one may
have swept and rested a week, the other may have survived a Game 7 the night before. That
gap is asymmetric and is the only place the fatigue machinery produces a meaningful
between-team difference at the series grain.

**Convenient consequence:** `fetchRecentGamesForTeam`
(`src/lib/fatigue-recent-games.ts:30`) filters by `status = 'final'` and a 30-day date
window but **does not filter `game_type`** (verified — the `where` clause at lines 58–65
has no `gameType` predicate). So once playoff games are ingested into `games`, calling the
*existing* per-game fatigue function on a **series opener** naturally pulls each team's
real previous game (prior-series clinch or last regular-season game) into its lookback and
yields the correct `daysSinceLastGame` / travel for the rust-vs-rest signal — **no change
to `fatigue.ts` required.** We use the model only at Game 1, never as a per-game series
average.

---

## 3. Feature set (precise definitions)

All features are differentials oriented as **(home-court team) − (opponent)** unless noted,
matching the §1 label.

### 3.1 Headline feature — entry-rest differential (`entry_rest_diff`)
- **Definition:** `homeCourtTeamDaysOff − opponentDaysOff`, where each team's `daysOff` =
  (Series Game-1 date) − (date of that team's **previous** game).
  - **Previous game** = the team's most recent prior playoff game (their previous-series
    clinch/elimination game).
  - **First round:** "previous game" = the team's **last regular-season game**.
- **Why it is the headline:** it is the *only* asymmetric fatigue quantity at the series
  grain (see §2). It is the playoff analogue of the regular-season rest-advantage thesis.
- **Availability:** **derivable from per-game data once playoff games are ingested** (§4).
  Computation reuses `fetchRecentGamesForTeam` semantics (no `game_type` filter, so a
  first-round opener correctly reaches back into the regular season). No new fatigue math.
- **Play-in handling (2020-21+):** a team that reached the playoffs via the play-in
  tournament has its "previous game" = its **last play-in game**. Play-in games are *not*
  series and are *not* modeled as a target; they exist only as per-game rows so that
  `entry_rest_diff` for first-round series is correct. (Flag the play-in entry path so it
  can be inspected — see Open Questions.)
- **Byes:** in scope eras there are no first-round byes for playoff teams (the 16-team
  bracket fills the first round), so no bye handling is needed for round 1. Inter-round
  gaps are captured naturally as larger `daysOff`. (Pre-1984 byes are out of scope.)
- **Optional richer variant:** instead of raw days, run the *existing* `calculateFatigue`
  for each team at Game 1 and use the **Game-1 rest-advantage differential** as the
  feature. This folds travel/OT/freshness into one number using code we already trust.
  Recommended as a second candidate feature; keep raw `entry_rest_diff` as the
  interpretable headline.

### 3.2 Seed differential (`seed_diff`)
- **Definition:** `opponentSeed − homeCourtTeamSeed` (positive ⇒ home-court team is the
  better seed). Captures the "better team wins" prior.
- **Availability:** **requires new ingestion / derivation.** Seed is not stored today. It
  can be derived from regular-season standings (win% rank within conference) for the
  season, or read from the bracket. Mark exact values **to be confirmed during ingestion**.

### 3.3 Regular-season win% differential (`win_pct_diff`)
- **Definition:** `homeCourtTeamRegSeasonWinPct − opponentRegSeasonWinPct`, computed from
  each team's **regular-season** record in that season.
- **Availability:** **derivable from existing regular-season `games` rows** (status=final,
  `game_type='regular'`) — no new ingestion needed for the inputs, only a derivation step.
  This is a continuous proxy for "team strength" and is often more informative than the
  discrete seed.

### 3.4 Home-court advantage indicator (`has_home_court`)
- **Definition:** because the label is home-court-referenced, this is **constant = 1** for
  the reference team and is therefore captured by the **model intercept / the
  always-home-court baseline**, not as a per-series feature. Documented here so it is not
  mistakenly re-added as a (degenerate, all-ones) column.
- **Availability:** derived (who hosts Game 1) from per-game data once ingested.

### 3.5 Regular-season head-to-head (`h2h_diff`)
- **Definition:** `homeCourtTeamH2HWins − opponentH2HWins` over the **regular-season**
  meetings between the two teams that season (typically 2–4 games).
- **Availability:** **derivable from existing regular-season `games` rows.** Caveat: small
  and noisy (often 0 net), and missing/!=4 games in lockout/COVID-shortened seasons. Keep
  as a candidate but expect low signal.

### 3.6 Series-format flag (`is_best_of_7`)
- **Definition:** `1` if the series is best-of-7, `0` if best-of-5. Per the locked rule,
  best-of-5 applies **pre-2003**; best-of-7 from **2002-03** on. Reconciliation with NBA
  reality (so the flag is correct at the **series grain**, not just per season):
  - Conference Finals and NBA Finals are best-of-7 in **all** in-scope seasons.
  - Conference Semifinals are best-of-7 in all in-scope seasons.
  - **First round** is best-of-5 for season start years **≤ 2001** (1985-86 … 2001-02) and
    best-of-7 from **2002-03** on.
  - So `is_best_of_7 = 0` **only** for first-round series with season start year ≤ 2001;
    `1` otherwise. (This is the locked "best-of-5 pre-2003" rule, applied precisely.)
- **Availability:** **derivable** from season + round, both of which come from ingestion.

### 3.7 Feature availability summary

| Feature | Grain | Source | Needs new ingestion? |
|---|---|---|---|
| `entry_rest_diff` (headline) | series | per-game playoff rows + reg-season rows | **Yes** (playoff games) |
| Game-1 rest-advantage diff (variant) | series | existing `calculateFatigue` @ Game 1 | **Yes** (playoff games) |
| `seed_diff` | series | standings / bracket | **Yes** (derive/ingest seed) |
| `win_pct_diff` | series | existing reg-season `games` | No (derivation only) |
| `has_home_court` | series | per-game (Game-1 host) | folded into label/intercept |
| `h2h_diff` | series | existing reg-season `games` | No (derivation only) |
| `is_best_of_7` | series | season + round | **Yes** (round comes from ingestion) |

---

## 4. Data gap analysis

### 4.1 Current state — CORRECTED against the live DB (verified Phase 1, 2026-06)
A code-level reading shows every current writer excludes playoff IDs:
- `scripts/fetch_schedule.py:78` sets `SEASON_TYPES = ["Regular Season"]`.
- The full seed **and** the daily date-range path both funnel through
  `_pair_games_dataframe`, which hits `continue` on any non-`002` id (`:221–223`) before
  tagging, so neither inserts a `004` row.
- `fetch_nba_schedule_cdn.py:133` skips any id not starting with `002`.

**However, the assumption "0 playoff games today" was wrong.** When Phase 1 ran, the live DB
already held **751 `004` rows**, **166 of them mislabeled `game_type = 'regular'`**
(2023-24: 82; 2024-25: 84). These are **legacy data from an earlier pipeline state**
(pre-dating the current `002` gate / `get_game_type` tagging on the date-range path), **not**
reproducible by HEAD code. The regular-season product was unaffected because every read also
applies the Oct 1–Apr 30 calendar guard and these are May/June games. The Phase-1 ingestion
re-tags them correctly via `ON CONFLICT … DO UPDATE game_type`; after the full backfill the
DB is clean. A `004`-tagged-as-`regular` invariant check is added to guard against
regressions. Exact post-ingestion counts are **to be confirmed during the full backfill**.

### 4.2 Sample estimate (in-scope seasons)
`NBA_SEASONS` (`src/lib/nba-season.ts:8`) spans 1985-86 … 2025-26 with **2019-20 excluded**
= **40 seasons** in scope. Standard modern bracket = **15 series/season** (8 first-round +
4 conf semis + 2 conf finals + 1 Finals).

- **Series:** ~40 × 15 ≈ **~600 playoff series** total (the modeling sample).
- **Games (substrate):**
  - Best-of-7 era (first round bo7), season start ≥ 2002: 2002-03 … 2025-26 minus 2019-20
    = **23 seasons**; ~15 series × ~5.7 games ≈ ~85 games/season ⇒ ~**1,960 games**.
  - Pre-2003 (first round bo5, rest bo7), start ≤ 2001: 1985-86 … 2001-02 = **17 seasons**;
    ~8 bo5 series × ~4.3 ≈ 34 + ~7 bo7 series × ~5.7 ≈ 40 ⇒ ~74 games/season ⇒ ~**1,260**.
  - **Total ≈ 3,200 playoff games** (plus ~a handful of play-in games/season from 2020-21).

> **Headline constraint:** the *modeling* sample is the **~600 series**, not the ~3,200
> games. Everything in §5 is sized to "low hundreds of labeled series." All counts are
> estimates; treat ingestion's actual numbers as authoritative.

### 4.3 What ingestion must do (specification)
A **new, separate ingestion path** (do not loosen the regular-season scripts in place):

1. **Source:** same as today — `nba_api` `LeagueGameFinder`, `league_id="00"`, but with
   `season_type_nullable = "Playoffs"` (and the existing CDN path for the current
   postseason). Reuse `_pair_games_dataframe` / pairing logic.
2. **Season types:** request **Playoffs** explicitly (the regular-season path stays
   `["Regular Season"]` — unchanged).
3. **ID prefix gate:** keep **only `004`-prefixed** stats IDs (the playoff analogue of the
   existing `002` gate). Add an `is_playoff_game_id` helper mirroring
   `is_regular_season_game_id` (`fetch_schedule.py:135`); do not modify that function.
4. **Tagging:** set `game_type` via the **existing** `get_game_type`
   (`fetch_schedule.py:148`): `004` + month ≥ 6 ⇒ `finals`, else `playoffs`. These values
   already exist in the schema (`games.gameType` default `'regular'`, `schema.ts:47`).
5. **How far back:** all in-scope seasons (1985-86 … current), **2019-20 excluded**
   (mirror the existing skip at `fetch_schedule.py:69`). 2020-21 included.
6. **Upsert discipline:** reuse `INSERT … ON CONFLICT (external_id) DO UPDATE`
   (`fetch_schedule.py:331`). Because playoff rows carry **`004` external IDs**, they can
   **never collide** with regular-season `002` rows. This is the structural guarantee that
   ingestion cannot mutate an existing regular-season row.
7. **Hard isolation requirement:**
   - Ingestion **must not modify existing regular-season `games` rows** — guaranteed by the
     `002` vs `004` external-id namespace (point 6).
   - Ingestion **must not modify existing regular-season `fatigue_scores`** — playoff
     fatigue (if computed at all) is only ever needed at **series openers** for
     `entry_rest_diff`, and even a full fatigue recompute cannot alter a regular-season
     row because playoff games are chronologically *after* the regular season and thus
     never enter a regular-season game's 30-day backward lookback
     (`fetchRecentGamesForTeam`, `lt(games.date, gameDateStr)`).
   - If we compute and store playoff fatigue rows for openers, they are **never surfaced**
     by existing pages because every read query filters `game_type = 'regular'` (§6).

---

## 5. Small-data constraint & model bake-off protocol

### 5.1 The constraint, quantified
~**600 labeled series** (§4.2). With ~5–7 features (§3), this is firmly in the regime where
**high-variance / high-capacity models overfit** and where a held-out test set of one or
two recent seasons is only ~15–30 series — too small to *select* on. This drives every
choice below: prefer **bias over variance**, prefer **interpretable** models, and **never**
let the test set influence model choice.

### 5.2 Candidate models (3–5 incl. baselines)
1. **Baseline A — "home-court team always wins"** (predict `y=1`). The floor; equals the
   intercept-only model under the §1 encoding.
2. **Baseline B — "higher seed wins"** (predict by `seed_diff` sign). A second, stronger
   naive floor the model must beat.
3. **Plain logistic regression** — the interpretable thesis model. Coefficients read
   directly as log-odds contributions of `entry_rest_diff`, `win_pct_diff`, etc.
4. **Regularized logistic regression (L2; optionally L1)** — same interpretability with
   shrinkage; the most likely winner at this sample size. L1 doubles as feature selection.
5. **One tree-based model (gradient boosting *or* random forest)** — to check whether
   non-linearities/interactions (e.g. rest mattering only in close-seed series) buy
   anything. Expected to be the overfit risk; included as a ceiling check, not a favorite.

### 5.3 Evaluation — walk-forward (temporal) cross-validation
- **No random k-fold.** Use **walk-forward CV by season**: train on seasons `≤ t`,
  validate on season `t+1`, advance. This respects time order and prevents leakage from
  future seasons into past predictions.
- **Model selection on validation folds ONLY.** Hyperparameters (regularization strength,
  tree depth/count) and the feature subset are chosen by mean validation log-loss/accuracy
  across walk-forward folds — never by looking at the test set.
- **Held-out TEST set:** the **most recent N seasons** (recommend the last **3** in-scope
  seasons, ~45 series) are **quarantined** and touched **exactly once**, at the very end,
  to report final numbers for the already-selected model.
- **Leakage guards specific to this domain:**
  - Standings/seed/win% features for season *t* use **only** season *t* regular-season
    games (no future).
  - `entry_rest_diff` uses only games at or before each team's pre-series game.
  - No series outcome (games won, series length) may leak into features — features are
    "as known before Game 1."

### 5.4 Anti-leakage warning (explicit)
**Do not select the model by test-set performance.** Comparing 5 models on the test set and
keeping the best is multiple-comparisons / test-set leakage and will report an optimistic
accuracy that won't generalize — doubly dangerous with only ~15–45 test series. The test
set validates **one** pre-chosen model. When two models are within noise on the
**validation** folds, **interpretability is the tiebreaker** — i.e. prefer (regularized)
logistic regression over the tree model. This matches the portfolio thesis ("explain *why*
rest matters"), not just raw accuracy.

### 5.5 Metrics
- **Accuracy** — headline, but read against the baselines (a coin flip on series with a
  strong favorite is ~65–70%, so absolute accuracy alone is misleading).
- **Log-loss** — primary selection metric; rewards calibrated probabilities, which is what
  the `/playoffs` UI will display.
- **Lift over baselines** — the model **must beat Baseline B ("higher seed wins")** on
  validation, otherwise it adds nothing. Report accuracy/log-loss deltas vs both baselines.
- (Optional) Brier score / a reliability curve for calibration, since we surface a
  probability.

---

## 6. Architecture & schema

### 6.1 Guiding principle
The Playoff Predictor is an **additive, isolated module**. It introduces new tables and a
new page; it does not touch `fatigue.ts`, does not rename the rest-advantage metric, and
relies on the existing `game_type = 'regular'` filtering so **no playoff data ever appears
in the regular-season product**.

### 6.2 Database — new tables (one new Drizzle migration)
Per-game playoff rows live in the **existing `games` table** (tagged `playoffs`/`finals`),
which is what makes `entry_rest_diff` derivable. Two **new** tables hold the series grain:

**`playoff_series`** — one row per series (the modeling unit):
- `id` (pk), `season` (varchar, `"YYYY-YY"`), `round` (smallint: 1=R1 … 4=Finals),
  `conference` (varchar, null for Finals),
- `home_court_team_id` → `teams.id`, `opponent_team_id` → `teams.id`,
- `is_best_of_7` (boolean), `series_winner_team_id` → `teams.id` (null until resolved),
- `home_court_wins` (smallint), `opponent_wins` (smallint),
- derived feature columns or a computed-at-train-time view — recommend storing the raw
  inputs (`seed_diff`, `win_pct_diff`, `entry_rest_diff`, `h2h_diff`) for reproducibility,
- `external_series_key` (varchar, unique) — deterministic `season:round:team:team` so
  ingestion is idempotent (same `ON CONFLICT DO UPDATE` discipline as `games`).

**`playoff_series_predictions`** — model output surfaced to the app (mirrors the spirit of
the existing `predictions` table, `schema.ts:103`, **without reusing it** — that table is
per-game and rest-advantage-specific):
- `id` (pk), `series_id` → `playoff_series.id`,
- `predicted_winner_team_id` → `teams.id`,
- `win_probability` (decimal, the home-court team's P(win) or the predicted team's P),
- `model_version` (varchar), `created_at` (timestamp).

**Migration must mirror existing security patterns** so Supabase's Data API keeps working
(deadlines in [DATABASE.md](DATABASE.md) / `drizzle/0005_supabase_grants.sql`):
- Add `ENABLE ROW LEVEL SECURITY` + "Allow public read" (SELECT `using (true)`) +
  "Allow service role all" policies for both new tables, mirroring
  `drizzle/0004_enable_rls.sql`.
- Add `grant select … to anon` and `grant select, insert, update, delete … to service_role`
  for both new tables, mirroring `drizzle/0005_supabase_grants.sql`.

### 6.3 Where ML code lives
- **Training is Python/scikit-learn**, in a **new top-level `ml/` directory** (the app's
  model code in `src/lib/fatigue.ts` is TypeScript, but model *training* belongs in
  Python alongside the existing `scripts/` pipeline tooling). Suggested layout:
  - `ml/build_series_dataset.py` — read `games` (playoff + regular) via `DATABASE_URL`,
    derive series rows + features, write/refresh `playoff_series`.
  - `ml/train_playoff_model.py` — walk-forward CV, model bake-off, persist the selected
    fitted model (e.g. `ml/artifacts/playoff_model_<version>.pkl`) + a metrics report.
  - `ml/predict_series.py` — load the chosen model, write rows into
    `playoff_series_predictions`.
- Reuses the existing env contract: `DATABASE_URL` from env, else `.env.local` /
  `scripts/.env` (same as `daily_update.py:51`). Python deps added to `requirements.txt`
  (add `scikit-learn`; `pandas`/`psycopg2-binary` already present).

### 6.4 How predictions reach the Next.js app
Same shape as the rest of the product: **Python writes to the DB, the app reads.**
- New API route under `src/app/api/` (e.g. `/api/playoffs`) using the standard
  `{ data, error }` envelope and `getPublicApiErrorMessage` (`src/lib/api-errors.ts`),
  reading `playoff_series` + `playoff_series_predictions` via a new query module (e.g.
  `getPlayoffSeriesWithPredictions`) in `src/lib/db/queries.ts`.
- New page **`/playoffs`** (separate from `/`, `/analysis`, `/upcoming`), added to the nav.
  It is the **only** surface that reads playoff data.

### 6.5 Isolation from the regular-season product (verified mechanisms)
- Every existing read query already pins `eq(games.gameType, "regular")` (e.g.
  `getGamesByDate` `queries.ts:198`, `getGameById` `:381`, `getCompletedGamesWithFatigue`
  `:547`, `searchRegularSeasonGames` `:744`, upcoming `:907`) **and** the calendar guard
  `gameDateWithinRegularSeasonCalendar` (Oct 1–Apr 30, `queries.ts:51`). Playoff rows are
  tagged `playoffs`/`finals` and dated May/June, so they are excluded **twice**. No change
  to these queries is required or permitted.
- The new playoff queries are the inverse: they filter to `game_type IN ('playoffs',
  'finals')` and never join into the regular-season pages.
- The **rest-advantage metric is untouched** — `calculateRestAdvantage`, the
  `restAdvantage*` fields, `RestAdvPanel`, `formatRestAdvantageDisplay`, and the "REST
  ADVANTAGE"/"RA" labels keep their names. `entry_rest_diff` is a *new, separately named*
  series feature; it is not a rename of the metric.

---

## 7. Open questions (need a human decision)

- **Seed source of truth:** derive seed from regular-season standings (and which
  tiebreaker rules per era?) or ingest an authoritative bracket/seed list? Eras differ
  (division-winner seeding pre-2016; play-in from 2020-21).
- **Play-in rows:** ingest play-in games as `game_type` = a new value (e.g. `play_in`) vs.
  folding them under `playoffs`? They must feed `entry_rest_diff` but must **not** become
  series targets. A distinct tag is cleaner but adds a `game_type` value.
- **Series-format flag precision:** confirm the locked "bo5 pre-2003" maps to *first-round
  only* (as modeled in §3.6), and confirm no other in-scope round was ever bo5.
- **Lockout/COVID-shortened seasons** (1998-99, 2011-12, 2020-21): keep `win_pct` and
  `h2h` as-is, or normalize? `h2h_diff` may be based on <4 meetings.
- **Test-set size:** confirm holding out the last **3** seasons (~45 series) vs **2** — a
  trade-off between a usable test estimate and keeping recent seasons in training.
- **Prediction timing/UX:** does `/playoffs` show predictions only *before* each series
  (locked at Game 1), and does it re-predict each round as the bracket resolves? This
  affects whether `predict_series.py` runs on a cron (cf. existing daily pipeline) or
  on-demand per round.
- **Headline feature variant:** ship raw `entry_rest_diff` (days) as the interpretable
  headline, or the `calculateFatigue`-based Game-1 rest-advantage differential, or both?

---

## Self-review

Re-read against the actual codebase (`fatigue.ts`, `fatigue-recent-games.ts`,
`queries.ts`, `schema.ts`, `nba-season.ts`, `fetch_schedule.py`, `backfill_game_types.py`,
`daily_update.py`, `drizzle/0004`–`0005`). Each acceptance criterion below is addressed,
specific, and consistent with the code.

| # | Criterion | Pass | Notes / assumptions |
|---|---|---|---|
| 1 | Problem framing & target encoding | ✅ | Recommends **home-court-team-wins** binary encoding with justification vs higher-seed; sign convention stated. Grounded in `calculateRestAdvantage` (`fatigue.ts:545`) and the home/away product model. |
| 2 | Critical fatigue insight (within-series symmetry) | ✅ | Stated explicitly: identical days-rest + near-identical travel ⇒ within-series RA ≈ 0 ⇒ `NEUTRAL_THRESHOLD = 0.5` (`queries.ts:21`) flags all "neutral"; the asymmetric signal is **entry rest** (rust-vs-rest). Verified `fetchRecentGamesForTeam` has **no `game_type` filter** (`fatigue-recent-games.ts:58–65`), enabling Game-1 entry-rest from existing code. |
| 3 | Feature set with precise definitions | ✅ | `entry_rest_diff` (headline, incl. play-in & bye handling), `seed_diff`, `win_pct_diff`, `has_home_court` (folded into label), `h2h_diff`, `is_best_of_7` — each with formula, orientation, and an availability column (existing vs new ingestion). |
| 4 | Data gap analysis | ✅ | Confirms **0 playoff rows** today from code (`SEASON_TYPES` `:78`, `002` gate `:135`, `get_game_type` `:148`); estimates **~600 series / ~3,200 games** over **40 in-scope seasons** (2019-20 excluded, `nba-season.ts:8`); specifies source/season-type/`004` prefix/tagging/back-extent and the **hard non-modification** guarantees (002 vs 004 namespace; chronology protects reg-season fatigue). Counts since **verified 2026-06-29** (read-only `SELECT`): **600 series / 3,145 `004` games** (2,827 playoffs + 318 finals) + **36 `005` play-in** — matching the estimate. |
| 5 | Small-data constraint & bake-off protocol | ✅ | Quantifies ~600 series; lists 5 candidates (2 baselines + plain LR + regularized LR + one tree model); specifies **walk-forward CV**, selection on validation only, **test touched once** on last 3 seasons; explicit anti-test-leakage warning with **interpretability as tiebreaker**; metrics = accuracy, log-loss, **lift over baselines** (must beat "higher seed wins"). |
| 6 | Architecture & schema | ✅ | New `playoff_series` + `playoff_series_predictions` tables (with RLS + grants mirroring `drizzle/0004`/`0005`); per-game rows in existing `games` (tagged); ML in new **`ml/`** Python/scikit-learn dir; predictions surfaced via new API route + `/playoffs` page (Python writes, app reads); isolation via existing `game_type='regular'` + calendar guards (`queries.ts:198,381,547,744,907,51`); **rest-advantage metric not renamed.** |
| 7 | Open questions | ✅ | Bulleted: seed source, play-in tagging, format-flag precision, shortened seasons, test-set size, prediction timing/UX, headline-feature variant. |

**Assumptions made (flagged for the human):** (a) ~5.7 avg games/bo7 series and ~4.3/bo5
are league-historical rules of thumb, used only to size the sample; (b) the locked
"best-of-5 pre-2003" is interpreted as *first round only*, consistent with NBA history
(Open Question raised to confirm); (c) home-court holder is cleanly derivable once games
are ingested (Game-1 host); (d) play-in games will be ingested as per-game substrate but
never modeled as series targets. All seven criteria **pass**.
