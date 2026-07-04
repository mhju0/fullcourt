# FullCourt — `getGamesByDate` (H1) rewrite-scope audit (READ-ONLY)

**Scope:** Confirm the current query structure + JS post-processing of `getGamesByDate`
(the `/` home-page read path, Tier-3 weakness **H1**), pin down the bottleneck, and fix the
**result-invariance boundary** a LATERAL rewrite must preserve. Pure code reading — **no DB
queries, no EXPLAIN, no source/config/git edits.** The only write is this report.
**Date:** 2026-07-04. **Model:** Opus 4.8.

**Starting point:** `docs/audit/tier3-performance.md` already analyzed H1 and the 0009 index;
this report re-verifies against code and narrows to the query-shape (LATERAL) rewrite that
Tier-3 explicitly deferred to "a separate later session" [Verified `docs/audit/tier3-performance.md:210-212`].

---

## 1. Inventory (what actually exists on disk)

- **Read path:** `GET /api/games/[date]` → `getGamesByDate(date)` — the handler calls it
  **once** and wraps the result in the `{data,error}` envelope
  [Verified `src/app/api/games/[date]/route.ts:24-25`].
- **Query file:** `src/lib/db/queries.ts`; `getGamesByDate` at lines **151–221**
  [Verified `src/lib/db/queries.ts:151`].
- **Fatigue subquery helper:** `latestFatigueSubquery(alias)` at **36–57**
  [Verified `src/lib/db/queries.ts:36-57`].
- **Two follow-up helpers:** `getTeamGameCountsInDaysBefore` (68–105) and `computeIs4In6Map`
  (108–145) [Verified `src/lib/db/queries.ts:68,108`].
- **Row → response mappers:** `mapJoinedRowToGameResponse` (261–334), `buildFatigueInfo`
  (668–709), `buildRestAdvantage` (712–730) [Verified `src/lib/db/queries.ts:261,668,712`].
- **Live indexes (from Tier-3):** `fatigue_scores` has `game_id_idx`, `team_id_idx`, `pkey`
  only [Verified `docs/audit/tier3-indexes.txt:3-8`]; the composite
  `(game_id, team_id, computed_at DESC)` is defined in `drizzle/0009` and reported hand-applied
  + valid on the live DB by the Tier-3 §6 re-measurement
  [Verified `drizzle/0009_fatigue_scores_distinct_on_index.sql:45-46`, `docs/audit/tier3-performance.md:314-315`].

---

## 2. Findings per scope question

### Q1 — Current query structure (round trips / joins / latest-per-side)

**Three DB round trips total, no N+1.** One main join query, then **two** follow-ups run
together via `Promise.all` [Verified `src/lib/db/queries.ts:213-216`].

**Main query** [Verified `src/lib/db/queries.ts:157-210`]:
```
FROM games
  INNER JOIN teams AS home_team  ON games.home_team_id = home_team.id        (L200)
  INNER JOIN teams AS away_team  ON games.away_team_id = away_team.id        (L201)
  LEFT  JOIN <home_fatigue_latest> ON gameId=games.id AND teamId=games.home_team_id  (L202-205)
  LEFT  JOIN <away_fatigue_latest> ON gameId=games.id AND teamId=games.away_team_id  (L206-209)
WHERE games.date = $date AND games.game_type = 'regular'                     (L210)
```
- `<home_fatigue_latest>` / `<away_fatigue_latest>` are **two instantiations of the same
  DISTINCT-ON subquery** (aliased `home_fatigue_latest` L154 / `away_fatigue_latest` L155)
  [Verified `src/lib/db/queries.ts:154-155`].
- **latest-per-side method:** `selectDistinctOn([gameId, teamId], {...11 cols...})
  ... orderBy(gameId, teamId, desc(computedAt))` — i.e. one row per `(game_id, team_id)`,
  keeping **max `computed_at`** [Verified `src/lib/db/queries.ts:38-56`]. It is a **whole-table**
  subquery (no `WHERE` on date/game) joined back to `games` after the fact.
