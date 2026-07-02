-- 0008_shot_quality_grid.sql
-- Expected Shot Value (xeFG%) — aggregated spatial grid + model-output surface.
-- HAND-APPLIED in the Supabase SQL editor (already live). Recorded here for history.
-- Do NOT run drizzle-kit push/generate. Mirrors 0004 (RLS) / 0005 (grants) / 0007.

CREATE TABLE IF NOT EXISTS public.shot_grid (
  id                 serial PRIMARY KEY,
  season             varchar NOT NULL,
  team_id            integer REFERENCES public.teams(id),   -- NULL = league-wide
  cell_x             smallint NOT NULL,
  cell_y             smallint NOT NULL,
  zone_basic         varchar,
  zone_range         varchar,
  zone_area          varchar,
  fga                integer NOT NULL DEFAULT 0,
  fgm                integer NOT NULL DEFAULT 0,
  fg3a               integer NOT NULL DEFAULT 0,
  fg3m               integer NOT NULL DEFAULT 0,
  computed_at        timestamp NOT NULL DEFAULT now(),
  external_cell_key  varchar NOT NULL UNIQUE
);
CREATE INDEIF NOT EXISTS shot_grid_season_idx      ON public.shot_grid (season);
CREATE INDEX IF NOT EXISTS shot_grid_team_id_idx     ON public.shot_grid (team_id);
CREATE INDEX IF NOT EXISTS shot_grid_season_team_idx ON public.shot_grid (season, team_id);

CREATE TABLE IF NOT EXISTS public.shot_value_surface (
  id                    serial PRIMARY KEY,
  season                varchar NOT NULL,
  cell_x                smallint NOT NULL,
  cell_y                smallint NOT NULL,
  model_version         varchar NOT NULL,
  p_make                numeric,
  expected_efg          numeric,
  xpps                  numeric,
  created_at            timestamp NOT NULL DEFAULT now(),
  external_surface_key  varchar NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS shot_value_surface_season_idx       ON public.shot_value_surface (season);
CREATE INDEX IF NOT EXISTS shot_value_surface_season_model_idx ON public.shot_value_surface (season, model_version);

ALTER TABLE public.shot_grid          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shot_value_surface ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"      ON public.shot_grid          FOR SELECT USING (true);
CREATE POLICY "Allow service role all" ON public.shot_grid          FOR ALL    USING (auth.role() = 'service_role');
CREATE POLICY "Allow public read"      ON public.shot_value_surface FOR SELECT USING (true);
CREATE POLICY "Allow service role all" ON public.shot_value_surface FOR ALL    USING (auth.role() = 'service_role');

grant select on public.shot_grid          to anon;
grant select on public.shot_value_surface to anon;
grant select, insert, update, delete on public.shot_grid          to service_role;
grant select, insert, update, delete on public.shot_value_surface to service_role;
