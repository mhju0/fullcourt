# Shot Quality Model — Design & Build Record

> **Status (2026-07-02): BUILT.** All phases SQ-0…SQ-7 are complete — code, schema (migration
> `0008`, hand-applied), a live `GET /api/shot-quality` route, and a `/shot-quality` page + nav
> link all exist. This document was originally written as a pre-build design draft (§1–§8 below
> are preserved as written, since the human answered every open decision in §8 by simply building
> it) with the phasing table in §7 now annotated with what each phase actually produced, and a
> **"Actual build vs. design" note** appended after §8 covering the two places the shipped build
> diverged from this sketch. It mirrors the shape and discipline of
> [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md) — the honest-framing,
> baseline-to-beat, walk-forward, and additive-isolation conventions are deliberately reused.
>
> This was the **later / stretch module** on the [ROADMAP.md](ROADMAP.md); it is now complete
> there too. Nothing in the shipped build touches `src/lib/fatigue.ts` or renames the
> rest-advantage metric — see the isolation guarantees in §7.
>
> **Evidence tags:** `[Verified <file>]` = read from a probe/source/build-output file;
> `[Inferred]` = reasoned estimate; `[Unknown]` = not re-confirmed in the build-record pass.

---

## 0. What the probes already established (do not re-verify by calling APIs)

Both facts below are ground truth from completed SQ-0 probes — cited, not re-derived.

- **Per-shot data exists and is rich.** `ShotChartDetail` returns one row per shot attempt with
  `LOC_X` / `LOC_Y` (units ≈ 1/10 ft, origin at the hoop), `SHOT_DISTANCE`, `SHOT_TYPE`
  (2PT/3PT), `ACTION_TYPE` (e.g. "Jump Shot"), `SHOT_ZONE_BASIC` / `SHOT_ZONE_AREA` /
  `SHOT_ZONE_RANGE`, and `SHOT_MADE_FLAG` (made/miss), plus `PERIOD`, `GAME_ID`, `PLAYER_ID`,
  `TEAM_ID`, `GAME_DATE`, `HTM`/`VTM`. **Defender distance is ABSENT. Shot clock is ABSENT.**
  [Verified ml/shot_data_probe.txt §3]
- **Coordinate data reaches back to 1996-97.** 1996-97 / 2005-06 / 2013-14 / 2023-24 all return
  usable non-zero `LOC_X`/`LOC_Y`; **1990-91 returns 0 rows with no LOC columns.** The exact
  cutoff between 1990-91 and 1996-97 was **not** tested. [Verified ml/shot_data_probe.txt §5]
- **Scale (order of magnitude).** One team-season (2023-24) = **7,177** shots ⇒ ~**215k**
  shots/season league-wide ⇒ ~**8.6M** shots across ~40 seasons. [Verified ml/shot_data_probe.txt §4]
- **API speed.** ~**1.1s/call** average, no throttle observed at a 1.5s polite delay.
  [Verified ml/shot_data_probe.txt §6]
- **Defender proximity / tracking is NOT per-shot and NOT joinable.** Closest-defender data
  exists only as **aggregated player × season × distance-bucket splits**
  (`LeagueDashPtDefend`, `LeagueDashPlayerPtShot` via `close_def_dist_range_nullable`), with
  **no `GAME_ID` and no per-shot identifier** to join back to `ShotChartDetail`. Tracking is
  usable only from ~**2013-14** (2009-10 returns 0 rows). **Conclusion already made: a per-shot
  contested-shot model is not feasible on public `nba_api`. This module is location-only, with
  no tracking/defender features.** [Verified ml/shot_defend_probe.txt §2–4]

Everything downstream is designed around those five facts.

---

## 1. Purpose & honest framing

### What this model IS
A **location-based expected shot value** model: it estimates, for a field-goal attempt,
`P(make)` as a function of **where the shot was taken** (`LOC_X`/`LOC_Y`, `SHOT_DISTANCE`,
`SHOT_ZONE_*`) and **what kind of shot** it was (`SHOT_TYPE`, `ACTION_TYPE`), optionally
conditioned on cheap context (period, home/away, season). From `P(make)` and the shot's point
value (2 vs 3, derivable from `SHOT_TYPE`) it produces an **expected effective FG%** and an
**expected points per attempt (xPPS)** surface, and lets us compute a team's / season's
**shots-above-expected** (actual eFG% − expected eFG%).

