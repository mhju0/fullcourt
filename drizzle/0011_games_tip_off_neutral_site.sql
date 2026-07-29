-- =============================================================================
-- Games — tip-off timestamp and neutral-site flag
-- =============================================================================
--
-- Two fatigue inputs the model has never had:
--
--   tip_off_utc  — `games.date` is a bare date, so a 10:30pm ET tip and a 7:00pm
--                  tip are indistinguishable today. Actual turnaround between a
--                  game's tip and the next one is the physical quantity the
--                  back-to-back multiplier has been approximating with calendar
--                  days. Observed spread in ESPN data: 23:00–03:00 UTC.
--
--   neutral_site — travel legs currently geolocate every game at the listed home
--                  team's arena (docs/audit/travel-model-accuracy.md, finding C).
--                  Paris/Mexico City/Las Vegas games are materially wrong for the
--                  teams involved. ESPN marks these; 28 found.
--
--   neutral_venue_city — the flag alone cannot fix a travel leg; the leg needs a
--                  location. Only five cities appear across every neutral game
--                  (Paris, Mexico City, London, Las Vegas, Berlin), so the city
--                  name is stored here and its coordinates live in code beside the
--                  other venue geography, rather than in a venues table.
--
-- Known gap: ESPN sets neutralSite only from 2013 on, so earlier international
-- games (Mexico City from 1997, London 2011-12) are not marked. Consistent with the
-- ratified "apply where the data exists, document the limitation" decision.
--
-- Both are nullable/defaulted and additive — nothing reads them until the
-- follow-up code change lands, and every existing row stays valid.
--
-- Column-level grants are not required: new columns inherit the table grants
-- already issued in 0005_supabase_grants.sql.
--
-- Apply manually in the Supabase SQL editor. Do not run drizzle-kit push/generate;
-- schema.ts intentionally lags the live database.
-- =============================================================================

alter table public.games add column if not exists tip_off_utc timestamptz;

alter table public.games add column if not exists neutral_site boolean not null default false;

alter table public.games add column if not exists neutral_venue_city varchar;
