-- =============================================================================
-- Playoff Predictor — playoff_series table (Phase 2a)
-- =============================================================================
--
-- COMPLETE, STANDALONE migration: paste directly into the Supabase SQL editor to
-- stand up public.playoff_series. It does NOT rely on `drizzle-kit push`.
--
-- Authoritative source: the `playoffSeries` table in src/lib/db/schema.ts. Column
-- types, defaults, NOT NULLs, the serial PK, the UNIQUE on external_series_key,
-- the three teams(id) FKs, and the season index are transcribed from there, using
-- Drizzle's constraint-naming convention. RLS + policies mirror
-- drizzle/0004_enable_rls.sql; grants mirror drizzle/0005_supabase_grants.sql.
--
-- Scope: references ONLY playoff_series. Creates nothing else, drops nothing,
-- and does not touch teams / games / fatigue_scores / predictions.
-- =============================================================================

-- (a) Table + (b) PK + UNIQUE constraint (column order matches schema.ts)
CREATE TABLE public.playoff_series (
	"id" serial PRIMARY KEY NOT NULL,
	"season" varchar NOT NULL,
	"round" smallint NOT NULL,
	"conference" varchar,
	"home_court_team_id" integer NOT NULL,
	"opponent_team_id" integer NOT NULL,
	"is_best_of_7" boolean NOT NULL,
	"series_winner_team_id" integer,
	"home_court_wins" smallint,
	"opponent_wins" smallint,
	"seed_diff" numeric,
	"win_pct_diff" numeric,
	"entry_rest_diff" numeric,
	"h2h_diff" numeric,
	"external_series_key" varchar NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playoff_series_external_series_key_unique" UNIQUE("external_series_key")
);

-- (b) Foreign keys → public.teams(id) (Drizzle naming: <table>_<col>_teams_id_fk)
ALTER TABLE public.playoff_series ADD CONSTRAINT "playoff_series_home_court_team_id_teams_id_fk" FOREIGN KEY ("home_court_team_id") REFERENCES public.teams("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE public.playoff_series ADD CONSTRAINT "playoff_series_opponent_team_id_teams_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES public.teams("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE public.playoff_series ADD CONSTRAINT "playoff_series_series_winner_team_id_teams_id_fk" FOREIGN KEY ("series_winner_team_id") REFERENCES public.teams("id") ON DELETE no action ON UPDATE no action;

-- (c) Season index (btree)
CREATE INDEX "playoff_series_season_idx" ON public.playoff_series USING btree ("season");

-- (d) Enable Row-Level Security (mirrors 0004_enable_rls.sql)
ALTER TABLE public.playoff_series ENABLE ROW LEVEL SECURITY;

-- (e) Policies (wording mirrors 0004_enable_rls.sql verbatim)
-- Public read access (anon key can SELECT)
CREATE POLICY "Allow public read" ON public.playoff_series FOR SELECT USING (true);

-- Service role full access (data pipeline + API routes use DATABASE_URL with service role)
CREATE POLICY "Allow service role all" ON public.playoff_series FOR ALL USING (auth.role() = 'service_role');

-- (f) Supabase Data API grants (mirrors 0005_supabase_grants.sql)
-- anon role: read-only for public data browsing via supabase-js
grant select on public.playoff_series to anon;
-- service_role: full access for pipeline scripts and API routes
grant select, insert, update, delete on public.playoff_series to service_role;
