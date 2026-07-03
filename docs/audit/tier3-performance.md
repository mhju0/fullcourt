# FullCourt — Tier 3 Performance Audit (READ-ONLY)

**Scope:** `fatigue_scores` double `DISTINCT ON`, live indexes, EXPLAIN of the
`/api/analysis` read path, N+1, bundle. **Date:** 2026-07-03. **Model:** Opus 4.8.

**Read-only:** no source/config/schema/index changes were made. The only writes are the
files under `docs/audit/`. Index proposals below are **suggestions only — NOT applied**;
they are gated to a future `0009` migration (manual SQL via the `fullcourt-migration`
skill, with RLS/grant review).

**Evidence files** (raw, cited by line):
- `docs/audit/tier3-explain.txt` — Drizzle `.toSQL()` + `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` for 3 queries + row counts.
- `docs/audit/tier3-indexes.txt` — live `pg_indexes` for `fatigue_scores`, `games`, `predictions`.
- `docs/audit/tier3-bundle.txt` — recharts import sites + emitted client-chunk sizes.

**Evidence method note:** the EXPLAIN target SQL was produced by rebuilding the identical
Drizzle query builders (verbatim copy of `latestFatigueSubquery` and the
`getCompletedGamesWithFatigue` / `searchRegularSeasonGames` / `getGamesByDate` selects) and
calling Drizzle `.toSQL()`, then running `EXPLAIN` on that exact string with its params via
`postgres-js`. The generated SQL is therefore Drizzle-authored, not hand-reconstructed
(compare `tier3-explain.txt:5` vs `src/lib/db/queries.ts:533-563`). Tagged **[Verified]**.

---

## 1. Inventory (what actually exists on disk)

### Live cardinality [Verified docs/audit/tier3-explain.txt:239-246]
| Metric | Value |
|---|---|
| `fatigue_scores` total rows | **98,695** |
| `fatigue_scores` distinct `(game_id, team_id)` | **98,695** |
| `fatigue_scores` max rows per `(game_id, team_id)` pair | **1** |
| `fatigue_scores` pairs with duplicates | **0** |
| `games` total | 49,348 |
| `games` regular + final | 46,167 |
| `predictions` total | 40,734 |
| `predictions` open (`actual_winner_id IS NULL`) | 82 |

> **The DISTINCT ON currently dedups nothing:** there is exactly one fatigue row per
> `(game_id, team_id)` today (max 1/pair, 0 duplicate pairs). This is the single most
> important fact for the findings below.

### Live indexes [Verified docs/audit/tier3-indexes.txt:3-24]
- `fatigue_scores`: `fatigue_scores_pkey (id)`, `fatigue_scores_game_id_idx (game_id)`,
  `fatigue_scores_team_id_idx (team_id)`. **No composite index, no
  `(game_id, team_id)` unique, no index touching `computed_at`.**
- `games`: `games_pkey (id)`, `games_external_id_unique (external_id)`,
  `games_date_idx (date)`, `games_status_idx (status)`, `games_home_team_idx (home_team_id)`,
  `games_away_team_idx (away_team_id)`. **No composite; nothing indexes `game_type`.**
- `predictions`: `predictions_pkey (id)`, `predictions_game_id_idx (game_id)`.
  **No index on `created_at` or `actual_winner_id`.**

### Live vs. declared (schema.ts + migrations 0001–0008)
For these three tables the **live indexes exactly match** what `schema.ts` and the
migrations declare — no drift. [Verified `src/lib/db/schema.ts:52-57,98-101,118` vs
`docs/audit/tier3-indexes.txt:3-24`] The CLAUDE.md warning that `schema.ts` lags the live DB
applies to `shot_grid` / `shot_value_surface` (absent from `schema.ts`), which are **not**
in the `/api/analysis` read path and were out of scope here. [Verified `src/lib/db/schema.ts`
has no `shotGrid` table; `src/lib/db/queries.ts:1092-1123` reads them via raw SQL]

### Routes emitted by `pnpm build` [Verified scratchpad build.log:22-37, exit 0]
15 routes; `/api/analysis`, `/api/games/*`, `/api/game/[id]`, `/api/playoffs`,
`/api/shot-quality`, `/api/health`, `/api/cron/update` are dynamic (`ƒ`); `/`, `/analysis`,
`/upcoming`, `/playoffs`, `/shot-quality` are static (`○`) shells.

