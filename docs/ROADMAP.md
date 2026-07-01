# Roadmap

Forward-looking plan for FullCourt. The **Playoff Predictor** is the active module; the **Shot
Quality Model** is a later (stretch) item. The closing **Portfolio wrap-up** offers two tracks —
**Track A (Minimum wrap) is the chosen path** for a clean portfolio first impression.

Everything below is grounded in the current code. Live-DB facts were **verified 2026-06-29** via
read-only `SELECT`s: **2,827 `playoffs` + 318 `finals` (`004`) + 36 `play_in` (`005`)** game rows
(tag-integrity guard = 0 prefix↔`game_type` mismatches), **600 series rows** built, and **all four
feature columns NULL** across every series (Phase 2b-i state).

---

## Where the Playoff Predictor sits right now

Design: [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md). It is an **additive, isolated**
module — it never touches `src/lib/fatigue.ts`, never renames the rest-advantage metric, and the
regular-season product never reads its data.

**Done in code (HEAD):**
- **Phase 1 — playoff ingest.** `scripts/fetch_playoffs.py` ingests `004` playoff/finals games into
  `games` (separate path; reuses `fetch_schedule.py` helpers; ET dates).
- **Phase 1b — play-in ingest.** `scripts/fetch_play_in.py` ingests `005` play-in games tagged
  `game_type='play_in'` (per-game substrate only; never a series target).
- **Phase 2a — series table.** `playoff_series` in `src/lib/db/schema.ts` +
  `drizzle/0006_playoff_series.sql` (RLS + grants), and `playoff_series` is in
  `drizzle.config.ts`'s `tablesFilter`.
- **Phase 2b-i — series skeleton builder.** `ml/build_series_dataset.py` groups `004` games into
  series, derives round (backward bracket walk validated against `[8,4,2,1]`), winner,
  `is_best_of_7`, and conference, and upserts them — **deliberately leaving the four feature
  columns NULL**.

**Current position:** between **Phase 2b-i (done)** and **Phase 2b-ii (not started)**. The four
feature columns (`seed_diff`, `win_pct_diff`, `entry_rest_diff`, `h2h_diff`) are NULL by design, and
nothing downstream of the skeleton (features, model, predictions, UI) exists yet.

> **Confirmed (2026-06-29):** Phases 1 + 1b + 2a + 2b-i have all run against the live DB — 3,145
> `004` games + 36 `005` play-in rows are present, and `build_series_dataset.py` produced 600
> series (599 resolved; one 1986-87 series short a single historical game) with no win-tally
> inconsistencies. So Phase 2b-ii's `entry_rest_diff` (which needs play-in rows present) has its
> prerequisite satisfied.

---

## Remaining Playoff Predictor phases (4)

### ▶ Phase 2b-ii — Feature computation pass  *(CURRENT / NEXT)*
Populate the four NULL columns in `playoff_series` with a new pass (e.g. `ml/build_series_features.py`)
whose upsert writes **only** those columns (so it never clobbers the skeleton, and the skeleton
builder never clobbers it):
- `entry_rest_diff` (headline rust-vs-rest signal) — reuse `fetchRecentGamesForTeam` semantics at
  each series opener (no `fatigue.ts` change); first-round entry-rest needs Phases 1 + 1b ingested.
- `win_pct_diff`, `h2h_diff` — derive from existing regular-season `games` rows.
- `seed_diff` — needs a seed source of truth (**§7 open question**: derive from standings vs ingest
  a bracket).
- First resolve the relevant §7 open questions (seed source; win%/h2h handling for the
  1998-99 / 2011-12 / 2020-21 shortened seasons).

### Phase 3 — Model training & evaluation
`ml/train_playoff_model.py`: baselines (home-court-always-wins; higher-seed-wins) + plain logistic +
L2/L1-regularized logistic + one tree model; **walk-forward CV by season**; model selection on
validation folds only; the most recent ~3 seasons quarantined as a test set touched once; report
accuracy / log-loss / **lift over baselines**. Add `scikit-learn` to `requirements.txt`; persist the
fitted model + a metrics report.

