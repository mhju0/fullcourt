# Season rollover

Calendar behavior derives from America/New_York dates in `src/lib/nba-season.ts` and
`scripts/season_window.py`. Verify the actual available schedule before ingest; earlier source
reachability or seeded-game counts are not current guarantees.

## Automatic behavior

Season lists and date helpers derive from the current Eastern date. Browsable seasons can expose
an upcoming season before it has completed games. Games defaults to the completed regular season
during the offseason and offers the upcoming season only when its schedule exists. Explicit URL
selection wins. Other pages validate season support and show a fallback when necessary.

`NBA_SEASONS` reads the date once, when the module loads, so a page built before October 1 and
a long-running server keep the previous list. Deploy once on or after October 1 (ET), then check
that the new season appears in the season selector and on `/behind-the-data/data-and-limits`.

Playoff Rest and Expected Shot Value default to their latest usable database publication,
independently of the October calendar transition. Their explicit season selections remain
shareable; an unpublished selected season explains the missing data and offers the latest
results. `/data-status` separates schedule coverage, result evidence and recorded refresh dates.

The daily pipeline season-gates on ESPN's published regular-season dates, with an
October–April fallback; Vercel cron remains scheduled year-round and has its own
no-work behavior. Neither needs an annual cron-expression edit. Officiating defaults to the
latest published season, not a guessed empty source season.

## Operational sequence

1. Confirm the new schedule exists and check provider reachability from the environment that
   will run the ingest. Use the provider probe workflow diagnostically, then inspect actual data.
2. Select the correct schedule ingest path from [Data pipeline](DATA_PIPELINE.md). The ESPN
   seed tool takes the explicit season and date window; inspect its help/source before writing.
   Never assume external IDs can be generated from game order.
3. Audit Eastern dates, teams, duplicate IDs, game types, and schedule coverage. Treat partial
   schedules as partial rather than inventing missing fixtures.
4. Generate projected fatigue only through its producer. Confirm projected and measured values
   remain visibly distinct on Games and Schedule Edge.
5. When completed games resume, follow [live-season verification](LAUNCH_DAY.md). A green
   offseason skip does not establish the score-sync or fatigue path.
6. Once hoopR has played-game box scores, cache the relevant season through the shooting ingest,
   then review the re-key dry run below before applying it.
7. Reproduce the affected shooting and other seasonal publications using their own protocols.
   Update generated artifacts and their tests together; inspect each page's freshness labels.
8. For L2M, collect a complete source snapshot and review its publication branch through
   [Officiating operations](OFFICIATING.md). Do not replace the previous published season with
   an incomplete or unavailable report index.

## ESPN-to-canonical ID re-key

Example for the 2026–27 season; substitute the intended season explicitly:

```sh
pnpm exec tsx scripts/rekey_season_from_hoopr.ts 2026-27
# Only after inspecting the dry run and authorizing the write:
pnpm exec tsx scripts/rekey_season_from_hoopr.ts 2026-27 --apply
```

The prerequisite is cached `ml/data/shooting/team_boxscores_<startYear>.csv` from the shooting
fetcher. The script matches final teams/scores, checks ambiguity and target collisions, and only
changes eligible `espn-` external IDs. Database primary keys remain stable. Read its source for
current guards; do not bypass a refused match. The shooting analysis needs canonical regular-season
IDs, so this is a data-join requirement rather than a cosmetic rename.

No rollover authorizes coefficient changes, schema reconciliation, or a dependency upgrade.
Keep secrets out of logs and Git; verify a preview before merging publications to main.

## Shooting publication preparation

Use `python3 scripts/fetch_shooting_data.py --season-year 2026 --force` to request the
2026–27 provider cache explicitly once it exists. The default historical range remains
unchanged; this command does not write the database or publish the site. Retain the canonical
ID reconciliation above before expecting seeded ESPN fixtures to join NBA-stat boxscores.

`export_player_rest.py` checks current/upcoming-season inputs before writing its artifact.
The read-only guard requires the internal season-availability condition for all expected
franchises and blocks early career pooling as well as early season rows. A blocked export
leaves the existing published file intact. No provider source, generated artifact, automatic
refresh cadence or successful in-season collection is implied by this preparation.