---

## 2. Findings per scope question

### (A) Static analysis — the "double DISTINCT ON" [Verified]

`latestFatigueSubquery(alias)` builds a single
`SELECT DISTINCT ON (game_id, team_id) … FROM fatigue_scores ORDER BY game_id, team_id, computed_at DESC`
[Verified `src/lib/db/queries.ts:36-57`]. Its comment ("prefer the most recently computed")
makes it a defensive latest-row picker.

The **"double"** is that every fatigue-consuming query instantiates this subquery **twice** —
once for the home side, once for the away side — and joins each back to `games`:
- `getCompletedGamesWithFatigue` (the `/api/analysis` path): two **INNER JOINs**
  [Verified `src/lib/db/queries.ts:534-535, 547-554`].
- `getGamesByDate` / `getGameById`: two **LEFT JOINs**
  [Verified `src/lib/db/queries.ts:154-155,202-209` and `342-343,385-392`].
- `searchRegularSeasonGames`: two **INNER JOINs**
  [Verified `src/lib/db/queries.ts:594-595,640-647`].
- `getUpcomingGamesWithRA`: two **LEFT JOINs**
  [Verified `src/lib/db/queries.ts:746-747,799-806`].

Confirmed in the generated SQL: two identical `select distinct on (…) from fatigue_scores
order by … computed_at desc` blocks aliased `home_fatigue_latest` / `away_fatigue_latest`
[Verified `docs/audit/tier3-explain.txt:5`].

**Should a composite index back this?** Yes. `DISTINCT ON (game_id, team_id) ORDER BY
game_id, team_id, computed_at DESC` is exactly served by a btree on
`(game_id, team_id, computed_at DESC)`: the index yields rows already grouped and ordered, so
`Unique` takes the first row per group with **no sort**. Today only a single-column
`game_id` index exists, so Postgres does an Index Scan on `game_id` + an **Incremental Sort**
(presorted on `game_id`, full-sorts `team_id, computed_at DESC` within each `game_id` group)
before `Unique` [Verified `docs/audit/tier3-explain.txt:21-27`]. **[Inferred]** a composite
`(game_id, team_id, computed_at DESC)` index removes that Incremental Sort and enables clean
two-column merge joins / a LATERAL rewrite (see (C) and §3).

### (B) Live indexes vs. schema — see §1. No drift on the three tables. [Verified]

### (C) EXPLAIN (ANALYZE, BUFFERS) — measured on the live DB [Verified]

**Q1 — `getCompletedGamesWithFatigue` = the `/api/analysis` read query**
- **Execution 1380.640 ms**, Planning 32.698 ms, 45,988 rows returned
  [Verified `docs/audit/tier3-explain.txt:12,63-64`].
- **Two full DISTINCT-ON passes over `fatigue_scores`:** each is
  `Index Scan fatigue_scores_game_id_idx` (~93,857 rows) → `Incremental Sort` → `Unique`
  [Verified `docs/audit/tier3-explain.txt:27,21-24,18` and `57,51-54,48`]. `Unique` emits
  ~93,836 rows from ~93,857 scanned — i.e. it **removes essentially zero rows**, matching the
  "0 duplicate pairs" fact.
- **`games` uses a Seq Scan, not an index:** `Seq Scan on public.games`, planner estimate
  `rows=5144` vs **actual 45,988**, `Rows Removed by Filter 3360`
  [Verified `docs/audit/tier3-explain.txt:43,46`]. The filter is
  `status='final' AND game_type='regular' AND home_score/away_score NOT NULL` plus the
  `to_date(...)` season-window predicate [Verified `docs/audit/tier3-explain.txt:45`].
- **Disk spills:** the `games` sort is `external merge Disk: 1896kB`
  [Verified `docs/audit/tier3-explain.txt:41`]; top-level `Buffers: … temp read=237 written=238`
  [Verified `docs/audit/tier3-explain.txt:17`].
- **Planner mis-estimate:** the outer `Merge Join` estimates `rows=31` but produces
  **45,988** (~1,500× low); `Rows Removed by Join Filter: 45988` because the outer merge
  matches on `game_id` only, then discards the wrong-team row via
  `Join Filter (games.home_team_id = fatigue_scores.team_id)`
  [Verified `docs/audit/tier3-explain.txt:12,14-16`].

