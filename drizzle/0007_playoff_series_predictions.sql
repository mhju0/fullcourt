-- =============================================================================
-- Playoff Predictor — playoff_series_predictions table (Phase 4 / T4)
-- =============================================================================
--
-- COMPLETE, STANDALONE migration: paste directly into the Supabase SQL editor to
-- stand up public.playoff_series_predictions. It does NOT rely on `drizzle-kit push`.
--
-- FIRST new DB table added since the playoff module began. One row per (series,
-- prediction_method, model_version): the model's predicted probability that the
-- HOME-COURT (reference) team wins that series.
--
-- Authoritative source: the `playoffSeriesPredictions` table in src/lib/db/schema.ts.
-- Column types, defaults, NOT NULLs, the serial PK, the UNIQUE, the FKs, and the
-- series index are transcribed from there using Drizzle's constraint-naming
-- convention. RLS + policies mirror drizzle/0004_enable_rls.sql; grants mirror
-- drizzle/0005_supabase_grants.sql; the standalone-migration shape mirrors
-- drizzle/0006_playoff_series.sql.
--
-- ORIENTATION CONTRACT (must match Phase 3, ml/train_series_model.py:16,108,116):
--   predicted_home_court_win_prob = P(series_winner == home_court_team), i.e. the
--   probability of the label y=1. predicted_winner_team_id = the series'
--   home_court_team_id when prob >= 0.5, else its opponent_team_id.
--
-- Scope: references ONLY playoff_series(id) and teams(id). Creates nothing else,
-- drops nothing, and does not touch teams / games / fatigue_scores / predictions /
-- playoff_series data.
-- =============================================================================

-- (a) Table + (b) PK + UNIQUE constraint
--     - predicted_home_court_win_prob is numeric (Drizzle decimal() -> numeric);
--       Postgres `decimal` is an alias for `numeric`. Holds P(home-court wins).
--     - external_series_key is denormalized from playoff_series for auditability and
--       join-free display; series_id is the canonical FK.
--     - The UNIQUE(series_id, prediction_method, model_version) makes re-runs
--       idempotent (the writer uses ON CONFLICT on this tuple).
CREATE TABLE public.playoff_series_predictions (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"external_series_key" varchar NOT NULL,
	"predicted_home_court_win_prob" numeric NOT NULL,
	"predicted_winner_team_id" integer NOT NULL,
	"prediction_method" varchar(32) NOT NULL,
	"model_version" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playoff_series_predictions_series_method_version_unique" UNIQUE("series_id","prediction_method","model_version")
);

-- (b) Foreign keys (Drizzle naming: <table>_<col>_<reftable>_<refcol>_fk)
ALTER TABLE public.playoff_series_predictions ADD CONSTRAINT "playoff_series_predictions_series_id_playoff_series_id_fk" FOREIGN KEY ("series_id") REFERENCES public.playoff_series("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE public.playoff_series_predictions ADD CONSTRAINT "playoff_series_predictions_predicted_winner_team_id_teams_id_fk" FOREIGN KEY ("predicted_winner_team_id") REFERENCES public.teams("id") ON DELETE no action ON UPDATE no action;

-- (c) Series index (btree) for series-scoped reads / joins
CREATE INDEX "playoff_series_predictions_series_id_idx" ON public.playoff_series_predictions USING btree ("series_id");

-- (d) Enable Row-Level Security (mirrors 0004_enable_rls.sql)
ALTER TABLE public.playoff_series_predictions ENABLE ROW LEVEL SECURITY;

-- (e) Policies (wording mirrors 0004_enable_rls.sql verbatim)
-- Public read access (anon key can SELECT)
CREATE POLICY "Allow public read" ON public.playoff_series_predictions FOR SELECT USING (true);

-- Service role full access (data pipeline + API routes use DATABASE_URL with service role)
CREATE POLICY "Allow service role all" ON public.playoff_series_predictions FOR ALL USING (auth.role() = 'service_role');

-- (f) Supabase Data API grants (mirrors 0005_supabase_grants.sql)
-- anon role: read-only for public data browsing via supabase-js
grant select on public.playoff_series_predictions to anon;
-- service_role: full access for pipeline scripts and API routes
grant select, insert, update, delete on public.playoff_series_predictions to service_role;
