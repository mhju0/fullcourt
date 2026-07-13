-- =============================================================================
-- Supabase Data API — explicit table grants (PostgREST / supabase-js)
-- =============================================================================
--
-- Supabase is tightening defaults: new projects from May 30, 2026 will not
-- expose public schema tables to the Data API without explicit GRANTs; from
-- October 30, 2026 the same applies to existing projects.
--
-- This migration grants:
--   • anon          — SELECT only (browser / supabase-js public reads)
--   • service_role — full CRUD (API routes, scripts, server-side writes)
--
-- Apply manually in the Supabase SQL editor. Do not run drizzle-kit push/generate;
-- schema.ts intentionally lags the live database.
--
-- When you add new public tables later, add matching GRANT lines in the same
-- migration pattern so the Data API keeps working after Supabase’s deadline.
-- =============================================================================

-- Explicit grants for all public tables (Supabase Data API requirement, enforced Oct 30 2026)
-- anon role: read-only for public data browsing via supabase-js
-- service_role: full access for pipeline scripts and API routes

grant select on public.teams to anon;
grant select on public.games to anon;
grant select on public.fatigue_scores to anon;
grant select on public.predictions to anon;

grant select, insert, update, delete on public.teams to service_role;
grant select, insert, update, delete on public.games to service_role;
grant select, insert, update, delete on public.fatigue_scores to service_role;
grant select, insert, update, delete on public.predictions to service_role;