**Q2 — `searchRegularSeasonGames` (no filters, the game-explorer worst case)**
- **Execution 504.413 ms**, 45,988 rows, no `LIMIT`
  [Verified `docs/audit/tier3-explain.txt:150,77`].
- Final `Sort … external merge Disk: 2504kB`; **`Buffers: shared hit=196509`**
  [Verified `docs/audit/tier3-explain.txt:80-81`] — dominated by probing `teams_pkey`
  45,988× on each side (`loops=45988`, `Buffers … hit=91976` twice)
  [Verified `docs/audit/tier3-explain.txt:138-145`].
- The route fetches **all** matching rows and paginates/filters (correct-vs-incorrect) in JS
  [Verified `src/lib/db/queries.ts:586-590`], so the full 45,988-row result is materialized
  to render one page.

**Q3 — `getGamesByDate` (single date `2026-04-13`, 8 games — powers `/` home page)**
- **Execution 193.658 ms** to return **8 rows**
  [Verified `docs/audit/tier3-explain.txt:161,234`].
- The `games` side is cheap (`Index Scan games_date_idx`, rows=8)
  [Verified `docs/audit/tier3-explain.txt:200-202`], but **both** DISTINCT-ON subqueries
  still scan the **entire** `fatigue_scores` table (~93,835 rows each) before the join
  [Verified `docs/audit/tier3-explain.txt:205,220`]. The date filter cannot be pushed into
  the subquery, so an 8-game day pays a ~94k×2-row dedup. This is the clearest waste: the
  most-hit route does a full-table fatigue scan regardless of how few games the date has.

### (D) N+1 — CLEAN (no per-row DB round-trips) [Verified]

- `getGamesByDate` issues **1** main join query, then **2** follow-up queries
  (`computeIs4In6Map`, `getTeamGameCountsInDaysBefore`) run together via `Promise.all`
  [Verified `src/lib/db/queries.ts:213-216`]. Each follow-up is a **single batched** query
  over all team IDs using `inArray(...)` — not per-team
  [Verified `src/lib/db/queries.ts:85-93,123-133`]. The `is4In6` / games-in-last-30
  computations are done in JS from that one batched fetch (JS work, not N+1).
- `getGameById`: same shape — 1 + 2 batched [Verified `src/lib/db/queries.ts:401-404`].
- `getGameDetailById`: `getGameById` (1+2) then **2** `getTeamRecentFinalResults` in parallel
  (home + away) [Verified `src/lib/db/queries.ts:466-475`] — a fixed count of 2, not
  per-row.
- `getCompletedGamesWithFatigue`: a **single** query, no follow-ups
  [Verified `src/lib/db/queries.ts:533-563`].

**No query loops over games/teams issuing per-iteration DB calls.** N+1 is not present.

### (E) Bundle — heavy dep already code-split; no size table available

- `recharts` (the heaviest client dep) is imported in **exactly one** file,
  `src/components/analysis-content.tsx` [Verified `docs/audit/tier3-bundle.txt:1-5`], and that
  component is loaded via **`next/dynamic` with `ssr: false`** through `analysis-lazy.tsx`
  [Verified `src/components/analysis-lazy.tsx:13-30`]; `/analysis/page.tsx` renders only the
  lazy wrapper [Verified `src/app/analysis/page.tsx:2,11`]. So recharts sits in an
  on-demand chunk for `/analysis`, not in the shared/initial bundle — already a good split.
- Largest emitted client chunk: **372 KB**; total `.next/static/chunks` = **1,588 KB across
  25 files** [Verified `docs/audit/tier3-bundle.txt:12,39`]. **[Inferred]** the 372 KB chunk
  is the recharts split (by far the largest; recharts is the heaviest dep) — chunk names are
  hashed so this is not proven from the build alone.
- **The Next.js 16.2.1 Turbopack build does not print a per-route "First Load JS / Size"
  table** — only the route list with Static/Dynamic markers
  [Verified scratchpad build.log:21-41]. Adding `@next/bundle-analyzer` is banned by the
  task, so exact per-route First Load JS is **[Unknown]** (see §4).

### (F) Lighthouse — not run this session (per instructions)

Suggested manual command for Michael (optional follow-up, run against the deployed site or a
local `pnpm start`):
```bash
npx lighthouse https://fullcourt-nba.vercel.app/analysis --preset=desktop --view
# or for the home page:
npx lighthouse https://fullcourt-nba.vercel.app/ --view
```