- **Fatigue join is LEFT** (not INNER) — a game with no fatigue row still returns, with null
  fatigue columns [Verified `src/lib/db/queries.ts:202,206`].

**Two follow-ups** (batched, not per-game) [Verified `src/lib/db/queries.ts:213-216`]:
- `computeIs4In6Map(date, teamIds)` — one query, all team IDs via `inArray` (108–145).
- `getTeamGameCountsInDaysBefore(date, teamIds, 30)` — one query, all team IDs via `inArray`
  (68–105).

Matches Tier-3 finding (D): "1 main + 2 batched follow-ups, no per-row round trips"
[Verified `docs/audit/tier3-performance.md:151-157`].

### Q2 — JS post-processing inventory

| Computed field | Where | Input dependency | Extra DB read? | SQL-pushdown-able? |
|---|---|---|---|---|
| `is4In6` | `computeIs4In6Map` L108-145 → `buildFatigueInfo` extras L702 | 6-day window (date−5 … date), counts prior **final** games + tonight's game per team; threshold `≥4` (L144) | **Yes** — separate query (L214) | Yes, but out of H1 scope |
| `gamesInLast30Days` | `getTeamGameCountsInDaysBefore` L68-105 → extras L701 | 30-day window (date−30 … <date), **final** games only, per team | **Yes** — separate query (L215) | Yes, but out of H1 scope |
| `is3In4` (`is3In4Approx`) | `buildFatigueInfo` L683-684 | `gamesInLast7Days` + `daysSinceLastGame` — **both from the main-query fatigue row** | No | Already inline |
| `altitudePenalty` / `altitudeArenaLabel` | `buildFatigueInfo` L686-690 | `altitude_multiplier` (fatigue col) + side + home team city/altitude flag | No | Already inline |
| `daysRest`, `gamesInLast7Days`, `roadTripConsecutiveAway`, `hasCoastToCoastRoadSwing`, `isOvertimePenalty`, `isBackToBack`, `travelDistanceMiles`, `score` | `buildFatigueInfo` L692-708 | main-query fatigue columns (`parseFloat`/`?? default`) | No | Already inline |
| `restAdvantage` (`differential`, `advantageTeam`) | `buildRestAdvantage` L712-730 | the two `score`s; `NEUTRAL_THRESHOLD = 0.5` (L33, L721/723) | No | Pure JS |

**Only two JS computations require extra DB reads: `is4In6` and `gamesInLast30Days`.** Everything
else is derived from the single main-query row. These two are **not** part of the fatigue
subqueries and are **not** in the H1 rewrite target.

### Q3 — Bottleneck

**The two DISTINCT-ON fatigue subqueries scan the entire `fatigue_scores` table (~93,835 rows
each) even for an 8-game date**, because the `games.date` filter cannot be pushed into a
whole-table subquery [Verified `docs/audit/tier3-performance.md:143-147`;
`docs/audit/tier3-explain.txt:205,220`]. The 0009 composite index **removed the DISTINCT-ON
sort but not the full scan** — the post-index plan still materializes `rows=93835/93836` ×2
before merging with the 8-game day [Verified `docs/audit/tier3-performance.md:373,391`;
`docs/audit/tier3-explain-after.txt:190,199`]. Q3 wall-clock: **193.658 ms → 154.011 ms
(−20.5 %)** for **8 rows** [Verified `docs/audit/tier3-performance.md:370`]; ~154 ms is still a
fixed ~94k×2-row cost on the highest-traffic route.

**The two follow-ups are NOT the bottleneck.** Both are bounded by a small date window
(6-day / 30-day) plus a team `inArray`, so they hit `games_date_idx` over a narrow range
rather than scanning the table [Inferred from `src/lib/db/queries.ts:86-93,123-133` + the
`games_date_idx` on `date` at `src/lib/db/schema.ts:53`]. Tier-3 did not EXPLAIN these two
specifically, so their cost is **[Inferred]**, not measured.

