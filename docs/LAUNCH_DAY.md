# Live-season verification

Use when completed games resume. The calendar and available feed data determine the date;
do not treat an old seeded schedule snapshot as a current announcement.

## What must be demonstrated

An in-season run must match actual completed games, write their scores/status, and refresh the
required fatigue/prediction data. A successful offseason skip or a no-op on already-correct
historical games does not establish this. Preserve the relevant run ID and write counts.

## The two writers

| Writer | Configured UTC schedule | Responsibility |
| --- | --- | --- |
| Daily NBA update | `0 21 * * *` | Recent score/status/overtime sync, game context, projection gaps, fatigue and predictions |
| Vercel `/api/cron/update` | `0 7 * * *` | Recent score/status updates; separate from the full modeling pipeline |

See `.github/workflows/daily-update.yml`, `scripts/daily_update.py`, `scripts/run-daily.ts`,
and `src/app/api/cron/update/route.ts` for exact windows and behavior. Convert UTC to Eastern
for the date being checked; daylight-saving offsets change. An afternoon run before tip-off
correctly has no final scores for that night's games.

## Checklist

1. Check the actual season schedule and date selection on Games. Confirm the schedule exists
   before expecting a live slate; [rollover](SEASON_ROLLOVER.md) owns seeding and re-keying.
2. Inspect an Actions run after the games finish:
   `gh run list --workflow daily-update.yml --limit 5`, then `gh run view <run-id> --log`.
3. Confirm the season gate entered the ingest path. Review matched games, rows written, errors,
   unmatched stored games, and contradicted finals. Do not accept a green exit code alone.
4. Confirm expected completed games have the correct Eastern date, teams, scores, and status.
   Inspect fatigue/prediction refresh output separately from score updates.
5. Run the relevant read-only data and prediction audits. Review any write command's scope
   before repairing data; the script inventory distinguishes maintenance from publication.
6. Check `/api/health` and the public Games page. Verify the completed slate, details, and
   projected-versus-measured labels. Provider probes alone cannot prove these paths work.
7. Record the run, date window, actual write counts, and remaining anomalies in the issue or PR.

If a provider is unavailable, retain published data and surface the failure. Do not manufacture
scores or replace missing measurements with zero. Never overwrite a stored final blindly, apply
schema migrations automatically, or refit coefficients as an ingest repair.
