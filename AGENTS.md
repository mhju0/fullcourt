# NBA Rest Advantage — agent notes

## Supabase Data API Grants

Supabase’s **Data API** (PostgREST behind `supabase-js`) only serves rows from tables that roles are allowed to access. Historically many projects relied on implicit defaults; Supabase is **requiring explicit `GRANT`s** so behavior is predictable: **new projects from May 30, 2026**, and **all existing projects from October 30, 2026**, will not expose `public` tables over the Data API without those grants.

**What we do:** migration `drizzle/0005_supabase_grants.sql` issues explicit grants on our four app tables: `teams`, `games`, `fatigue_scores`, `predictions`.

**Roles:**

| Role            | Permissions on those tables | Used for |
|-----------------|-----------------------------|----------|
| `anon`          | `SELECT` only               | Client reads via `supabase-js` (public browsing) |
| `service_role`  | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | API route handlers and pipeline scripts that use the service key |

**When you add a new `public` table** to the Drizzle schema and ship it to Supabase, **extend the grants** in a new migration (same pattern as `0005`): add `grant select … to anon` and `grant select, insert, update, delete … to service_role` for that table, or the Data API will not see it after the enforcement date.

Apply SQL migrations in the Supabase SQL editor (or your chosen migration path) when you are ready; do not assume they run automatically unless your repo is wired for it.

## Vercel cron (offseason)

`vercel.json` schedules `/api/cron/update` at **`0 10 1 * *`** (10:00 UTC on the **1st of each month**) during the offseason — JSON cannot contain comments, so this section is the source of truth.

**Regular season:** change the schedule back to **`"0 10 * * *"`** (daily at 10:00 UTC) when games are on the calendar again (~October).
