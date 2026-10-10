# Live-season verification

Use when completed games resume. The calendar and available feed data determine the date;
do not treat an old seeded schedule snapshot as a current announcement.

A change freeze covers this period: from 2026-10-17 until the first completed slate passes the
checklist below ([D-80](DECISIONS.md)).

## What must be demonstrated

An in-season run must match actual completed games, write their scores/status, and refresh the
required fatigue/prediction data. A successful offseason skip or a no-op on already-correct
historical games does not establish this. Preserve the relevant run ID and write counts.

## The two writers

| Writer | Configured UTC schedule | Responsibility |
| --- | --- | --- |
| Daily NBA update | `0 21 * * *` | Recent final score/status/overtime sync, game context, projection gaps, fatigue and predictions |
| Vercel `/api/cron/update` | Twelve entries, one per hour from 21:00 to 08:00 UTC | Final scores for yesterday and today (ET); separate from the full modeling pipeline |

Both store finished games only ([D-81](DECISIONS.md)). A game in progress is left as
`scheduled` and reported as "in progress (left alone)"; the Games page marks it LIVE from its
tip time. Two timing facts: GitHub has been starting the daily job two and a half to five hours
late, and Vercel fires each cron entry at some point inside its hour, so a final appears between
a few minutes and about two hours after the game ends.

See `.github/workflows/daily-update.yml`, `scripts/daily_update.py`, `scripts/run-daily.ts`,
and `src/app/api/cron/update/route.ts` for exact windows and behavior. Convert UTC to Eastern
for the date being checked; daylight-saving offsets change. A run before tip-off correctly has
no final scores for that night's games.

On the first night also confirm, in the Vercel project's cron list, that all twelve entries
registered and that the early ones ran. Twelve entries on one path had not been deployed before.

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
   projected-versus-measured labels. During the games, a row should read LIVE after its tip
   time, PENDING three hours later, and FINAL over the score once a cron run has stored it. Provider probes alone cannot prove these paths work.
7. Record the run, date window, actual write counts, and remaining anomalies in the issue or PR.

If a provider is unavailable, retain published data and surface the failure. Do not manufacture
scores or replace missing measurements with zero. Never overwrite a stored final blindly, apply
schema migrations automatically, or refit coefficients as an ingest repair.