---

## 3. Prioritized weakness list (severity + rationale — proposals only, NOT applied)

> All index SQL below is a **proposal** for a future `0009` migration (manual SQL via the
> `fullcourt-migration` skill). **Do not apply here.** Use `CONCURRENTLY` (cannot run inside a
> transaction block) to avoid write locks on the ~99k-row table. Indexes need no Supabase
> grants (grants are table-level). Per the CLAUDE.md hard bans, `schema.ts` should **not** be
> reconciled — the index would live only in DB + the `0009` SQL file, matching the existing
> `shot_grid` convention.

**H1 — `getGamesByDate` full-scans all `fatigue_scores` for every home-page load.**
Rationale: ~193 ms fixed cost to return 8 games because the two DISTINCT-ON subqueries dedup
the whole table before the date join [Verified `docs/audit/tier3-explain.txt:161,205,220,234`].
This is the highest-traffic route. Proposal (index + a later query-shape change): add
`(game_id, team_id, computed_at DESC)` and rewrite the two subqueries as
`LEFT JOIN LATERAL (SELECT … FROM fatigue_scores f WHERE f.game_id = games.id AND
f.team_id = games.home_team_id ORDER BY f.computed_at DESC LIMIT 1) …` so only the ~16
relevant rows are touched. The query-shape change is a **separate later session** (touches
`queries.ts`); the index alone is the `0009` deliverable.

**H2 — `/api/analysis` runs 1.38 s with two ~94k-row DISTINCT-ON sorts + a `games` Seq Scan
that spills to disk.** Rationale: Execution 1380 ms, `games` Seq Scan (est 5,144 vs actual
45,988), external-merge disk sort, temp buffers [Verified
`docs/audit/tier3-explain.txt:43,41,17,64`]. Highest absolute latency. Proposal (index):
```sql
-- 0009 (proposal, NOT applied): back the DISTINCT ON directly
CREATE INDEX CONCURRENTLY IF NOT EXISTS fatigue_scores_game_team_computed_idx
  ON public.fatigue_scores (game_id, team_id, computed_at DESC);
```
Expected effect **[Inferred]**: removes the Incremental Sort, gives natively `(game_id,
team_id)`-ordered subquery output → clean two-column merge joins, less CPU/temp.

**M1 — DISTINCT ON pays unconditional dedup cost while removing zero rows.** Rationale: 0
duplicate pairs, max 1 row/pair [Verified `docs/audit/tier3-explain.txt:241-242`], yet every
read sorts + `Unique`s ~94k rows twice. If uniqueness is guaranteed at write time, the read
could drop DISTINCT ON entirely (largest possible win). **This is an ESCALATE** (writer
semantics / schema design — see §5), because `backfill_fatigue.ts` append/`--force` semantics
may be *intended* to allow historical duplicates even though none exist now.

**M2 — `games` has no index for the analysis filter; the season-window predicate is
non-sargable, so the planner mis-estimates ~1,500×.** Rationale: Seq Scan + `rows=31` vs
45,988 on the merge join [Verified `docs/audit/tier3-explain.txt:43,12`]; `game_type` is
unindexed [Verified `docs/audit/tier3-indexes.txt:9-20`]; the `to_date(left(season,4)…)`
predicate wraps the column in a function so no index/stat can estimate it
[Verified `docs/audit/tier3-explain.txt:45`]. The current plan is "accidentally acceptable"
but fragile. Proposal (index) — **ESCALATE which shape is best**:
```sql
-- 0009 (proposal, NOT applied): selectivity on the constant equality predicates
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_type_status_date_idx
  ON public.games (game_type, status, date);
```
Note: this helps the `game_type='regular' AND status='final'` selectivity and provides an
ordered `date`, but does **not** fix the non-sargable season-window estimate. A cleaner long-
term fix (a stored/generated season-window boolean, or precomputed date bounds) is a schema
change → senior decision.

