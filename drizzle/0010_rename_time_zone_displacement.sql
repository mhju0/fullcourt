-- 0010: rename fatigue_scores.has_coast_to_coast_road_swing → has_time_zone_displacement
--
-- Ratified 2026-07-29 (Phase 2 of the fatigue plan): the flag's semantics changed from
-- "large longitude spread across the current road trip" to "tonight's game is on the
-- road ≥2 time zones (≥26° longitude) from the home arena" — a circadian-displacement
-- term, computed only for road games and never retroactively at home.
--
-- Pure column rename: data, type, default, and indexes are preserved; RLS policies and
-- grants on fatigue_scores are unaffected. Apply AFTER the Phase 2 recompute has
-- repopulated fatigue_scores, and coordinate with the code-side flip of the column
-- string in src/lib/db/schema.ts (the TS property is already named
-- hasTimeZoneDisplacement; only the quoted column name changes).

ALTER TABLE fatigue_scores
  RENAME COLUMN has_coast_to_coast_road_swing TO has_time_zone_displacement;

COMMENT ON COLUMN fatigue_scores.has_time_zone_displacement IS
  'Tonight''s game is on the road >=2 time zones (>=26 deg longitude) from the home arena. Renamed from has_coast_to_coast_road_swing on 2026-07-29; the old trip-spread semantics were retired with the same-day recompute.';
