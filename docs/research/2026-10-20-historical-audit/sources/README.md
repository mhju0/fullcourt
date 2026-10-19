# Historical schedule and source audit — 2026-10-20

This is an external-source comparison of the immutable 51,695-game database snapshot across all 42 stored seasons (1985–86 through 2026–27). It makes no application, database, model, or coefficient changes. A source check means a field was compared with a provider observation; it does not automatically establish historical truth.

## Confirmed findings

- **589 completed games store zero overtime despite observed overtime.** Fresh Basketball Reference schedules identify 157 in 1985–86 through 1987–88. Retained NBA-derived team box scores identify 432 in 1996–97 through 2001–02: both teams have the same minutes, and `(team_minutes − 240) / 25` is a nonnegative integer. These are missing inputs, not proof that their effects cancel or are conservative. See [all affected games](known-overtime-defaults.csv).

- **109 postseason labels disagree with actual Finals membership:** 98 ordinary playoff games are labeled `finals`, and 11 Finals games are labeled `playoffs`. The [official NBA champion/finalist history](https://www.nba.com/news/history-nba-champions) supplies the finalist pair and series length for every one of the 41 completed seasons. Every stored Finals pair has exactly the official series game count; all 3,228 stored postseason rows were classified. The largest cases are 47 non-Finals games in 2020–21 and six 2019–20 Finals games. This is a metadata defect caused by the ingest month heuristic; it does **not** establish wrong Playoff model rounds: `ml/build_series_dataset.py` pools both types and derives rounds independently. No published outcome impact is established. See [mismatches](finals-type-mismatches.csv) and [complete round coverage](finals-type-coverage.csv).

- The freshly fetched NBA schedule archive agrees with stored dates, sides and broad regular/playoff/play-in category for **all 38,022 matched games** from 1996–97 through 2025–26. Its `playoffs` category includes Finals, so that coarseness is not counted as a discrepancy. No swapped home/away side was found among any matched external observations.

## Source disagreements, not confirmed database errors

- **1996-11-10 DEN at CLE:** database, fresh ESPN team schedules and [Basketball Reference](https://www.basketball-reference.com/boxscores/199611100CLE.html) give CLE 101–86. The NBA-derived archived schedule and NBA team box score both give 108–79. Those two files share an upstream source and are not independent corroboration. This audit supports retaining the stored result pending investigation of the upstream NBA anomaly.

- **16 distinct games have provider score disagreements.** Seven are early 2002–03 ESPN scoreboard differences, six additional games are 2001–02 team-schedule differences, two 1999–00 ESPN games report a completed 0–0, and the remaining game is the DEN–CLE NBA anomaly above. Provider disagreement is retained in the CSV; a majority of files does not settle it.

- Five ESPN date disagreements remain: one in 1986–87 and four in February 2020. BRef supports the stored 1986 date; NBA archived schedules support all four stored 2020 dates. The four ESPN 2020 timestamps are about ten hours later than the stored values. They are not evidence to move database game dates. Matching a different regular/playoff game only because it shares an identical score is explicitly disallowed.

- ESPN team schedules expose **7,544 non-midnight historical timestamps where the database is null** and six contradictions with non-null stored tips (four February 2020 provider anomalies and two upcoming 2026–27 fixtures). The cached scoreboard repeats the same four 2020 contradictions. Missing timestamps are fill candidates, not confirmed real tip-off times or confirmed errors. Zero-hour UTC timestamps are excluded from tip checks as potential placeholders. In particular, these historical timestamps are not used to claim complete rest-hour validation.

- The current ESPN team schedule has **CHI at MIL on Oct 23 at 16:00 ET** (`2026-10-23T20:00Z`) versus stored **20:00 ET** (`2026-10-24T00:00Z`), and **HOU at ATL on Oct 24 at 20:30 ET** (`2026-10-25T00:30Z`) versus stored **20:00 ET** (`2026-10-25T00:00Z`). The earlier full-season report retains primary release evidence; this team feed alone does not adjudicate revised tip times.

## Valid exclusions and archive artifacts

The NBA archive has four rows absent from storage: two 2005 playoff placeholders with no teams or scores; the canceled IND–BOS game on 2013-04-16 (0–0 in the archive); and the 2020 Memphis–Portland play-in, an already documented intentional omission. These are not newly discovered missing completed regular-season fixtures. The archive also separates preseason, All-Star and NBA Cup championship rows from the regular/playoff/play-in comparison; Cup semifinals remain regular season. The three completed Cup championships are deliberately absent from storage. The bubble remains stored context while the publication regime excludes it; 1998–99 and 2011–12 lockout calendars are not rejected for their dates.

## Coverage and limits

The union of external observations checks identities and dates for **45,913 / 51,695 rows**, completed scores for **44,713 / 50,495 final rows**, OT for **41,070 / 50,495 final rows**, and non-placeholder timestamp fields for **31,740 rows**. Missingness is concentrated in early eras. **9,425 completed games remain unverified for OT**, plus 1,200 future games for which OT is not yet an outcome. This does not mean the unverified games had no OT.

Fresh Basketball Reference capture completed all monthly pages for 1985–86, 1986–87 and 1987–88 (3,048 games), then encountered HTTP 429. No remaining early-season pages are claimed verified. Fresh ESPN team requests cover mainly regular-season schedules and often return a different season, empty results or partial early seasons; event season/date is validated rather than trusting the requested year. The retained ESPN daily cache supplies later postseason coverage.

The `neutral_site` column in the table below counts only **provider fields compared**. In particular, ESPN `false` before 2013 is often an unreliable default and does not confirm an ordinary home venue. There is **no all-season neutral/arena truth verification** here; the companion venues audit owns physical-location evidence. Current franchise normalization is used only for identity matching and never proves a historical city. Actual flights, hotel stays and intermediate returns home are not observed.

| Season | Stored | Date / identity checked | Score checked | OT checked | Non-placeholder tip field checked | Neutral field compared |
|---|---:|---:|---:|---:|---:|---:|
| 1985-86 | 1011 | 1011 | 1011 | 1011 | 0 | 0 |
| 1986-87 | 1014 | 1014 | 1014 | 1014 | 78 | 78 |
| 1987-88 | 1023 | 1023 | 1023 | 1023 | 0 | 0 |
| 1988-89 | 1087 | 80 | 80 | 0 | 80 | 80 |
| 1989-90 | 1179 | 0 | 0 | 0 | 0 | 0 |
| 1990-91 | 1175 | 0 | 0 | 0 | 0 | 0 |
| 1991-92 | 1180 | 82 | 82 | 0 | 82 | 82 |
| 1992-93 | 1183 | 78 | 78 | 0 | 78 | 78 |
| 1993-94 | 1184 | 1107 | 1107 | 0 | 904 | 1107 |
| 1994-95 | 1180 | 1107 | 1107 | 0 | 898 | 1107 |
| 1995-96 | 1257 | 1189 | 1189 | 0 | 910 | 1189 |
| 1996-97 | 1261 | 1261 | 1261 | 1261 | 870 | 1189 |
| 1997-98 | 1260 | 1260 | 1260 | 1260 | 842 | 1189 |
| 1998-99 | 791 | 791 | 791 | 791 | 556 | 725 |
| 1999-00 | 1264 | 1264 | 1264 | 1264 | 709 | 1094 |
| 2000-01 | 1260 | 1260 | 1260 | 1260 | 795 | 1188 |
| 2001-02 | 1260 | 1260 | 1260 | 1260 | 742 | 1188 |
| 2002-03 | 1277 | 1277 | 1277 | 1277 | 781 | 1276 |
| 2003-04 | 1271 | 1271 | 1271 | 1271 | 768 | 1271 |
| 2004-05 | 1314 | 1314 | 1314 | 1314 | 804 | 1314 |
| 2005-06 | 1319 | 1319 | 1319 | 1319 | 833 | 1319 |
| 2006-07 | 1309 | 1309 | 1309 | 1309 | 817 | 1309 |
| 2007-08 | 1316 | 1316 | 1316 | 1316 | 851 | 1316 |
| 2008-09 | 1315 | 1315 | 1315 | 1315 | 1052 | 1315 |
| 2009-10 | 1312 | 1312 | 1312 | 1312 | 1023 | 1312 |
| 2010-11 | 1311 | 1311 | 1311 | 1311 | 993 | 1311 |
| 2011-12 | 1074 | 1074 | 1074 | 1074 | 841 | 1074 |
| 2012-13 | 1314 | 1314 | 1314 | 1314 | 1030 | 1314 |
| 2013-14 | 1319 | 1319 | 1319 | 1319 | 1036 | 1319 |
| 2014-15 | 1311 | 1311 | 1311 | 1311 | 1054 | 1311 |
| 2015-16 | 1316 | 1316 | 1316 | 1316 | 1046 | 1316 |
| 2016-17 | 1309 | 1309 | 1309 | 1309 | 1050 | 1309 |
| 2017-18 | 1312 | 1312 | 1312 | 1312 | 1028 | 1312 |
| 2018-19 | 1312 | 1312 | 1312 | 1312 | 1028 | 1312 |
| 2019-20 | 1142 | 1142 | 1142 | 1142 | 937 | 1142 |
| 2020-21 | 1171 | 1171 | 1171 | 1171 | 932 | 1171 |
| 2021-22 | 1323 | 1323 | 1323 | 1323 | 1075 | 1323 |
| 2022-23 | 1320 | 1320 | 1320 | 1320 | 1077 | 1320 |
| 2023-24 | 1318 | 1318 | 1318 | 1318 | 1059 | 1318 |
| 2024-25 | 1320 | 1320 | 1320 | 1320 | 1066 | 1320 |
| 2025-26 | 1321 | 1321 | 1321 | 1321 | 1070 | 1321 |
| 2026-27 | 1200 | 1200 | 0 | 0 | 945 | 1200 |

Full per-provider, per-field counts and difference counts are in [coverage.csv](coverage.csv); deduplicated season counts are in [season-field-coverage.csv](season-field-coverage.csv). Gaps in this table are unverified, not passes. For the 1,200 assigned upcoming fixtures, 945 non-placeholder tip fields were compared; 255 source timestamps were excluded as potential placeholders.

## Reproduction and retained evidence

Run from the repository root:

```sh
python3 docs/research/2026-10-20-historical-audit/sources/compare.py
python3 docs/research/2026-10-20-historical-audit/sources/finals_round.py
```

`compare.py` reads the immutable snapshot, retained ESPN/NBA caches, fresh NBA schedule archives, fresh BRef pages, and the sibling venue worker’s fresh ESPN team schedules. It performs no HTTP or database access. `finals_round.py` reads the retained NBA history page. Both were executed successfully on the frozen snapshot; Python compilation also passed. No application tests were needed for these research-only changes.

`fetch_sources.py` is the separate bounded HTTP capture utility. It captures the 30 NBA season archives and attempts early BRef pages, preserves successful captures, and stops on a rate limit. Do not rerun it merely to make the table look complete. Raw files and hash manifests remain ignored under `docs/audit/2026-10-20-historical-audit/sources/`:

- `fetch-manifest.json`: fresh source URLs, byte counts, hashes and HTTP failures.
- `cache-manifest.json`: every reused/fresh source file hash (6,768 files), with origin and retention caveats. The sibling `venues/espn-manifest.json` records exact team request URLs.
- `normalized-sources.jsonl.gz`: 152,025 normalized provider observations across five source collections.
- `nba-champions.html` and the hash in [finals-summary.json](finals-summary.json): official Finals authority.

NBA archive provenance is documented by the [SportsDataverse NBA Stats ingestion repository](https://github.com/sportsdataverse/hoopR-nba-stats-data): NBA Stats raw data → reshape → [season archive release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_schedules). This is a separately captured provider archive, not a database export and not an independent source from the NBA box-score archive. Retained ESPN cache provenance is grounded in `scripts/fetch_game_context.ts`; an original per-file capture manifest was not retained, so this run hashes the existing bytes without inventing original fetch timestamps.

No corrections, production writes, schema changes or re-scoring were performed. Remaining source disagreements and early-era missingness require explicit adjudication before any repair.