**M3 — `searchRegularSeasonGames` fetches all matching rows (no `LIMIT`) and paginates in
JS.** Rationale: 45,988 rows materialized, `Buffers hit=196,509`, disk-spill sort
[Verified `docs/audit/tier3-explain.txt:81,80`]; pagination/correctness filtering is done in
the caller [Verified `src/lib/db/queries.ts:586-590`]. Cost scales with result size. This is
partly inherent (the correct/incorrect filter needs `restedTeamWon`, computed in JS), so it is
Med, not High. Possible later mitigation: compute `restedTeamWon` in SQL and push
`LIMIT/OFFSET` down — a `queries.ts` change for a later session, not an index.

**L1 — Bundle: `recharts` already isolated to a lazy `ssr:false` chunk.** Rationale:
[Verified `src/components/analysis-lazy.tsx:13-30`]. No action needed; this is a strength.
The only gap is observability — the Turbopack build emits no First Load JS table (§4).

---

## 4. Open [Unknown]s needing human/runtime confirmation

- **[Unknown] Exact per-route First Load JS.** The Next 16.2.1 Turbopack build prints no size
  table [Verified scratchpad build.log:21-41] and `@next/bundle-analyzer` is banned. Confirm
  via Michael's own tooling if a precise budget is needed (e.g. a one-off
  `ANALYZE=1`/webpack build in a throwaway branch, or manual chunk attribution). The 372 KB
  chunk = recharts is **[Inferred]**, not proven.
- **[Unknown] Whether `(game_id, team_id)` is a true invariant in `fatigue_scores`.** It holds
  in the current data (0 dupes) but the writer path (`scripts/backfill_fatigue.ts`,
  `scripts/run-daily.ts`) may append by design. Needed before deciding M1 (drop DISTINCT ON)
  vs. keep-and-index. → §5.
- **[Unknown] Real production latency / concurrency.** EXPLAIN here ran against the live DB
  from a local connection with warm-ish cache (`shared hit`, few `read`). Vercel cold pools
  (`DB_POOL_MAX=1`) and Supabase pooler latency are not captured; the 1.38 s `/api/analysis`
  figure is a lower bound on total request time.

---

## 5. Escalate to senior (Chat)

1. **Index design trade-offs (M1/M2/H1/H2).** Which of `(game_id, team_id, computed_at DESC)`
   alone vs. also a `UNIQUE (game_id, team_id)` (with a writer upsert) is correct; and whether
   `games (game_type, status, date)` is the right composite or a season-window
   generated column is better. These are schema-design judgments with write-path implications.
2. **`fatigue_scores` uniqueness invariant.** Confirm whether one row per `(game_id, team_id)`
   is guaranteed by the writer. If yes, dropping DISTINCT ON is the biggest win but changes
   read semantics; if no, keep DISTINCT ON + the composite index.
3. **Non-sargable season-window predicate** (`to_date(left(season,4)…)`) drives a ~1,500×
   planner mis-estimate; fixing it properly (generated column / precomputed bounds) is a
   schema change, out of this audit's read-only scope.

No numbers in this report were taken from grep/stdout — every figure was written to a
`docs/audit/tier3-*.txt` file and re-read with the Read tool, then cited by line.

---

## 6. After-index re-measurement (0009 applied) — READ-ONLY

**Date:** 2026-07-03. **Model:** Opus 4.8. **Change measured:** manual application of
`drizzle/0009_fatigue_scores_distinct_on_index.sql` →
`CREATE INDEX fatigue_scores_game_team_computed_idx ON public.fatigue_scores (game_id, team_id, computed_at DESC)`.
No source/schema/index changes were made **by this session** — the index was applied by the
human beforehand; this section only re-runs the same read-only `EXPLAIN`s and compares.

**Evidence file (raw after-plans):** `docs/audit/tier3-explain-after.txt` — index-validity
check + Drizzle `.toSQL()` + `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` for the same 3 queries,
each run 3× (warm 3rd run captured).

### Apples-to-apples proof [Verified]

- **Index is live and valid:** `fatigue_scores_game_team_computed_idx | indisvalid=true |
  indisready=true`, def `... USING btree (game_id, team_id, computed_at DESC)`
  [Verified `docs/audit/tier3-explain-after.txt:6-7`]. The old single-column
  `fatigue_scores_game_id_idx` still exists [Verified `tier3-explain-after.txt:4-5`].
