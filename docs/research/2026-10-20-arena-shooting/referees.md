# Referee corpus and L2M identity correction, 2026-10-20

Implemented and exercised in the isolated `fullcourt-arena-correction` checkout.
No database, neutral flag, fatigue coefficient, result, prediction or grading write occurred.
The source caches and previous corpus in the main checkout remain unchanged.

## Four ESPN dates

The active flat-corpus producer, `ml/extract_referee_corpus.py`, now applies the
same four independently accepted D-121 date corrections already used by
`scripts/referee-event-identity.ts`. It checks the cache/header/competition event
identity, season/type, source Eastern date, designated teams and final scores.
A provider response repaired to the canonical date is accepted without subtracting
another day. Other events retain ordinary Eastern timestamp conversion.

| ESPN event | Canonical NBA ID | Retained provider ET date | Canonical ET date | Away at home | Score, away–home |
|---|---|---|---|---|---|
| 401161490 | 0021900848 | 2020-02-24 | 2020-02-23 | DET at POR | 104–107 |
| 401161528 | 0021900886 | 2020-02-29 | 2020-02-28 | DEN at LAC | 103–132 |
| 401161530 | 0021900888 | 2020-03-01 | 2020-02-29 | POR at ATL | 117–129 |
| 401161536 | 0021900894 | 2020-03-01 | 2020-02-29 | GSW at PHX | 115–99 |

The retained ESPN summaries have noon-UTC timestamps on those provider dates.
The fresh `docs/audit/arena-shooting-correction/snapshot.json.gz` confirms the
canonical dates, teams and scores. The accepted primary-source identities remain
documented with the existing TS crosswalk. The source-summary fixtures used by
both generator test suites are retained in
`src/lib/__tests__/fixtures/referee-generator.json` with provenance hashes.

Executed `ml/.venv/bin/python ml/extract_referee_corpus.py` against the complete
14,128-file officials cache through a local read-only-use symlink, with one Python
process, writing only this checkout's `ml/data/referee` directory. All 14,128 rows
retain their identity, order, winner, counts and other fields; only the four
`date_et` values change. Every regenerated row uniquely matches the fresh snapshot
on date, designated teams and final scores.

| Artifact | Rows | Before SHA-256 | After SHA-256 |
|---|---:|---|---|
| games.csv | 14,128 | 71049affbd78dd35905c996cee675b5351b529c1a713faa05cd94c0d865409ba | 12831f75566eb3fe2e58f9bbb5e291093f5b2c3b5e7a338e38d518accee5c4bf |
| fouls.csv | 552,980 | 3a240d893819de869c225d7fab7b6be428b6dd07a9961b9806d8013c51de99c8 | 3a240d893819de869c225d7fab7b6be428b6dd07a9961b9806d8013c51de99c8 |
| players.csv | 365,489 | 18d42daec9aa2d04e2add8a734ed2661064d1c26f442f496772900fe44785420 | 18d42daec9aa2d04e2add8a734ed2661064d1c26f442f496772900fe44785420 |

## L2M source identity and canonical join

NBA report `0022401229` is a valid original ID. The retained raw report from
`ml/data/l2m-research/2024-25/20260906T145127099997Z/0022401229.json` states
`GameId=0022401229`, `GameDate=2024-12-14T16:30:00`, home MIL/team ID 1610612749,
away ATL/team ID 1610612737, score 110–102. These match the fresh canonical fixture
`bref-202412140MIL` and the accepted `historyAliases` entry in
`src/data/player-appearance-context.json`.

`ml/publish_officiating.py` reads that accepted alias register, rejects duplicate
source or canonical mappings and malformed canonical identities, and checks exact
NBA report date/team metadata before emitting optional `canonicalExternalId`.
Native numeric team IDs are also checked whenever present. Unaliased games keep
their native ID as their canonical identity. Aliased records expose the separate
field; consumers can join with `canonicalExternalId ?? id` while retaining `id`
for NBA report URLs, event IDs, shared links and content-addressed detail paths.

Replayed the actual 2024-25 publisher snapshot with:

```sh
ml/.venv/bin/python ml/publish_officiating.py \
  ml/data/l2m-research/2024-25/20260906T145127099997Z
```

All 4,546 published detail files are byte-identical. The only published change is
one `canonicalExternalId: "bref-202412140MIL"` field on the original `0022401229`
summary in `src/data/officiating.json`. Dates, counts, grades, categories, crews,
hashes, filenames and source URLs remain identical.

## Dependent artifacts and verification

- `referee_axes.py`, `referee_player_axes.py` and `referee_exploratory_axes.py`
  use flat-corpus dates for the 2020-07-30 bubble boundary. Every event's cohort
  membership is exactly unchanged. `referee_crowd_test.py` uses those same cohorts.
- `referee_season_secondary_20260906.py` uses season date minima/maxima; every
  season's boundaries are exactly unchanged. Its latest-season raw-cache inputs
  are unaffected by the four February 2020 dates.
- `referee_makeup_diagnostic.py`, `referee_playoff_claims.py` and
  `referee_playoff_confound.py` do not use calendar dates. Their actual fields,
  player rows and foul rows are identical. `referee_career_windows.py` reads the
  separate `officials-games.json` intermediate, whose existing producer already
  applies the D-121 correction.
- `analyze_l2m_season.py` uses exact date/team/score joins. Replayed all four
  retained study snapshots: 2023-24, 2024-25 and both 2025-26 captures. Every
  result field is exactly identical except the expected `games_csv_sha256`
  provenance hash. No numeric or crew result changes. Earlier archive
  normalization reads its separate official-identity export rather than this CSV.
- These dependency checks establish no changed downstream numeric input or
  published figure. Historical study artifacts retain their original provenance;
  unaffected permutation/model analyses were not rerun.
- Python: `ml/.venv/bin/python -m unittest ml.tests.test_referee_corpus
  ml.tests.test_officiating_publish`, 19 tests passed, including provider identity
  drift, an upstream date repair, canonical alias mismatch and publication guards.
- Node 24 direct Vitest run of `officiating.test.ts` and
  `referee-generator.test.ts`: 42 tests passed. ESLint on both changed TS files
  and `git diff --check` passed. The package-manager wrapper attempted an automatic
  dependency install and stopped at its no-TTY guard; direct installed tools were
  used without dependency changes. The root owns candidate-wide typecheck/build.

Machine-readable local evidence is under
`docs/audit/arena-shooting-correction/referees/`: `corpus-parity.json`,
`publication-parity.json`, `l2m-analysis-parity.json` and regeneration logs.
The evidence preserves all 174 corpus/snapshot neutral-flag discrepancies as
report-only findings; none was silently normalized. The complete raw ESPN cache
was exercised, but no fresh provider acquisition, deployment or production
acceptance is claimed by this bounded correction.
