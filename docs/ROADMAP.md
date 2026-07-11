# Roadmap

Forward-looking plan for FullCourt. Both modeled products are now **complete**: the **Shot
Quality Model** shipped 2026-07-02 and the **Playoff Predictor** shipped end-to-end (ingest through
`/playoffs` UI), verified against the live DB and `ml/PHASE3_REPORT.md` on 2026-07-02 (see below).
The closing **Portfolio wrap-up** offers two tracks — **Track A (Minimum wrap) is the chosen path**
for a clean portfolio first impression.

Live-DB facts (verified 2026-07-02, read-only `SELECT`s): **3,145 `004`** (2,827 `playoffs` + 318
`finals`) **+ 36 `005` play-in** game rows; **600 `playoff_series` rows**, all four feature columns
non-NULL, **599 trainable**; **1,049 `playoff_series_predictions` rows** (599 `full_insample` + 450
`walk_forward_oos`, `model_version = "logistic_unreg_v1"`).

---

## Where the Playoff Predictor sits right now — ✅ COMPLETE (shipped, verified 2026-07-02)

Design: [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md). It is an **additive, isolated**
module — it never touches `src/lib/fatigue.ts`, never renames the rest-advantage metric, and the
regular-season product never reads its data.

**Done in code (HEAD), all phases:**
- **Phase 1 — playoff ingest.** `scripts/fetch_playoffs.py` ingests `004` playoff/finals games into
  `games` (separate path; reuses `fetch_schedule.py` helpers; ET dates).
- **Phase 1b — play-in ingest.** `scripts/fetch_play_in.py` ingests `005` play-in games tagged
  `game_type='play_in'` (per-game substrate only; never a series target).
- **Phase 2a — series table.** `playoff_series` in `src/lib/db/schema.ts` +
  `drizzle/0006_playoff_series.sql` (RLS + grants), and `playoff_series` is in
  `drizzle.config.ts`'s `tablesFilter`.
- **Phase 2b-i — series skeleton builder.** `ml/build_series_dataset.py` groups `004` games into
  series, derives round (backward bracket walk validated against `[8,4,2,1]`), winner,
  `is_best_of_7`, and conference, and upserts them — writing only the skeleton columns.
- **Phase 2b-ii — feature computation.** `ml/compute_series_features.py` writes **only** the four
  `*_diff` columns (`seed_diff`, `win_pct_diff`, `entry_rest_diff`, `h2h_diff`) in a separate
  upsert, so it never clobbers the skeleton and vice versa. All 600 series rows have all four
  features populated [Verified, live DB `SELECT`, 2026-07-02].
- **Phase 3 — model training & evaluation.** `ml/train_series_model.py`: expanding-window
  walk-forward by season (30 eval folds, 1995-96…2025-26, 450 pooled predictions), baselines +
  plain/L2 logistic + depth-2/3 trees. **Model of record: unregularized logistic** — pooled
  accuracy 0.7467 vs. the 0.7444 majority-home-court baseline (not distinguishable — paired
  per-season W/T/L 11/11/8), but log-loss 0.5696 → 0.4959 (≈13% relative) and Brier 0.1907 → 0.1638
  (≈14% relative) — a **calibration** win, not a classification win. Full writeup:
  [`ml/PHASE3_REPORT.md`](../ml/PHASE3_REPORT.md).
- **Phase 4 — prediction persistence.** `playoff_series_predictions` (`drizzle/0007`, in
  `schema.ts`) holds `predicted_home_court_win_prob`, `predicted_winner_team_id`,
  `prediction_method` (`full_insample` / `walk_forward_oos`), `model_version`.
  `ml/predict_series.py --write` has run: **1,049 rows** (599 `full_insample` + 450
  `walk_forward_oos`) [Verified, live DB `SELECT`, 2026-07-02].
- **Phase 5 — serving (API + UI).** `GET /api/playoffs` ([API.md](API.md)) backed by
  `getPlayoffSeriesWithPredictions` in `src/lib/db/queries.ts`; `/playoffs` page + nav link
  ([FRONTEND.md](FRONTEND.md)) showing an OOS-vs-in-sample accuracy header and expandable
  per-series feature cards.

**Open items from [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md) §7** that were
resolved implicitly by the shipped code (not separately re-litigated): seed source = regular-season
Win%-rank proxy; play-in tagging = `game_type='play_in'`; test strategy = walk-forward-by-season
(no fixed holdout); headline feature variant = raw `entry_rest_diff` (days).

