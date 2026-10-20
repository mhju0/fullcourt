# Shooting canonical-fixture correction — 2026-10-20

## Approved outcome and source scope

Shooting includes every final, nonbubble regular-season fixture within the box-score provider’s coverage, beginning in 1996-97. Zero-FGA player rows remain outside shooting outcomes and can still supply confirmed appearance history. Five canonical fixtures stored with synthetic `bref-` IDs were previously omitted because the outcome query required `external_id LIKE '002%'`; the existing reviewed NBA aliases were applied only to history. No coefficient, prediction, database ID or grading change is part of this slice.

`scripts/analyze_player_shooting.py` now queries canonical final regular fixtures without an external-ID prefix gate. The shared `fixture_aliases()` helper checks source/canonical bijection, exact Eastern date and home/away teams, and rejects a source ID that already names another canonical fixture. Before excluding zero-attempt outcomes, Shooting checks both cached sides, NBA team IDs and labels, the complete accepted player rosters, valid shot lines and canonical team scoring totals. Duplicate player/canonical-fixture rows fail. Raw NBA IDs remain attached to outcomes for history matching, alongside their canonical fixture ID.

The cache inventory follows canonical completed seasons from `fetch_shooting_data.FIRST_SEASON_YEAR` (1996). Every such season requires its player CSV; missing files, empty inputs, wrong season labels and missing canonical fixtures fail before publication. A future season without completed canonical games requires no cache. Existing season-publication gates remain unchanged.

## Five authentic source identities

The committed [field projection](../../../scripts/tests/fixtures/shooting-aliases.json) retains the 141 hoopR roster rows for these fixtures. The accepted [appearance manifest](../../../src/data/player-appearance-context.json) pins NBA source URLs, original source SHA-256 values, fixture dates, teams and complete player rosters. The local SELECT-only clone supplies canonical final scores; the cache player scores reconcile exactly with both sides.