- **Same SQL:** all three `.toSQL()` strings are **byte-identical** to the baseline, and the
  Postgres **Query Identifier** matches for each query
  (`-6024912337231469783`, `-1705146647370177887`, `7154853584684826885` — before and after)
  [Verified `docs/audit/tier3-explain.txt:60,146,232` vs `tier3-explain-after.txt:62,134,205`;
  string equality re-checked programmatically, all 3 = MATCH]. The `getGamesByDate` reproduction
  used the same reduced column set as the baseline (same param `["2026-04-13","regular"]`),
  so the comparison is like-for-like.

### Answers to the four scope questions

**(1) Does `fatigue_scores_game_team_computed_idx` actually appear/get used? — YES, all 3.**
Every fatigue subquery now reads `Index Scan using fatigue_scores_game_team_computed_idx on
public.fatigue_scores` feeding `Unique` directly. [Verified Q1 `tier3-explain-after.txt:44,59`;
Q2 `:108,131`; Q3 `:193,202`]. Before, the same subqueries used
`Index Scan using fatigue_scores_game_id_idx` **+ an `Incremental Sort`**
[Verified `tier3-explain.txt:27,21`]. No Seq Scan on `fatigue_scores` in either era.

**(2) Did the Sort backing the DISTINCT ON disappear? — YES, all 3.**
The `Incremental Sort` node (`Sort Key: … game_id, team_id, computed_at DESC`,
`Presorted Key: game_id`) that preceded every `Unique` in the baseline is **gone** in all three
after-plans — `Unique` now consumes the natively-ordered index scan with no sort.
[Verified: baseline Incremental Sorts at `tier3-explain.txt:21,51,91,129,208,223`; the
after-plans contain **zero** `Incremental Sort` / DISTINCT-ON `Sort` nodes over `fatigue_scores`
— `tier3-explain-after.txt:41-46,56-61,105-110,128-133,190-195,199-204`.]

**(3) `/api/analysis` external-merge disk spill (baseline 1896kB): still there? — YES, but it is
a JOIN sort, not the DISTINCT-ON sort.** The remaining spill is
`Sort Method: external merge  Disk: 2256kB`, `Sort Key: games.id, games.home_team_id`
[Verified `tier3-explain-after.txt:34,33`] — it sorts the `games ⋈ away_fatigue` **hash-join
result** so it can feed the outer `Merge Join` against the `home_fatigue` subquery. It is **not**
the DISTINCT-ON sort (those are gone per (2)). Per the interpretation guide, a join/merge sort is
**not** something a `fatigue_scores` DISTINCT-ON index can remove — this is expected, not a
failure. It is slightly larger than baseline (1896 → 2256 kB) because the row now carries the
joined `fatigue_scores.score` (width 32→38). The removal of the two ~94k-row DISTINCT-ON sorts is
what drove the wall-clock win, not this sort.

**(4) Before/after per query.**

