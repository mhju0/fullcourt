-- =============================================================================
-- Shooting by Rest — team_game_shooting table  ** DRAFT — NOT APPLIED **
-- =============================================================================
--
-- This file is in drizzle/draft/, not drizzle/, on purpose. Phase 1 of the
-- Shooting by Rest module is an internal analysis that reads a local file cache
-- and writes nothing to the database. See
-- docs/superpowers/specs/2026-07-28-shooting-by-rest-design.md §2 and §8.
--
-- It is written now, while the required columns are known exactly, so that the
-- shape is not re-derived later. Apply it ONLY if the module proceeds past the
-- Phase 1 decision in §9 — and move the file to drizzle/0010_… when you do, so
-- that the applied set stays the numbered sequence.
--
-- Grain: one row per (game, team). ~71,000 rows for 1996-97 → 2025-26.
--
-- Deliberately stores COUNTS ONLY, never rates. eFG%, TS% and any bucket rate are
-- derived downstream. This mirrors the shot_grid decision in 0008: a stored rate
-- cannot be re-aggregated, and a stored rate that disagrees with its own counts is
-- a bug that is invisible until someone sums two rows.
--
-- Follows 0006/0007/0008: standalone, paste-able into the Supabase SQL editor, no
-- drizzle-kit push. RLS mirrors 0004; grants mirror 0005.
-- =============================================================================

CREATE TABLE public.team_game_shooting (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	-- 'home' | 'away'. Redundant against games.home_team_id, but the ingest keys on
	-- it (hoopR ships `side`, not a team id we recognise), so storing it makes the
	-- load idempotent without a team-id mapping table.
	"side" varchar(4) NOT NULL,
	"fgm" smallint NOT NULL,
	"fga" smallint NOT NULL,
	"fg3m" smallint NOT NULL,
	"fg3a" smallint NOT NULL,
	"ftm" smallint NOT NULL,
	"fta" smallint NOT NULL,
	"points" smallint NOT NULL,
	-- Provenance. Not decoration: hoopR mirrors stats.nba.com, so if a future
	-- backfill draws from ESPN instead, rows from the two must stay distinguishable
	-- when they disagree. See docs/adr/0002-shooting-source-hoopr.md.
	"source" varchar(16) DEFAULT 'hoopr' NOT NULL,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);

-- One row per team per game.
ALTER TABLE public.team_game_shooting
	ADD CONSTRAINT team_game_shooting_game_team_unique UNIQUE ("game_id", "team_id");

ALTER TABLE public.team_game_shooting
	ADD CONSTRAINT team_game_shooting_game_id_games_id_fk
	FOREIGN KEY ("game_id") REFERENCES public.games("id") ON DELETE cascade;

ALTER TABLE public.team_game_shooting
	ADD CONSTRAINT team_game_shooting_team_id_teams_id_fk
	FOREIGN KEY ("team_id") REFERENCES public.teams("id") ON DELETE cascade;

-- Guard the arithmetic at the storage layer. A made shot that was never attempted,
-- or more threes than field goals, is a parse bug — and the cheapest place to catch
-- it is before it reaches a chart.
ALTER TABLE public.team_game_shooting
	ADD CONSTRAINT team_game_shooting_counts_sane CHECK (
		"fga" > 0
		AND "fgm" <= "fga"
		AND "fg3m" <= "fg3a"
		AND "fg3a" <= "fga"
		AND "fg3m" <= "fgm"
		AND "ftm" <= "fta"
	);

ALTER TABLE public.team_game_shooting
	ADD CONSTRAINT team_game_shooting_side_valid CHECK ("side" IN ('home', 'away'));

-- The analysis always enters by game, then joins fatigue_scores on (game_id, team_id).
CREATE INDEX team_game_shooting_game_idx ON public.team_game_shooting ("game_id");
CREATE INDEX team_game_shooting_team_idx ON public.team_game_shooting ("team_id");

-- RLS: anon reads, service role writes. Mirrors 0004/0005.
ALTER TABLE public.team_game_shooting ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_game_shooting_anon_select"
	ON public.team_game_shooting FOR SELECT TO anon USING (true);

CREATE POLICY "team_game_shooting_service_all"
	ON public.team_game_shooting FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.team_game_shooting TO anon;
GRANT ALL ON public.team_game_shooting TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.team_game_shooting_id_seq TO service_role;
