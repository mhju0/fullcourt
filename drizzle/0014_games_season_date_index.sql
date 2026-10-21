-- 0014_games_season_date_index.sql
-- Index for season-scoped reads of games.
-- HAND-APPLY in the Supabase SQL editor. Do NOT run drizzle-kit push/generate,
-- and do NOT sync schema.ts to this index (schema.ts intentionally lags the live DB).
--
-- WHY (review, 2026-10-21): the season pages, Schedule Edge, team schedules and upcoming games
--      all filter games by `season` (eq(games.season, …) in src/lib), and most order by date.
--      games has indexes on date, status and each team, but none on season, so a season read
--      scans every season since 1985-86 to keep about 1,300 rows.
--      This was not measured against production. Step 1 checks the claim before you build it.
--
-- RLS/GRANTS: none needed. An index on an existing table is orthogonal to row-access policies.
--
-- ── APPLY (Supabase SQL editor) ──────────────────────────────────────────────
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block: run it BY ITSELF. If the
--   editor wraps it in a transaction, use the non-concurrent fallback below (it blocks writes
--   to games for the few seconds the build takes; avoid the nightly job's window).
--
--   1. Baseline. Expect "Seq Scan on games". If the plan already uses an index, stop here.
--        explain (analyze, buffers)
--        select id, date from public.games
--        where season = '2025-26' and game_type = 'regular'
--        order by date;
--   2. Run the CREATE INDEX CONCURRENTLY statement below (alone).
--   3. Verify:
--        select indexname, indexdef from pg_indexes
--        where schemaname = 'public' and tablename = 'games';
--      Expect a row: games_season_date_idx.
--   4. Re-run step 1. Expect an Index Scan using games_season_date_idx and fewer buffers.
--      If the plan did not change, drop the index (ROLLBACK) — it would only cost writes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS games_season_date_idx
  ON public.games (season, date);

-- ── NON-CONCURRENT FALLBACK (only if the editor forces a transaction) ─────────
-- CREATE INDEX IF NOT EXISTS games_season_date_idx ON public.games (season, date);

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- DROP INDEX CONCURRENTLY IF EXISTS public.games_season_date_idx;
