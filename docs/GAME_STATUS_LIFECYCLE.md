# Game lifecycle support

Prepared 2026-10-18. This change is local implementation until the reviewed candidate is released.

`games.status` records `scheduled`, legacy `live`, `final`, `postponed`, or `cancelled`.
ESPN's exact `status.type.name`, `state`, and `completed` must agree. `STATUS_POSTPONED`
(id 6) and `STATUS_CANCELED` (id 5) both use `post` with `completed: false`; neither carries a
published score. The minimized authentic responses in `src/lib/__tests__/fixtures/` retain
source URLs and retrieval dates. Missing/unknown events preserve stored values.

The cron and nightly score shells both call `writeGameStatus`. It locks the complete union
of the source fixture and related future scheduled fixtures in immutable ID order, then reads
the source identity/status again. A changed date/pairing aborts. Final results cannot downgrade;
a held fixture cannot return to scheduled/live from a stale pregame feed. A matching final on
the same ET date is the only automatic exit from a hold. In-game scores remain unpublished.

When entering a hold or moving from a hold to final, the transaction removes derived fatigue
and unresolved predictions only for future scheduled fixtures involving either team within the
30-day model lookback. It preserves tipped fixtures, resolved predictions, and historical rows.
Read paths require a complete fatigue pair before publishing an upcoming pick. Missing pairs
are recovered by the existing locked prospective writer, including dates beyond tomorrow;
nightly `project_fatigue.ts` also fills them. A failed invalidation rolls back the status.
Readers can temporarily show missing fatigue during recovery; no fabricated zero replaces it.

Held fixtures remain visible with explicit labels on Games, team schedules, and game details,
and accessible row names announce the status. They never become LIVE/PENDING from the clock.
They are excluded from workload, travel legs, model projections, export rows and pending picks.
Postponed keeps a season unresolved; cancelled is terminal without counting as a played game.

## Release and manual maintenance

Read-only production metadata on 2026-10-18 found `public.games.status` is unconstrained
`character varying` and `games` has no CHECK constraints. No schema migration is needed or
provided. The ORM schema remains intentionally incomplete; never run schema reconciliation.

1. Freeze and independently review the exact candidate. Verify preview Games/team/detail
   states and the PostgreSQL contracts before any release.
2. Release application and scheduled scripts together; avoid an old score writer running
   alongside the new lifecycle writer. Do not run manual seed/context/schedule maintenance
   concurrently with either automated writer. Those maintenance paths have separate lock
   contracts; a deadlock/timeout must roll back and be retried after maintenance, never reported
   as a completed status update.
3. Observe cron/nightly outcomes and prospective recovery. A failed date or transaction remains
   degraded and is retried by the next run. Current-season held rows are polled beyond yesterday.
4. A moved date/pairing is reported, not rekeyed. The ESPN seeder refuses identity changes and
   lifecycle transitions requiring invalidation. Python schedule upserts preserve held states
   and skip conflicts with changed identity. A reschedule/reopen needs an owner-reviewed
   identity/date/tip operation and prospective invalidation plan; this change supplies no
   automatic reopen or destructive historical correction.

Rollback: stop automated writers before reverting code. Do not deploy the older score writer
while held rows exist: it can relabel them as scheduled. Preserve stored holds and missing
fatigue; restore the reviewed writer or prepare an owner-reviewed compatibility rollback.
No production rollback SQL or status rewrite is authorized by this document.

## Evidence

- `scripts/tests/game-status.pg.ts`: explicit disposable loopback PostgreSQL only, no `.env.local`;
  roundtrip/invalidation boundaries, recovery, final/hold race, rollback on injected failure.
- `e2e/game-status.spec.ts`: synthetic API fixtures at tip, +3h and +12h, 390px and 1280px.
- Live provider collection, scheduled execution on an actual postponed game, physical iPhone,
  and owner-managed rescheduling remain unverified until exercised in their real environments.