### What this model is NOT
It is **not** a "shot quality" model in the tracking-era sense. It has **no defender proximity
and no shot clock** [Verified ml/shot_defend_probe.txt], so it cannot say a shot was
*contested* or *rushed* — only that it came from a location/zone with a certain historical
make rate. Calling it plain "Shot Quality" would overclaim exactly the dimension the data
lacks.

### Recommended name — **"Expected Shot Value (xeFG%)"**
The same discipline the Playoff Predictor doc applied ("calibration win, not classification
win") applies here. A single make/miss is close to a coin flip within any zone, so the honest
value is **a calibrated probability surface and the derived expected-eFG% / xPPS metric**, not
per-shot classification accuracy. An honest name should advertise *expected value from
location*, not *quality/contestedness*. Naming is an open decision — see §8.

| Name option | Pro | Con |
|---|---|---|
| **Expected Shot Value (xeFG%)** *(recommended)* | Honest about what it measures (expected value by location); parallels public "xG" framing; sets calibration (not accuracy) as the bar | Slightly less catchy than "Shot Quality" |
| "Shot Quality Model" (roadmap working name) | Matches the existing README/roadmap label | Implies contestedness/difficulty the data cannot capture — an honest-framing liability |
| "Shot Location Value" / "Location eFG%" | Maximally literal | Bland; "xeFG%" already conveys location implicitly |

---

## 2. Data source & scope

### Source
**`ShotChartDetail` is the sole source** [Verified ml/shot_data_probe.txt]. No tracking
endpoints are used (they can't be joined per-shot — §0). This is a **new, separate ingest
path**, mirroring how the Playoff Predictor added `fetch_playoffs.py` without loosening the
regular-season scripts.

### Season range — options
Coordinates are usable **1996-97 → present** [Verified ml/shot_data_probe.txt §5]. So the full
reach is ~**30 seasons** (1996-97 … 2025-26), not the 40 the fatigue product spans (fatigue
reaches 1985-86, but shots do not exist pre-1996-97).

| Scope option | Seasons | Approx. shots | Trade-off |
|---|---|---|---|
| **Full coordinate era (1996-97→present)** *(recommended)* | ~30 | ~**6.5M** [Inferred, from 215k/season] | Maximum spatial/temporal richness; captures the pre- and post-3PT-revolution regime shift, which is itself interesting to visualize. Largest storage/collection cost. |
| Trimmed recent (e.g. 2013-14→present) | ~13 | ~**2.8M** [Inferred] | Aligns with the tracking era (even though we don't use tracking), smaller footprint, most relevant to modern shot selection. Loses the historical arc. |
| Single-decade / demo slice (e.g. last 5) | ~5 | ~**1.1M** [Inferred] | Cheapest; good enough to demo the method. Weakest as a portfolio "we modeled 30 years" story. |

**Recommendation:** collect the **full coordinate era** into a local cache (cheap to store
locally; see §3), then let the **storage** decision (§3) — not the collection decision — bound
what actually lands in Supabase. Decoupling "what we pull" from "what we persist to Postgres"
keeps options open.

### 2019-20 bubble — recommend **do NOT exclude** (but confirm)
The regular-season fatigue product excludes the 2019-20 Orlando bubble because it has **no real
travel** and would corrupt a travel-based model (`src/lib/nba-season.ts`,
`scripts/fetch_schedule.py`) — see `CLAUDE.md`. **That rationale does not apply here:** shot
locations on an NBA court are identical regardless of travel, and the bubble games were played
on regulation courts. Excluding them would only throw away ~1 season of valid shot geometry.

- **Recommendation:** **include 2019-20** for the shot model, and add a one-line note in the
  doc/code that this is a *deliberate divergence* from the fatigue product's exclusion (so a
  future reader doesn't "fix" it to match). [Inferred]
- **Counter-argument (present for the human):** if a design goal is *cross-module season-set
  consistency* ("every FullCourt model uses the same season list"), excluding 2019-20 keeps the
  two products' season vocabularies identical at the cost of one season of good data. This is a
  judgment call — flagged in §8.

---

## 3. Storage strategy — THE critical decision (options, not a pre-pick)

### The crux
~**8.6M raw shots** across ~40 seasons (~**6.5M** over the 1996-97+ coordinate era)
[Verified ml/shot_data_probe.txt §4]. A raw shot row (ids + coordinates + zone strings + flags)
is on the order of **~100–200 bytes** materialized, so ~6.5M rows is roughly **~1–2 GB of table
data plus indexes** [Inferred, order of magnitude only].

> **[Unknown] — the current Supabase plan/storage limit is not confirmed in-repo and must be
> checked by the human before this is decided.** Supabase's free tier has historically capped
> the database at ~500 MB [Inferred, general knowledge — treat as Unknown until confirmed]. If
> that is the live limit, **storing all raw shots does not fit**, and even a trimmed raw range
> is tight. The whole decision below turns on this number, so design around the uncertainty:
> the recommended options do **not** assume headroom we haven't verified.

### Options (with concrete trade-offs)

**(a) Store all raw shots, all seasons (~6.5M rows in Postgres).**
- *Storage:* ~1–2 GB + indexes [Inferred]. **Almost certainly exceeds a free-tier limit**; needs
  a paid plan [Unknown].
- *Query cost:* heavy; per-shot aggregation on read is expensive without careful indexing/materialized views.
- *Model fidelity:* maximal — any future feature (finer grids, per-player, action-type splits) stays possible.
- *Complexity:* highest (large ingest, index tuning, RLS/grants on a big table).

**(b) Store raw shots for a trimmed season range only (e.g. 2013-14+, ~2.8M rows).**
- *Storage:* ~0.4–0.8 GB [Inferred]. Still likely over a 500 MB free tier [Unknown]; borderline.
- *Query cost / fidelity:* same shape as (a) but less history.
- *Complexity:* same machinery as (a), smaller data.

**(c) Store only an aggregated spatial grid / hexbin summary (made & attempted per cell).** *(recommended)*
- *Shape:* bin the court into cells (e.g. a fixed hex/× grid, or the native `SHOT_ZONE_BASIC ×
  SHOT_ZONE_RANGE × SHOT_ZONE_AREA` buckets), and store **counts** (`attempts`, `makes`) per
  cell — sliced by whatever dimensions we actually surface (e.g. per season; optionally per
  team). A ~500-cell grid × 30 seasons ≈ **~15k rows**; × 30 teams ≈ **~450k rows**
  [Inferred]. Either is **tens of MB or less** — fits comfortably under any plausible limit.
- *Query cost:* trivial; the grid *is* the read model for the hexbin viz.
- *Model fidelity:* good for a **spatial-smoothing / empirical-rate** model and for the
  league-average baseline; **loses per-shot rows**, so a future logistic/GBM on raw features
  would need the local cache (§d), not Postgres.
- *Complexity:* moderate — one aggregation pass; the grid definition becomes a locked design choice.

**(d) Store no shot rows in Postgres — compute offline, persist only model outputs / a lookup surface.** *(recommended, as a hybrid with c)*
- *Shape:* pull raw shots into a **local cache** (Parquet/DuckDB/SQLite on disk, or `ml/data/`),
  train/aggregate **offline**, and write to Supabase only **(i)** the aggregated grid (option c)
  for the visualization and **(ii)** a compact **model-output surface** (e.g. predicted
  `xeFG%` / `P(make)` per grid cell, or fitted model coefficients + a small prediction table).
- *Storage:* smallest — kilobytes-to-megabytes.
- *Model fidelity:* full during *training* (raw data lives locally), compact when *served*.
- *Complexity:* moderate; introduces a local-cache convention (`ml/.venv` already exists for the
  Playoff Predictor's scikit-learn work — this extends that pattern with a data cache).

### Recommendation
**Hybrid (c)+(d): raw shots are collected to a local cache and never land in Supabase; Postgres
stores only the aggregated grid (for the hexbin view) and the model-output surface (predicted
xeFG% per cell + a small metrics/artifact record).** This is the only option that is robust to
the **[Unknown]** Supabase limit — it fits regardless — while preserving full training fidelity
locally and keeping the served read model tiny and fast. **If** the human confirms a paid plan
with GBs of headroom and wants raw shots queryable in-DB, fall back to (b) (trimmed) or (a)
(full). Final call deferred to §8.

---

## 4. Model definition

### Target
- **Primary:** binary **make/miss** (`SHOT_MADE_FLAG`) → predicted **`P(make)`**.
- **Derived:** **expected points per shot (xPPS)** = `P(make) × pointValue`, where `pointValue`
  is 2 or 3 from `SHOT_TYPE` [Verified ml/shot_data_probe.txt §3]; and **expected eFG%**
  = `(P(make_2) + 1.5 × P(make_3))` aggregated over attempts. These are the portfolio-facing
  numbers.

### Feature set (available fields ONLY — no tracking)
- **Location:** `LOC_X`, `LOC_Y` (or `SHOT_DISTANCE` + angle derived from them).
- **Zone (categorical):** `SHOT_ZONE_BASIC`, `SHOT_ZONE_RANGE`, `SHOT_ZONE_AREA`.
- **Shot kind:** `SHOT_TYPE` (2PT/3PT), optionally `ACTION_TYPE` (high-cardinality — bucket it).
- **Cheap context (optional):** `PERIOD`, home/away (from `HTM`/`VTM` vs `TEAM_ID`), `season`
  (to absorb the 3PT-era regime shift).
- **Deliberately excluded:** defender distance, shot clock (absent — §0), and **player
  identity** (kept out of the *baseline* location model to avoid conflating "who shot it" with
  "where it was shot"; flagged as an optional extension in §8).

### Baseline to beat (honest bar)
- **Naive baseline = league-average make rate by native zone** (`SHOT_ZONE_BASIC ×
  SHOT_ZONE_RANGE`), i.e. "this shot converts at the historical rate for its zone." This is a
  strong, sensible floor — most of the signal in shot value *is* location.
- **A real win is calibration + spatial resolution, not raw accuracy.** Because a single shot is
  near a coin flip, per-shot classification accuracy barely moves above "predict the majority
  class." The model earns its keep if it is **better calibrated** (lower log-loss / Brier than
  the zone-average baseline) and resolves value at **finer spatial granularity** than the ~15
  native zones — exactly the "calibration win, not classification win" framing from the Playoff
  Predictor doc.

### Candidate model families (3, incl. baseline)
1. **Baseline — empirical zone rates.** Make% per `SHOT_ZONE_BASIC × SHOT_ZONE_RANGE`. The floor.
2. **Logistic regression** on `SHOT_DISTANCE`, angle, `SHOT_TYPE`, context — interpretable,
   low-variance, the natural thesis model (coefficients read as log-odds of distance/angle).
3. **Spatial smoothing / gradient boosting** — either (a) a **smoothed empirical surface**
   (kernel/hexbin-smoothed make rates over the grid), which doubles as the stored artifact in
   §3(c), or (b) a **gradient-boosted** model on the raw features to capture non-linear
   distance×angle×type interactions. Included as the "does resolution beyond zones buy
   calibration?" check, not an automatic favorite (same overfit-risk caveat as the Playoff doc's
   tree model).

### Validation — temporal, leakage-aware
- **Walk-forward by season** (train seasons `≤ t`, validate `t+1`) — the same protocol as the
  Playoff Predictor, and important here because **shot selection drifts massively** across the
  coordinate era (the 3-point revolution). A random split would let post-2015 shot-mix leak into
  a "1990s" fit.
- **Metrics:** **log-loss / Brier (primary)** + a **reliability (calibration) curve**; report
  **expected vs actual eFG% by zone** as the interpretable headline; accuracy only as a
  read-against-baseline secondary.
- **Leakage guards:** features are per-shot and contain no outcome-derived or future
  information; no player-season aggregates that would peek at a shooter's full-season form.

---

## 5. Proposed schema & migration (DRAFT DESCRIPTION ONLY — nothing created now)

These are **drafts** for the human to hand-apply later in the Supabase SQL editor (the repo's
established pattern — nothing auto-applies; `drizzle-kit push`/`generate` are **not** run for
this). **The next migration number is `0008`** (0001–0007 exist; `0007_playoff_series_predictions.sql`
is the latest — [Verified drizzle/ listing]). Shape follows the Playoff Predictor precedent
(`0006`/`0007`): standalone SQL, RLS + grants inline.

The exact tables depend on the §3 storage decision:

- **If hybrid (c)+(d) [recommended]:** two small tables.
  - **`shot_grid`** — aggregated counts per cell: `id` (serial PK), `season` (varchar
    `"YYYY-YY"`), grid-cell identity (either `zone_basic`/`zone_range`/`zone_area` varchars **or**
    `cell_x`/`cell_y` smallints for a fixed grid), optional `team_id` (FK → `teams.id`),
    `attempts` (integer), `makes` (integer), `computed_at` (timestamp). Index on `(season)` (+
    `(team_id)` if per-team). A deterministic `external_cell_key` (unique) for idempotent upserts,
    mirroring `playoff_series.external_series_key`.
  - **`shot_value_surface`** (model output) — `id`, the same cell identity, `p_make` (numeric),
    `expected_efg` (numeric), `model_version` (varchar), `created_at` (timestamp). Mirrors the
    spirit of `playoff_series_predictions` (`0007`) without reusing it.
- **If raw-in-Postgres (a)/(b):** a single large **`shots`** table (`id`, `game_id` FK →
  `games.id` *if* the shot's game exists in `games`, else a raw `external_game_id` varchar,
  `team_id` FK, `player_id`, `season`, `period`, `loc_x`/`loc_y` smallints, `shot_distance`,
  `shot_type`, `action_type`, zone varchars, `made` boolean), indexed on `(season)`,
  `(team_id)`, and a spatial-ish `(loc_x, loc_y)` or zone index. This is the option that stresses
  the storage limit (§3) and needs the most index care.

**Every new table must mirror the security pattern** (or the Data API won't expose it after
Supabase's enforcement dates — `CLAUDE.md`, `drizzle/0004`/`0005`):
- `ENABLE ROW LEVEL SECURITY` + two policies: **`Allow public read`** (`FOR SELECT USING (true)`)
  and **`Allow service role all`** (`FOR ALL USING (auth.role() = 'service_role')`).
- Grants: `grant select … to anon;` and `grant select, insert, update, delete … to service_role;`.
- Add the new table name(s) to `drizzle.config.ts`'s `tablesFilter` (as `playoff_series` was).

> Note on `game_id` FKs: the shot data's `GAME_ID` is an NBA stats id; only a subset of shot
> seasons overlap the `games` table's populated seasons, and `games` is regular-season-only
> (`002`). A hard FK from shots to `games` would exclude playoff shots and pre-`games` seasons —
> so a **loose `external_game_id` varchar (no FK)** is likely safer for a raw `shots` table.
> Flagged as a schema-detail decision if option (a)/(b) is chosen.

---

## 6. API & frontend sketch (HIGH LEVEL ONLY)

Same architecture as the rest of the product — **Python/offline writes, the app reads** — and
the same `{ data, error }` envelope + Zod validation + `getPublicApiErrorMessage`
([API.md](API.md)).

- **API:** one or two `GET` routes under `src/app/api/`, e.g. `GET /api/shot-quality` returning
  the grid + expected-value surface for a season (and optional team) as `{ data, error }`,
  backed by a new query fn in `src/lib/db/queries.ts`. `runtime = "nodejs"`,
  `dynamic = "force-dynamic"` like the other DB routes.
- **Frontend:** a new **`/shot-quality`** page (working route name; tracks the §1 name decision),
  added to `nav-bar.tsx` — the **only** surface that reads shot data (isolation, §7). The core
  visual is a **half-court hexbin / shot chart**. As shipped it uses the dark **"Broadcast"**
  aesthetic (mono Courier, `--term-*` tokens, dark court `#0F1318`; value ramp tan `#D2A24C` →
  blue `#3B82F6`, and a blue→neutral→red `#E5484D` divergent ramp for the GBM−baseline view),
  with color/size encoding expected eFG% vs attempts. *(This was originally specced in the
  earlier light "Bloomberg Terminal" palette; the module was rebuilt dark in the Broadcast
  redesign.)* Shot-chart rendering is inherently visual, so it will get proper **loading / empty /
  edge-state** treatment (e.g. sparse-cell seasons, teams with few attempts in a zone) when
  actually built. See [FRONTEND.md](FRONTEND.md) for the design system.

This whole section is a **sketch**; the real UI is a later phase (§7).

---

## 7. Phasing plan with verification gates

Mirrors the Playoff Predictor cadence (probe → data → storage → model → outputs → API → page),
each phase ending in a **commit** and gated by a check the human runs (real DB queries / Read-tool
inspection). **All phases below are now complete** — the "Human verification gate" column is
kept as originally written (the plan), with a **Gate result** line under each row recording what
actually happened, sourced from `ml/shot_value/*.txt` and this session's file reads.

| Phase | Deliverable | Human verification gate |
|---|---|---|
| **SQ-0 — Feasibility probe** ✅ | `ml/shot_data_probe.txt`, `ml/shot_defend_probe.txt` | Probes confirm per-shot location fields, no tracking join, 1996-97 reach, ~8.6M scale. **[Verified]** |
| **SQ-1 — Design** ✅ | `docs/SHOT_QUALITY_DESIGN.md` (this doc) | Human answered the §8 open decisions by proceeding to build — see the resolved §8 below. |
| **SQ-2 — Data collection** ✅ | `scripts/collect_shot_data.py` → **local cache** `ml/data/shots/{season}/{team}.csv.gz` | *Gate result:* resumable per-team-season collector, `DELAY_SECONDS = 1.5`, 0-row results treated as valid (placeholder file), failures logged separately. Covers all 30 seasons through 2025-26. |
| **SQ-3 — Storage** ✅ | `scripts/aggregate_shot_grid.py` → `public.shot_grid`; migration `0008_shot_quality_grid.sql` hand-applied | *Gate result:* **55,036** league-wide grid cells across 30 seasons [Verified `ml/shot_value/sq5_surface_summary.txt`]; integrity checks (`fgm≤fga`, `fg3m≤fg3a`, `fg3a≤fga`, `fg3m≤fgm`) enforced pre-commit; RLS + anon-SELECT grants present (`0008`, mirrors `0004`/`0005`). |
| **SQ-4 — Model & evaluation** ✅ | `scripts/sq4_train_shot_value.py` (baseline vs. logit) + `scripts/sq4b_train_gbm.py` (adds GBM) — walk-forward by season, 29 folds | *Gate result:* [Verified `ml/shot_value/sq4b_metrics.txt`] pooled over 5,922,214 valid shots — baseline log-loss `0.665382`/acc `61.59%`; logit log-loss `0.669353`/acc `60.52%` (**logit did not beat baseline**); GBM log-loss `0.660022`/acc `61.93%` (**GBM beat baseline**, +0.81% log-loss / +1.06% Brier / +0.34pp accuracy — a calibration win, not a big accuracy win, exactly the honest framing this doc set out to preserve). |
| **SQ-5 — Prediction/output surface** ✅ | `scripts/sq5_write_surface.py` → `public.shot_value_surface` (`p_make`/`expected_efg`/`xpps` per cell × `model_version`) | *Gate result:* [Verified `ml/shot_value/sq5_surface_summary.txt`, `sq5_db_verify.txt`] **110,072** surface rows (55,036 cells × 2 model versions: `gbm-v1`, `baseline-zone-v1`); DB reconciliation **PASS**; all values within `[0,1]`/`[0,3]` bounds. |
| **SQ-6 — API** ✅ | `GET /api/shot-quality` (`{ data, error }`, Zod, `getPublicApiErrorMessage`) + `getShotQualityGrid()` | *Gate result:* [Verified `src/app/api/shot-quality/route.ts`, `src/lib/db/queries.ts`] `runtime="nodejs"`, `dynamic="force-dynamic"`; `season` required, `model?` display-hint only (both model surfaces are always returned per cell); unknown/future seasons return `cells: []`, not an error. |
| **SQ-7 — Page** ✅ | `/shot-quality` hexbin page + nav link, terminal aesthetic, loading/empty states | *Gate result:* [Verified `src/app/shot-quality/page.tsx`, `src/components/shot-quality-content.tsx`, `src/components/nav-bar.tsx`] nav link present; court-coordinate transform (`cellX+0.5`, `court_y = RIM_Y + cellY + 0.5`) checked against real zone landmarks; empty-season and error states implemented. |

### Isolation guarantees (same discipline as the Playoff Predictor)
- **Does not touch `src/lib/fatigue.ts`** and **does not rename** the rest-advantage metric
  (`restAdvantage`, `RestAdvPanel`, `rest_advantage_differential`, "REST ADVANTAGE", "RA").
- New tables are **additive**; no existing query reads them, and the shot page is the only
  surface that reads shot data — so the regular-season product is unaffected.
- New ingest is a **separate path**; it does not loosen `fetch_schedule.py` /
  `fetch_nba_schedule_cdn.py` (which keep their `002` gate).

---

## 8. Open decisions summary — RESOLVED (as actually built)

Each open decision below is followed by **→ Built:**, the value the shipped code actually uses.

- **[Name]** Ship as **"Expected Shot Value (xeFG%)"** (recommended, honest) vs keep the roadmap
  label "Shot Quality Model" vs another? Sets the page route/name too. (§1)
  **→ Built:** `"Expected Shot Value"` is the page `<title>` [Verified `src/app/shot-quality/page.tsx`];
  route/nav label is `"SHOT QUALITY"` [Verified `src/components/nav-bar.tsx`]; xeFG% is the
  metric used throughout the methodology copy.
- **[Season scope]** **Full coordinate era 1996-97→present** (~30 seasons, recommended) vs
  trimmed 2013-14+ vs a short demo slice? (§2)
  **→ Built:** full era, 30 seasons 1996-97…2025-26 [Verified `ml/shot_value/sq5_surface_summary.txt`].
- **[Bubble handling]** **Include 2019-20** for shots (recommended — no travel dependence) vs
  exclude it to keep season-sets identical across FullCourt modules? (§2)
  **→ Built:** 2019-20 is **included** [Verified `scripts/aggregate_shot_grid.py` — no bubble
  exclusion logic, unlike `nba-season.ts`/`fetch_schedule.py`'s regular-season `NBA_SEASONS`].
- **[Storage — critical]** Confirm the **[Unknown] Supabase plan/storage limit first**, then
  choose: **hybrid (c)+(d): grid + model-output only, raw cached locally** (recommended,
  fits any limit) vs (b) trimmed raw-in-Postgres vs (a) full raw-in-Postgres. (§3)
  **→ Built:** the recommended hybrid. Raw per-shot data lives only in the local gzip-CSV cache
  (`ml/data/shots/`, gitignored); Postgres holds `shot_grid` (aggregated counts) and
  `shot_value_surface` (model output) only — see [DATABASE.md](DATABASE.md).
- **[Model family]** Which to ship after the bake-off: empirical-zone baseline (floor),
  **logistic** (interpretable thesis model), or **spatial-smoothing / GBM** (finer resolution)?
  Selection is on validation log-loss/Brier, interpretability as tiebreaker. (§4)
  **→ Built:** **GBM** (`HistGradientBoostingClassifier`, `model_version = "gbm-v1"`) shipped as
  the adopted model — it beat both the baseline and logistic on pooled walk-forward log-loss/
  Brier. Logistic was evaluated and **rejected** (did not beat the baseline). The **zone-average
  baseline** (`"baseline-zone-v1"`) ships alongside `gbm-v1` in the same surface as the
  comparison floor, not just an internal benchmark — both are queryable via the API. See §7 SQ-4.
- **[Player identity — optional extension]** Keep the model **location-only** (recommended for
  the baseline, and matches the SQ-0 scope) or add player identity as a later variant (bigger
  model, leakage care, larger stored surface)? (§4)
  **→ Built:** location-only, as recommended. No player-identity variant was built.
- **[Expected points vs P(make)]** Surface **expected eFG% / xPPS** as the headline metric
  (recommended) — confirm that's the portfolio-facing number, not raw make-probability. (§4)
  **→ Built:** both `expected_efg` and `xpps` are stored per cell alongside `p_make`; the page's
  headline/legend numbers are expected-eFG%, matching the recommendation.

---

## Actual build vs. design — where the shipped version diverged

Two places the real build differs from what this doc sketched, found while writing the SQ-7
gate result above:

1. **Walk-forward is for model *selection*, not for serving.** §4's walk-forward CV
   (expanding window by season) was used exactly as designed to **choose** the model
   (GBM beats baseline/logit) and to report honest out-of-sample metrics. But the surface
   actually written to `shot_value_surface` scores every cell with the model trained on **all**
   loaded seasons (`ml/shot_value/sq4b_gbm_full.pkl`), not a per-season walk-forward model. This
   doc's §6 API sketch didn't specify which fit serves production, so this isn't a contradiction
   of an explicit decision — it's a build-time judgment call worth recording: the served
   predictions are not literally "what the model would have predicted not having seen that
   season," the way the evaluation numbers are.
2. **The diff view renders one court, not two.** The original intent (§6, high-level only) did
   not pin down the diff-view layout precisely; the shipped `shot-quality-content.tsx` renders a
   **single** court in `GBM − BASELINE` mode (a divergent-color diff), and only renders two
   side-by-side courts in the sequential `EXPECTED eFG%` mode (baseline vs. GBM). See
   [FRONTEND.md](FRONTEND.md) for the component details.

Everything else in §1–§8 above — the honest framing, the hybrid storage split, the model
comparison being served (not just internally benchmarked), the location-only feature scope, and
the expected-eFG%/xPPS headline metrics — matches what actually shipped.

---

## Self-review

Re-read against the probes (`ml/shot_data_probe.txt`, `ml/shot_defend_probe.txt`), the project
docs (`CLAUDE.md`, `DATABASE.md`, `API.md`, `ROADMAP.md`, `PLAYOFF_PREDICTOR_DESIGN.md`), and the
`drizzle/` migration listing. Each required section is covered; every open decision is deferred
to the human, not silently locked.

> **Historical note:** the table below reviews the *original design draft* against the probes —
> it predates the build and is kept for the record. The build itself is reviewed in "Actual
> build vs. design" above and cross-referenced against real code/output files throughout §7–§8.

| # | Section | Done | Notes |
|---|---|---|---|
| 1 | Purpose & honest framing | ✅ | States IS (location-based expected value) vs IS NOT (no defender/shot-clock → not contestedness); recommends **"Expected Shot Value (xeFG%)"** with the "calibration win, not classification win" rationale; name flagged open. |
| 2 | Data source & scope | ✅ | `ShotChartDetail` only; season options anchored to the **1996-97** coordinate reach [Verified probe §5]; 2019-20 bubble analyzed both ways, **recommend include** (no travel dependence), flagged open. |
| 3 | Storage strategy | ✅ | Four options (a–d) with concrete size/query/fidelity/complexity trade-offs; **Supabase limit tagged [Unknown]** and made the gating question; recommends **hybrid (c)+(d)** as limit-robust, final call deferred. |
| 4 | Model definition | ✅ | Target = make/miss → `P(make)`, derived xeFG%/xPPS; features from available fields only (no tracking); **baseline = zone-average**; win = calibration; walk-forward by season with regime-shift + leakage guards. |
| 5 | Schema & migration (draft) | ✅ | Draft tables per storage choice (`shot_grid` + `shot_value_surface`, or raw `shots`); **next migration = `0008`** [Verified drizzle listing]; RLS (2 policies) + grants + `tablesFilter` pattern; explicit "hand-apply, nothing created now." |
| 6 | API & frontend sketch | ✅ | `GET /api/shot-quality` (`{ data, error }`); `/shot-quality` hexbin page in the terminal aesthetic (colors/bg cited); kept a sketch; loading/empty states noted for build time. |
| 7 | Phasing plan | ✅ | SQ-0…SQ-7 table, each with a human-run verification gate and a commit; isolation guarantees (no `fatigue.ts`, no metric rename, additive tables, separate ingest). |
| 8 | Open decisions | ✅ | Seven bulleted decisions (name, season scope, bubble, storage, model family, player identity, headline metric) for a one-pass answer. |

**Constraints honored:** no code/schema/migration/frontend created (only this doc); `fatigue.ts`
untouched; rest-advantage identifiers untouched; no `drizzle-kit`, no git, no DB connection, no
`nba_api` calls, no Alembic. All probe-derived facts are cited to the probe files; the Supabase
limit is tagged **[Unknown]** pending human confirmation.
</content>
</invoke>
