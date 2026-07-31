-- =============================================================================
-- Playoff Rest — playoff_series.prior_grind_diff (2026-07-31)
-- =============================================================================
--
-- COMPLETE, STANDALONE migration: paste directly into the Supabase SQL editor.
-- It does NOT rely on `drizzle-kit push`.
--
-- Adds ONE nullable column to an existing table. Creates nothing else, drops
-- nothing, and does not touch teams / games / fatigue_scores / predictions /
-- playoff_series_predictions. RLS and grants on playoff_series already cover
-- this column (they are table-scoped, set in drizzle/0006_playoff_series.sql),
-- so no policy or grant changes are needed or included.
--
-- WHAT THE VALUE MEANS
--   One team's "grind" in its previous round = games_played - (4 if that series
--   was best-of-7 else 3), i.e. games played BEYOND a sweep. Range 0..3 (0..2
--   for a best-of-5). The format adjustment is mandatory: 136 of 320 Round 1
--   series (1985-86 .. 2001-02) were best-of-5, where a 5-game series means the
--   team went the FULL DISTANCE while in a best-of-7 it means they closed early.
--   Raw games played gives those opposite situations the same number.
--
--   prior_grind_diff = opponent's grind - home-court team's grind.
--
-- SIGN CONVENTION (deliberately INVERTED vs the other *_diff columns)
--   Every other *_diff on this table is (home-court - opponent). This one is
--   (opponent - home-court) so that POSITIVE STILL FAVORS THE HOME-COURT TEAM:
--   a positive value means the opponent was ground down more. Keeping the
--   *meaning* of the sign consistent matters more than keeping the subtraction
--   order consistent, because the model's coefficient sign is what gets read.
--
-- NULLABILITY CONTRACT
--   0     = Round 1. No prior round exists, so there genuinely is no
--           differential. This is a fact, not a fill value.
--   non-0 = rounds 2+ where both teams' prior series resolved.
--   NULL  = a prior series could not be resolved at all. The backfill reports
--           these as a count with their series keys; it never coerces to 0,
--           because a silent 0 is indistinguishable from a real Round 1 value.
-- =============================================================================

ALTER TABLE public.playoff_series
  ADD COLUMN IF NOT EXISTS "prior_grind_diff" numeric;

COMMENT ON COLUMN public.playoff_series.prior_grind_diff IS
  'Opponent prior-round grind minus home-court prior-round grind, where grind = games_played - (4 if best-of-7 else 3). POSITIVE FAVORS THE HOME-COURT TEAM (inverted vs the other *_diff columns by design). 0 in Round 1; NULL only when a prior series cannot be resolved.';