**Agreement with Tier-3:** exact match to weakness **H1** — the bottleneck is the whole-table
fatigue dedup, and the fix is the **LATERAL query-shape rewrite** that Tier-3 flagged as a
separate session [Verified `docs/audit/tier3-performance.md:204-212`].

### Q4 — Result-invariance boundary (must survive a LATERAL rewrite)

A `LEFT JOIN LATERAL (SELECT … FROM fatigue_scores f WHERE f.game_id = games.id AND
f.team_id = games.{home|away}_team_id ORDER BY f.computed_at DESC LIMIT 1) ON true` must
reproduce the current output **byte-for-byte**. The fragile points:

1. **LEFT semantics, not INNER.** Fatigue-less games must still return with null fatigue
   (`buildFatigueInfo` returns `null` when `score === null` → both sides null →
   `restAdvantage = null`) [Verified `src/lib/db/queries.ts:679,716`]. Use `LEFT JOIN LATERAL …
   ON true`; an INNER/`CROSS JOIN LATERAL` would silently drop those games.
2. **Full 11-column projection.** The LATERAL must select every column the subquery does —
   `gameId, teamId, score, isBackToBack, gamesInLast7Days, travelDistanceMiles,
   altitudeMultiplier, daysSinceLastGame, isOvertimePenalty, roadTripConsecutiveAway,
   hasCoastToCoastRoadSwing` [Verified `src/lib/db/queries.ts:41-51`] — not just `score`.
   `mapJoinedRowToGameResponse` reads all of them (L266-306).
3. **Latest-row tie-break = `computed_at DESC` only.** Match the DISTINCT-ON ordering exactly
   [Verified `src/lib/db/queries.ts:55`]. With 0 duplicate `(game_id, team_id)` pairs today
   [Verified `docs/audit/tier3-performance.md:32-33`] the pick is unambiguous; **do not add a
   secondary key** (e.g. `id DESC`) — that would *change* behavior in the theoretical
   same-`computed_at` tie (both current and rewritten forms are intentionally nondeterministic
   there).
4. **Correlation predicate per side.** Home LATERAL correlates on `games.home_team_id`, away on
   `games.away_team_id` [Verified `src/lib/db/queries.ts:204,208`]. Swapping them silently
   mislabels fatigue.
5. **Outer filters unchanged.** `games.date = $date AND games.game_type = 'regular'` stays on
   the outer `games` WHERE [Verified `src/lib/db/queries.ts:210`]. The two team INNER JOINs are
   unchanged.
6. **Do not fold in `is4In6` / `gamesInLast30Days`.** They have different window/status
   semantics (is4In6 counts tonight's scheduled game + prior finals in a 6-day window
   L123-133; games30 counts only prior finals strictly before the date in a 30-day window
   L86-93) and are computed after the main query [Verified `src/lib/db/queries.ts:213-216`].
   The H1 rewrite touches **only** the two fatigue subqueries; leave these two helpers alone.
7. **`restAdvantage` math is downstream and pure** (`away.score − home.score`, threshold `0.5`)
   [Verified `src/lib/db/queries.ts:718-727`] — unaffected as long as points 1–4 hold and the
   same latest scores flow through.

### Q5 — Index status (does the rewrite need a new index?)

**No new index required.** The LATERAL's access pattern —
`WHERE game_id = ? AND team_id = ? ORDER BY computed_at DESC LIMIT 1` — is exactly served by the
existing `0009` composite `(game_id, team_id, computed_at DESC)`: an index seek to the
`(game_id, team_id)` prefix, then the first row in `computed_at DESC` order (no scan, no sort)
[Verified `drizzle/0009_fatigue_scores_distinct_on_index.sql:45-46`, which states the same
column order/direction contract at `:16-19`]. That index is defined on disk and reported
applied + valid on the live DB by Tier-3 §6 [Verified `docs/audit/tier3-performance.md:314-315`].
Its **current** live status was not re-queried this session (out of scope) — **[Inferred]** still
present; if absent, apply `0009` (already written) before the rewrite. Either way, **the rewrite
adds no new index and no `schema.ts` change** (per the CLAUDE.md ban, `schema.ts` keeps lagging).

