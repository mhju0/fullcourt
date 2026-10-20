# Data Status and historical conference correction (2026-10-20)

This records audit handoff sections 5–6. No database writes were made.

## Observed snapshot population

The repeatable-read, read-only snapshot captured at `2026-10-20 06:38:01.123073+00`
is in `docs/audit/arena-shooting-correction/snapshot.json.gz`; `capture.json` records
canonical SHA-256 `ef953faeb133a329a636653ed017091da17c27639adbb44bf2d8bd4eedf8159b`.

An independent scan selected final regular-season games with both scores, removed the
2019-20 abnormal stretch using the current published date bounds, and required matching
fatigue rows for both participating teams. It found:

| Population | Games |
| --- | ---: |
| Published final games with paired fatigue evidence | 47,143 |
| Neutral-site subset | 49 |
| Venue-baseline population (neutral sites excluded) | 47,094 |

The latest evidence date is `2026-04-12`. The original Data Status label used the third
population while describing the first. The page now reads a separately cached summary
of the existing `getCompletedGamesWithFatigue()` query. The query retains
`publishableGames()` and the latest-fatigue pair joins; no public analysis response or
model calculation changed. The production count remains derived from rows.

The pure coverage test pins the owner's audited count while exercising inclusion of
neutral-site games and exclusion of those same games from the venue baseline. A rendered
async page test checks the exact coverage sentence and its unavailable state. A cache
test checks correction invalidation and neutral-site inclusion.

## Historical conference evidence and proposed delta

The [Pelicans 2023–24 official media guide](https://cdn.nba.com/teams/uploads/sites/1610612740/2023/10/Pelicans-2324-Media-Guide.pdf),
printed page 96 (PDF page 97), lists New Orleans as Eastern in 2002-03 and 2003-04,
and Western beginning in 2004-05. Downloaded PDF SHA-256:
`10102132eb90c4a8cebdcf8bbbffad5a2c541cf254b0592baf2cad3d1c42d6a0`.
[NBA's 2004–05 season review](https://www.nba.com/news/history-season-review-2004-05)
also records the Hornets' move from the Central Division to the Western Conference's
Southwest Division. Both sources were fetched on 2026-10-20.

The builder now resolves the two New Orleans seasons before comparing the participants'
conferences. Rebuilding all 600 series from the snapshot, deriving rounds, then finalizing
with the corrected resolver produces exactly these proposed metadata changes:

| Series ID | Stable key | Column | Before | After |
| --- | --- | --- | --- | --- |
| 265 | `2002-03_NOP-PHI` | `conference` | NULL | East |
| 278 | `2003-04_MIA-NOP` | `conference` | NULL | East |

[Machine-readable delta](status-metadata-delta.json) identifies the exact source snapshot.
For all 600 rows the rebuild preserved round, best-of-seven flag, winner, reference-team
orientation and win tallies. The builder's existing upsert excludes feature columns;
`compute_series_features.py` derives conference groups structurally, and prediction
loaders do not select this label. No feature or prediction regeneration was performed.
The proposed metadata delta has not been applied.

## Copy and documentation

The expanded Games fatigue row now says `MILEAGE, LAST 7 DAYS`, consistent with the
owner's Mileage terminology and the arena-to-arena estimate. Existing styles and spacing
are retained. Stale numeric claims in explanatory docblocks now point to generated facts.
`DATABASE.md` records the source-confirmed final-game overtime archive from ADR 0003’s
last amendment and ADR 0015, superseding the earlier open-gap wording. It also no longer
treats every pre-2013 neutral fixture as unmarked. The schema default remains zero; new
ingest must retain the correction registry. Older tip times remain a separate limitation.

## Verification

- `node node_modules/vitest/vitest.mjs run src/lib/__tests__/rest-advantage-evidence.test.ts src/lib/__tests__/rest-advantage-evidence-server.test.ts src/lib/__tests__/data-status-page.test.ts`: 34 tests passed.
- `ml/.venv/bin/python -m unittest ml.tests.test_build_series_dataset`: 3 tests passed.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: passed.
- ESLint on the changed TS/TSX files and their tests: passed.
- Snapshot population scan and complete 600-series structural comparison: passed as described above.

The rendered page test exercises server-rendered markup. Browser layout and connected
runtime checks remain part of the combined candidate verification; they were not claimed
by this bounded implementation pass.