---

## Shot Quality Model — ✅ COMPLETE (shipped 2026-07-02)

Design + full build record: [SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md) (§7 has a
phase-by-phase gate summary with real numbers). An additive, isolated module — expected shot
value (xeFG%) by half-court grid cell, built ahead of the Playoff Predictor's then-remaining
phases despite the original "later / stretch, after Playoff Predictor" sequencing (both modules
are now complete; see above).

- **Pipeline:** `scripts/collect_shot_data.py` → `scripts/aggregate_shot_grid.py` →
  `scripts/sq4_train_shot_value.py` / `scripts/sq4b_train_gbm.py` → `scripts/sq5_write_surface.py`.
  See [DATA_PIPELINE.md](DATA_PIPELINE.md).
- **Storage:** `shot_grid` + `shot_value_surface` (migration `0008`, hand-applied). See
  [DATABASE.md](DATABASE.md).
- **Serving:** `GET /api/shot-quality` ([API.md](API.md)) → `/shot-quality` page + nav link
  ([FRONTEND.md](FRONTEND.md)).
- **Headline result:** a location-only GBM beats the zone-average baseline on walk-forward
  log-loss/Brier by ~1% — a calibration win, not a large accuracy jump (honest framing preserved
  from the original design). No defender distance or shot-clock data (absent from public NBA
  data).

---

## Portfolio wrap-up — two tracks

This feeds a recruiting portfolio, so "done and honest" beats "half-built and broad." Pick one.

### Track A — Minimum wrap  *(CHOSEN PATH)*
Goal: a polished, internally-consistent portfolio with no visible loose ends, and the predictor
either finished to a small honest milestone *or* cleanly parked.

1. ~~Park or finish the predictor cleanly.~~ **Done** — shipped end to end (ingest → features →
   walk-forward model → predictions → `/playoffs` UI); see "Where the Playoff Predictor sits right
   now" above.
2. **Clear first-impression loose ends:**
   - ✅ **Removed the dead `/api/analysis/accuracy`** endpoint and its orphaned query fns
     (`getResolvedPredictions`, `getUpcomingPredictionsForSeason`) + `Accuracy*` types
     (2026-06-29; grep-confirmed nothing else imported them).
   - ✅ **Migrated the two glassmorphism components** (`upcoming-content.tsx`,
     `explore-game-detail-modal.tsx`) to the terminal style — the UI is now visually consistent.
   - ✅ **Removed the `TeamRow` no-op shim** (`matchup-card.tsx`) and its modal import.
   - ✅ **Wired the `SEASON WIN RATE` stat card to the live value** (`src/app/page.tsx`) — it now
     fetches `overallWinRate` from `/api/analysis` via SWR (same number `/analysis` shows), so the
     old hardcoded `SEASON_WIN_RATE = "53.5"` constant is gone. (The decorative hardcoded nav
     ticker this note used to flag was since removed entirely in the Broadcast dark redesign.)
3. **Make "tested" true in CI.** Add a small GitHub Actions workflow running `pnpm test:run` +
   `pnpm lint` (and optionally Playwright against a seeded DB) so the README's testing claim is
   backed by CI.
4. **Polish the README.** Add the screenshot/GIF (placeholder already in `README.md`); it is the
   highest-impact portfolio item.

### Track B — Full completion
Everything in Track A, plus:
1. ~~Ship the Playoff Predictor end to end~~ **Done** — Phases 2b-ii → 5 all shipped; walk-forward
   logistic did **not** distinguishably beat the majority-home-court baseline on accuracy (paired
   11/11/8), but did on calibration (log-loss/Brier down ~13–14%) — see above and
   [`ml/PHASE3_REPORT.md`](../ml/PHASE3_REPORT.md).
2. ~~Begin the Shot Quality Model as a second modeled product.~~ **Done** — see above.
3. **Full CI/CD** — tests + lint + e2e in CI, and confirm in-season data freshness (Vercel cron
   switched to daily per [DATA_PIPELINE.md](DATA_PIPELINE.md)).
4. **Keep the docs synced to the live DB.** The 2026-07-02 read-only audit folded current counts
   back into the docs (games-by-type, 600 series with features populated, 1,049 predictions,
   fatigue coverage); re-verify after each new ingest / feature pass.