---

## 3. Prioritized weakness list (proposals only — NOT applied)

- **H1 (High) — whole-table fatigue dedup on every home-page load.** ~154 ms fixed for 8 games
  because the two DISTINCT-ON subqueries materialize ~94k rows ×2 before the date join
  [Verified `docs/audit/tier3-performance.md:370,373`]. **Rewrite scope:** replace the two
  `latestFatigueSubquery(...)` + their two `.leftJoin(...)` in `getGamesByDate` **only** with
  two `LEFT JOIN LATERAL … ORDER BY computed_at DESC LIMIT 1` correlated subqueries. Touches
  ~15 lines in `queries.ts`; preserves §2-Q4 points 1–7; **no new index** (0009 backs it);
  no schema change.
- **L1 (Low, out of H1 scope) — `getGameById` shares the identical DISTINCT-ON pattern**
  [Verified `src/lib/db/queries.ts:342-343,385-392`]. The same LATERAL rewrite applies and would
  keep the two functions consistent, but it is a **separate** change — do not bundle it into the
  H1 diff unless explicitly asked.
- **(carry-forward) M2 non-sargable season-window predicate / `games` Seq Scan** — not in the
  `getGamesByDate` path (that query filters `date = $date`, using `games_date_idx`, per Tier-3
  Q3 `docs/audit/tier3-explain.txt:200-202`); already escalated in Tier-3 §5. No new escalation.

---

## 4. Recommended minimal-safe rewrite scope (implementation is a SEPARATE session)

1. In `getGamesByDate` (`src/lib/db/queries.ts:151-210`) only: drop the two
   `latestFatigueSubquery(...)` locals + the two `.leftJoin(homeFatigue…)/.leftJoin(awayFatigue…)`
   and express each as a correlated `LEFT JOIN LATERAL (SELECT <11 cols> FROM fatigue_scores f
   WHERE f.game_id = games.id AND f.team_id = games.home_team_id ORDER BY f.computed_at DESC
   LIMIT 1) home_fatigue ON true` (and the away analog).
2. Keep the select column list, the two team INNER JOINs, the `date`/`game_type` WHERE, the two
   `Promise.all` follow-ups, and all mappers **unchanged**.
3. **Do not** reconcile `schema.ts`; **do not** add an index (0009 already provides
   `(game_id, team_id, computed_at DESC)`); **do not** run drizzle-kit.
4. Validate byte-equality against the current output for the §2-Q4 boundary cases (esp. a date
   with a fatigue-less game → null fatigue / null restAdvantage; a neutral `|RA| < 0.5` game; an
   opener with `daysSinceLastGame = null`).

---

## 5. Open [Unknown]s (need runtime/impl confirmation, not in read-only scope)

- **[Unknown] Drizzle LATERAL ergonomics.** Whether Drizzle 0.45.2's query builder expresses
  `LEFT JOIN LATERAL` cleanly or the subquery must be raw `sql`\`\`. Resolve in the
  implementation session (query builder API), not here.
- **[Unknown] Live status of the 0009 index *right now*.** Reported applied by Tier-3 §6; not
  re-queried this session. Confirm with `pg_indexes` before/at rewrite time.
- **[Unknown] Post-rewrite latency.** The expected drop from ~94k×2-row materialization to ~16
  index seeks is **[Inferred]**; a before/after `EXPLAIN (ANALYZE)` on `getGamesByDate` is
  needed to confirm — out of this read-only scope.
- **[Unknown] Measured cost of `computeIs4In6Map` / `getTeamGameCountsInDaysBefore`.** Assumed
  cheap from their bounded date windows; never EXPLAIN'd.

_No number in this report was taken from grep/stdout — every figure was read from a source line
or a `docs/audit/tier3-*` evidence file with the Read tool and cited by `file:line`._