| NBA cache ID | Canonical ID | Date | Cache roster rows | Positive-FGA outcomes | Added FGA | NBA source |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `0022400147` | `bref-202411020WAS` | 2024-11-02 | 28 | 25 | 193 | [NBA box score](https://www.nba.com/game/mia-vs-was-0022400147/box-score) |
| `0022401229` | `bref-202412140MIL` | 2024-12-14 | 28 | 17 | 168 | [NBA box score](https://www.nba.com/game/atl-vs-mil-0022401229/box-score) |
| `0022401230` | `bref-202412140OKC` | 2024-12-14 | 27 | 17 | 176 | [NBA box score](https://www.nba.com/game/hou-vs-okc-0022401230/box-score) |
| `0022400621` | `bref-202501230IND` | 2025-01-23 | 29 | 25 | 193 | [NBA box score](https://www.nba.com/game/sas-vs-ind-0022400621/box-score) |
| `0022400633` | `bref-202501250SAS` | 2025-01-25 | 29 | 24 | 187 | [NBA box score](https://www.nba.com/game/ind-vs-sas-0022400633/box-score) |

Official NBA pages corroborated the first four identities/dates during this work; the January 25 page returned a browser-fetch error. Full roster/stat validation uses the retained, previously accepted NBA source manifest plus the unchanged authentic hoopR cache; a fresh five-game NBA box-score download is not claimed.

## Actual producer and independent comparison

Both `scripts/export_player_rest.py` and `scripts/analyze_player_shooting.py` ran against the dedicated local after-state clone, with a SELECT-only/read-only database session. Inputs are per-file CSV links; generated research files and the public payload are written only in the isolated worktree. The complete-inventory guard was then exercised by rerunning the actual public exporter, yielding identical output bytes. No production query/write, fatigue model fit or Shot Quality regeneration occurred.

- Exact comparison baseline: `65605ae9`. All **696,961** prior `(NBA player ID, NBA game ID)` outcomes and every existing raw field, date, team, rest assignment, seven-day count/minutes and uncertainty flag are preserved.
- All canonical raw-cache outcome identities match: **697,069** player-games across **35,458** eligible fixtures. The exact addition is **108** outcomes, **917** FGA and **84** player-seasons; no prior outcome is removed.
- Independent integer aggregation verifies all **14,493** published season rows, including games, FGA, `2*FGM+3PM`, and both rest-arm counts/numerators/rates. Exactly **84** decoded 2024-25 season rows change; other season summaries are equal. Player and position indices are preserved.
- Jared Butler’s team label changes `PHI/WAS` → `WAS/PHI`: the restored Washington game resolves the existing played-game-count ordering. Removing the unused old label shifts later dictionary indices; comparisons therefore decode team labels rather than treating compact indices as identities.
- All **1,309** career estimates independently reproduce the unchanged 150-FGA-per-arm rule, raw effects, standard errors and empirical-Bayes formula. All **1,235** eligible unaffected players retain their raw career effect and error. The global prior changes, so **396** rounded career records legitimately change, including shrinkage-only changes outside the 84 affected players.
- Empirical-Bayes mean: `0.41363268584905727` → `0.41119598716460753` pp; tau: `1.6702496495229588` → `1.6741374066132821` pp. Eligible-player count remains 1,309; no parameter or eligibility rule was tuned.
- Published witnesses: Shai Gilgeous-Alexander 76 games / 1,656 FGA / 1,883 exact numerator; Victor Wembanyama 46 / 857 / 958; Tyrese Haliburton 73 / 1,006 / 1,170.
- Public payload SHA-256: `af1a85aeb551171e3e7f9d8b67ed3141de9a3fffdbe16fba819d586f067319e5`.

Local executable comparison and logs: `docs/audit/arena-shooting/verify_shooting.py`, `verification.json`, `verification.log`, `player-export.log`, `shooting-analysis.log`. These are ignored operational evidence; the committed source projection and tests provide portable regression coverage.

## Producer-prefix inventory

| Path | Observed rule | Disposition |
| --- | --- | --- |
| `scripts/analyze_player_shooting.py` | Canonical DB `LIKE 002` plus a raw prefix gate omitted valid aliases. | Replaced by canonical fixture membership and reviewed bijective aliases. |
| `scripts/fetch_shooting_data.py` | `count_rows()` counts native `002` IDs for logging; downloads retain the whole source file. | No source rows are removed; unchanged. |
| `scripts/collect_shot_data.py`, `aggregate_shot_grid.py`, `sq*.py` | Separate per-season/team cache; NBA request is `Regular Season`. No canonical `games.external_id` join/prefix filter occurs. | These five ID aliases do not exclude shots. Shot Quality cohort/artifacts stay unchanged; no regeneration warranted. |
| `scripts/audit_data.ts` | Prefix checks validate native NBA ID ↔ game-type tags. | No publication cohort is selected; unchanged. |
| Schedule/CDN/season-window ingest and season re-key tools | Prefixes classify native NBA source IDs. | Their writes/identity behavior is unchanged. Two stale Shooting comments now describe the canonical join and missing-fixture guard. |
| `ml/availability_inputs.py` | Existing canonical fixture, roster and scoring validation applies the same reviewed aliases. | Already includes these fixtures; unchanged. |
| L2M normalization/publication | Native NBA regular-ID classification; corpus/canonical identity is a separate audit finding. | Coordinated with the separate referee/L2M owner; no broadening from this Shooting slice. |

## Verification

- `ml/.venv/bin/python -m unittest discover -s scripts/tests -p 'test_*.py' -v`: 58 passed, including eight new Shooting fixture tests and existing appearance-history contracts.
- `ml/.venv/bin/python -m unittest discover -s ml/tests -p 'test_*.py' -v`: 66 passed at the shared-worktree check.
- `vitest run src/lib/__tests__/player-rest.test.ts`: 42 passed, including three published alias-game witnesses.
- Changed-file ESLint, TypeScript checking and `git diff --check`: passed.
- New failure cases cover source/canonical duplicates, canonical collision, date/home/away drift, cache team/side/roster/score drift, duplicate rows, malformed/empty input, missing canonical fixture, and a missing entire completed season cache.

Full release/build/browser verification and production acceptance belong to the root’s integrated candidate. The historical `verify_player_appearance_recalculation.py` retains its v1.0.4 identity-preservation question; this authorized addition is verified against the v1.0.7 baseline above rather than rewriting that dated evidence.

## Exact added integer observations by player-season

Every row below is the sum of only the added raw positive-FGA rows. All are 2024-25. The independent full-cache comparison checked every component against the original cache before producing this table.

| NBA player ID | Player | Added games | FGM | FGA | 3PM | Exact numerator |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 101108 | Chris Paul | 2 | 4 | 10 | 3 | 11 |
| 1626158 | Richaun Holmes | 1 | 0 | 1 | 0 | 0 |
| 1626167 | Myles Turner | 2 | 9 | 29 | 4 | 22 |
| 1626171 | Bobby Portis | 1 | 5 | 10 | 0 | 10 |
| 1626179 | Terry Rozier | 1 | 4 | 13 | 3 | 11 |
| 1626196 | Josh Richardson | 1 | 0 | 4 | 0 | 0 |
| 1627752 | Taurean Prince | 1 | 2 | 8 | 2 | 6 |
| 1627783 | Pascal Siakam | 2 | 17 | 28 | 3 | 37 |
| 1627832 | Fred VanVleet | 1 | 3 | 15 | 1 | 7 |
| 1627936 | Alex Caruso | 1 | 0 | 3 | 0 | 0 |
| 1628380 | Zach Collins | 1 | 1 | 1 | 0 | 2 |
| 1628389 | Bam Adebayo | 1 | 12 | 24 | 3 | 27 |
| 1628392 | Isaiah Hartenstein | 1 | 9 | 12 | 0 | 18 |
| 1628415 | Dillon Brooks | 1 | 5 | 17 | 4 | 14 |
| 1628418 | Thomas Bryant | 3 | 9 | 15 | 1 | 19 |
| 1628963 | Marvin Bagley III | 1 | 0 | 1 | 0 | 0 |
| 1628983 | Shai Gilgeous-Alexander | 1 | 8 | 21 | 2 | 18 |
| 1628988 | Aaron Holiday | 1 | 0 | 1 | 0 | 0 |
| 1629018 | Gary Trent Jr. | 1 | 0 | 5 | 0 | 0 |
| 1629026 | Kenrich Williams | 1 | 3 | 4 | 1 | 7 |
| 1629027 | Trae Young | 1 | 9 | 18 | 3 | 21 |
| 1629614 | Andrew Nembhard | 2 | 9 | 17 | 2 | 20 |
| 1629631 | De'Andre Hunter | 1 | 5 | 16 | 3 | 13 |
| 1629639 | Tyler Herro | 1 | 5 | 9 | 2 | 12 |
| 1629640 | Keldon Johnson | 2 | 6 | 12 | 1 | 13 |
| 1629652 | Luguentz Dort | 1 | 5 | 11 | 5 | 15 |
| 1629673 | Jordan Poole | 1 | 8 | 18 | 2 | 18 |
| 1630167 | Obi Toppin | 2 | 7 | 15 | 4 | 18 |
| 1630168 | Onyeka Okongwu | 1 | 2 | 5 | 2 | 6 |
| 1630169 | Tyrese Haliburton | 2 | 16 | 28 | 9 | 41 |
| 1630170 | Devin Vassell | 2 | 11 | 21 | 7 | 29 |
| 1630174 | Aaron Nesmith | 2 | 5 | 12 | 1 | 11 |
| 1630198 | Isaiah Joe | 1 | 1 | 3 | 0 | 2 |
| 1630200 | Tre Jones | 2 | 7 | 12 | 1 | 15 |
| 1630215 | Jared Butler | 1 | 2 | 3 | 0 | 4 |
| 1630224 | Jalen Green | 1 | 5 | 14 | 1 | 11 |
| 1630264 | Anthony Gill | 1 | 0 | 1 | 0 | 0 |
| 1630552 | Jalen Johnson | 1 | 6 | 15 | 0 | 12 |
| 1630557 | Corey Kispert | 1 | 1 | 10 | 0 | 2 |
| 1630572 | Sandro Mamukelashvili | 2 | 4 | 9 | 0 | 8 |
| 1630577 | Julian Champagnie | 2 | 3 | 5 | 2 | 8 |
| 1630578 | Alperen Sengun | 1 | 6 | 16 | 1 | 13 |
| 1630696 | Dru Smith | 1 | 1 | 1 | 0 | 2 |
| 1630700 | Dyson Daniels | 1 | 5 | 10 | 0 | 10 |
| 1631095 | Jabari Smith Jr. | 1 | 3 | 8 | 2 | 8 |
| 1631097 | Bennedict Mathurin | 2 | 15 | 24 | 5 | 35 |
| 1631098 | Johnny Davis | 1 | 4 | 5 | 0 | 8 |
| 1631103 | Malaki Branham | 2 | 1 | 3 | 1 | 3 |
| 1631104 | Blake Wesley | 1 | 0 | 1 | 0 | 0 |
| 1631106 | Tari Eason | 1 | 3 | 8 | 2 | 8 |
| 1631107 | Nikola Jović | 1 | 1 | 7 | 1 | 3 |
| 1631110 | Jeremy Sochan | 2 | 7 | 14 | 1 | 15 |
| 1631114 | Jalen Williams | 1 | 8 | 20 | 2 | 18 |
| 1631116 | Patrick Baldwin Jr. | 1 | 2 | 3 | 2 | 6 |
| 1631170 | Jaime Jaquez Jr. | 1 | 4 | 12 | 0 | 8 |
| 1631260 | AJ Green | 1 | 3 | 6 | 3 | 9 |
| 1631321 | Sidy Cissoko | 2 | 1 | 3 | 0 | 2 |
| 1641705 | Victor Wembanyama | 2 | 20 | 37 | 6 | 46 |
| 1641708 | Amen Thompson | 1 | 9 | 15 | 0 | 18 |
| 1641716 | Jarace Walker | 2 | 2 | 7 | 1 | 5 |
| 1641717 | Cason Wallace | 1 | 2 | 6 | 1 | 5 |
| 1641731 | Bilal Coulibaly | 1 | 8 | 12 | 2 | 18 |
| 1641748 | Andre Jackson Jr. | 1 | 2 | 4 | 1 | 5 |
| 1641767 | Ben Sheppard | 2 | 1 | 9 | 0 | 2 |
| 1641796 | Pelle Larsson | 1 | 3 | 4 | 1 | 7 |
| 1642258 | Zaccharie Risacher | 1 | 1 | 3 | 0 | 2 |
| 1642259 | Alex Sarr | 1 | 7 | 11 | 1 | 15 |
| 1642264 | Stephon Castle | 2 | 10 | 29 | 2 | 22 |
| 1642267 | Bub Carrington | 1 | 2 | 9 | 0 | 4 |
| 1642273 | Kyshawn George | 1 | 2 | 9 | 0 | 4 |
| 1642276 | Kel'el Ware | 1 | 1 | 3 | 0 | 2 |
| 1642484 | RayJ Dennis | 1 | 0 | 1 | 0 | 0 |
| 201572 | Brook Lopez | 1 | 7 | 10 | 2 | 16 |
| 202685 | Jonas Valančiūnas | 1 | 2 | 8 | 0 | 4 |
| 202692 | Alec Burks | 1 | 5 | 8 | 5 | 15 |
| 202710 | Jimmy Butler III | 1 | 6 | 13 | 0 | 12 |
| 203081 | Damian Lillard | 1 | 8 | 21 | 5 | 21 |
| 203084 | Harrison Barnes | 2 | 18 | 24 | 5 | 41 |
| 203114 | Khris Middleton | 1 | 2 | 7 | 1 | 5 |
| 203500 | Steven Adams | 1 | 1 | 2 | 0 | 2 |
| 203507 | Giannis Antetokounmpo | 1 | 10 | 15 | 0 | 20 |
| 203991 | Clint Capela | 1 | 3 | 8 | 0 | 6 |
| 203992 | Bogdan Bogdanović | 1 | 4 | 7 | 2 | 10 |
| 204456 | T.J. McConnell | 2 | 8 | 18 | 0 | 16 |

## Reproduction input hashes

| Input / producer | SHA-256 |
| --- | --- |
| `scripts/analyze_player_shooting.py` | `bd918a7b4fd28ce43b8d8c26c924b4f637f78029a22f94a62d46e5cd10666189` |
| `scripts/player_appearance_history.py` | `f2f10080f1c4d845b62faccfc34cb7108f692ce351326990dae3fc6d24872a47` |
| `scripts/export_player_rest.py` | `fecda01a6b7fb9cd1c5e65061f85beb3014bca5f232193d97ba84115f193b754` |
| `src/data/player-appearance-context.json` | `b4515f7b387e66c278d3caf800aadaeb9c76b0ac563cc53a9779ea2196abe98b` |
| `scripts/tests/fixtures/shooting-aliases.json` | `1e9de8b5433a3afcbddef7d91c417578f104e65d1df04f9914da3cd5e7b822cb` |
| `ml/data/shooting/player_boxscores_2024.csv` | `080b7fade5b587238d4f2ecd36048ebd926bac18e8912b07cf336ad0f1da4c91` |