| Query | Metric | Before | After | Δ |
|---|---|---|---|---|
| **Q1 `/api/analysis`** (`getCompletedGamesWithFatigue`) | Execution time | **1380.640 ms** | **303.785 ms** | **−77.9%** (≈4.5×) |
| | Rows returned | 45,988 | 45,988 | = |
| | DISTINCT-ON sort | 2× Incremental Sort | **none** (index-ordered) | removed |
| | `fatigue_scores` access | `game_id_idx` + sort | `game_team_computed_idx` | ✔ new index |
| | Remaining disk spill | 1896 kB (games sort) | 2256 kB (**join** sort) | join sort, not fixable by this index |
| | Top buffers | hit=12,557 · temp r237/w238 | hit=13,406 · temp r282/w283 | slightly ↑ |
| **Q2 explorer** (`searchRegularSeasonGames`, no filters) | Execution time | **504.413 ms** | **455.810 ms** | **−9.6%** |
| | Rows | 45,988 | 45,988 | = |
| | DISTINCT-ON sort | Incremental Sort | **none** | removed |
| | ORDER BY `date` spill | 2504 kB | 2504 kB | unchanged (not this index's job) |
| | Extra join spill | — | 2792 kB (new merge-join sort) | plan reshaped |
| | Buffers | hit=196,509 · temp r550/w552 | hit=197,358 · temp r662/w665 | ~ = |
| **Q3 home page** (`getGamesByDate`, 1 date, 8 games) | Execution time | **193.658 ms** | **154.011 ms** | **−20.5%** |
| | Rows | 8 | 8 | = |
| | DISTINCT-ON sort | 2× Incremental Sort | **none** | removed |
| | `fatigue_scores` rows still scanned | ~93,835 ×2 | ~93,835 ×2 | **unchanged** (full dedup still materialized) |
| | Buffers | hit=11,548 | hit=12,098 | slightly ↑ |

[Verified execution times: `tier3-explain.txt:64,150,234` (before) vs
`tier3-explain-after.txt:64,136,207` (after). Buffers: `tier3-explain.txt:17,81,165` vs
`tier3-explain-after.txt:30,81,150`. Spills: `tier3-explain.txt:41,80` vs
`tier3-explain-after.txt:34,80,90`.]

### Per-query verdict

- **Q1 `/api/analysis` — clear win (4.5×).** [Verified] The index removed both ~94k-row
  DISTINCT-ON `Incremental Sort`s and, more importantly, the pathological baseline
  `Materialize → Merge Join → Unique` whose away-side `Unique` alone cost **722.890 ms**
  [Verified `tier3-explain.txt:48`]; the same `Unique` is now **59.965 ms**
  [Verified `tier3-explain-after.txt:56`]. The residual disk spill is a join sort (see (3)),
  not addressable by this index.
- **Q3 home page — real but partial win (−20.5%).** [Verified] The Incremental Sorts are gone,
  but the plan **still materializes the full ~94k-row DISTINCT-ON output ×2** before the merge
  with the 8-game day [Verified `tier3-explain-after.txt:190,199` show `rows=93835/93836`]. The
  index removed the *sort*, not the *full scan*. The full "narrow game_id path" benefit the index
  makes *possible* is only realized after the H1 LATERAL query-shape rewrite (separate session);
  the index alone buys the sort-removal slice. **[Inferred]**
- **Q2 explorer — modest win (−9.6%).** [Verified] DISTINCT-ON sorts removed, but Q2 is dominated
  by probing `teams_pkey` 45,988× on each side (`Buffers … hit=91,976` twice
  [Verified `tier3-explain-after.txt:123,127`]) and the final `ORDER BY games.date DESC`
  external-merge spill (2504 kB, unchanged [Verified `:80`]) — neither is touched by a
  `fatigue_scores` index. A new merge-join sort spill (2792 kB [Verified `:90`]) even appeared
  from the reshaped plan. Net still faster, but this route needs the M3 query-shape change
  (SQL-side `restedTeamWon` + `LIMIT` pushdown), not an index.

### Side observations (unchanged by the index — not failures)

- **Planner still mis-estimates the outer join ~1,400×:** `Merge Join rows=33` (was 31) vs
  actual **45,988** [Verified `tier3-explain-after.txt:26`]; `Seq Scan on games` still estimates
  `rows=5144` vs 45,988 [Verified `:51`]. The non-sargable `to_date(left(season,4)…)`
  season-window predicate (weakness **M2**) is untouched — as expected; an index cannot fix a
  function-wrapped-column estimate. Fixing it (generated column / precomputed bounds) remains a
  schema change → still **ESCALATE** (already in §5).
- **`games` is still a Seq Scan** for the analysis filter (weakness **M2**); this index does not
  address `games`.
- Buffers rose slightly in all three (the composite index is 3 columns / wider than the
  single-column one, and the reshaped plans spill a bit more temp) — **this is caching/plan-shape,
  not a regression**: wall-clock dropped in all three because the sort + re-scan CPU was removed.

### Bottom line

The `0009` index does exactly what it was scoped to: it **eliminates the DISTINCT-ON sort** on
`fatigue_scores` in all three read paths and is **actually used** (verified in the plan). The
headline win is **`/api/analysis` 1380 → 304 ms (4.5×)**. The remaining spills on
`/api/analysis` and the explorer are **join / ORDER-BY sorts**, which by design this index cannot
remove — those need the already-flagged **query-shape** follow-ups (H1 LATERAL rewrite for the
home page, M3 SQL-side pagination for the explorer), not another index. No before/after
contradiction; no net regression. **No new escalation** beyond the M2 non-sargable-predicate item
already raised in §5.

_Evidence discipline: every number above was written to `docs/audit/tier3-explain-after.txt` (or
the pre-existing `tier3-explain.txt`) and re-read with the Read tool before citing — none taken
from grep/stdout. Secrets: the live `DATABASE_URL` was read only from `.env.local` at runtime and
never printed; host/user/password do not appear in any artifact._