### Phase 4 — Prediction persistence
New `playoff_series_predictions` table (new migration mirroring `0004`/`0005` RLS + grants; add to
`tablesFilter`) holding `predicted_winner_team_id`, `win_probability`, `model_version`. New
`ml/predict_series.py` loads the selected model and writes rows. (This table does **not** exist
today.)

### Phase 5 — Serving (API + UI)
New `/api/playoffs` route (`{ data, error }` envelope + `getPublicApiErrorMessage`) backed by a new
`getPlayoffSeriesWithPredictions` query in `src/lib/db/queries.ts`; new `/playoffs` page + a nav link
in `nav-bar.tsx`. This is the **only** surface that reads playoff data.

**Plus** the open decisions in [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md) §7 (seed
source, play-in tagging — already locked to `play_in`, format-flag precision, shortened seasons,
test-set size, prediction timing/UX, headline-feature variant).

---

## Later (stretch) — Shot Quality Model

A separate future module (expected points by shot location + difficulty), sequenced **after** the
Playoff Predictor. Out of scope for the current build; it requires shot-level data not in the schema
today and would be its own ingest + modeling track. Listed on the README roadmap; **no design doc or
code exists yet.**

---

## Portfolio wrap-up — two tracks

This feeds a recruiting portfolio, so "done and honest" beats "half-built and broad." Pick one.

### Track A — Minimum wrap  *(CHOSEN PATH)*
Goal: a polished, internally-consistent portfolio with no visible loose ends, and the predictor
either finished to a small honest milestone *or* cleanly parked.

1. **Park or finish the predictor cleanly.** Either (a) complete **Phase 2b-ii** + a minimal
   **baseline-vs-logistic** writeup (no UI) as a documented milestone, or (b) explicitly park it:
   keep the ingest + skeleton, document the NULL feature state, and ship no half-built UI. Either
   way, leave no dead `/playoffs` stub.
2. **Clear first-impression loose ends:**
   - ✅ **Removed the dead `/api/analysis/accuracy`** endpoint and its orphaned query fns
     (`getResolvedPredictions`, `getUpcomingPredictionsForSeason`) + `Accuracy*` types
     (2026-06-29; grep-confirmed nothing else imported them).
   - ✅ **Migrated the two glassmorphism components** (`upcoming-content.tsx`,
     `explore-game-detail-modal.tsx`) to the terminal style — the UI is now visually consistent.
   - ✅ **Removed the `TeamRow` no-op shim** (`matchup-card.tsx`) and its modal import.
   - ✅ **Wired the `SEASON WIN RATE` stat card to the live value** (`src/app/page.tsx`) — it now
     fetches `overallWinRate` from `/api/analysis` via SWR (same number `/analysis` shows), so the
     old hardcoded `SEASON_WIN_RATE = "53.5"` constant is gone. Still open: the decorative hardcoded
     nav ticker, so its numbers aren't mistaken for live values.
3. **Make "tested" true in CI.** Add a small GitHub Actions workflow running `pnpm test:run` +
   `pnpm lint` (and optionally Playwright against a seeded DB) so the README's testing claim is
   backed by CI.
4. **Polish the README.** Add the screenshot/GIF (placeholder already in `README.md`); it is the
   highest-impact portfolio item.

### Track B — Full completion
Everything in Track A, plus:
1. **Ship the Playoff Predictor end to end** — Phases 2b-ii → 5, including the `/playoffs` page and
   a calibrated probability per series, beating the "higher seed wins" baseline on validation.
2. **Begin the Shot Quality Model** as a second modeled product.
3. **Full CI/CD** — tests + lint + e2e in CI, and confirm in-season data freshness (Vercel cron
   switched to daily per [DATA_PIPELINE.md](DATA_PIPELINE.md)).
4. **Keep the docs synced to the live DB.** The 2026-06-29 read-only audit folded current counts
   back into the docs (games-by-type, 600 series, NULL features, fatigue coverage); re-verify after
   each new ingest / feature pass.
