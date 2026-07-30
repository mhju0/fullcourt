# Season exclusions belong to the module that objects, not to ingest

Status: accepted (2026-07-30)

## Context

2019-20 was excluded from `NBA_SEASONS`, and `fetch_schedule.py` skipped it, so the season was
never ingested at all. The stated reason was the Orlando bubble: games at a single site, with no
travel to measure and no home crowd.

The reason was sound and the mechanism was not. The bubble is 88 games played between 30 July and
11 October 2020. The season is 1,059 regular-season games. Excluding the season to exclude the
bubble discarded **971 games that were reached by flying to them** — ordinary basketball, ordinary
travel, the exact thing this site models.

The cost was not confined to the fatigue model. Player Shooting has no travel dependence and no
reason to care about the bubble, but it reads `games`, so it lost the season too. Shot Value kept
2019-20 only because it reads a separate local cache, and that divergence had to be documented as
a deliberate exception so a future reader would not "fix" it.

A second mechanism compounded it. The regime rule was written as a calendar window — a game
counted if its date fell between 1 October and 30 April. That window excludes the bubble by
coincidence of dates rather than by describing it, and it excluded other things by the same
accident: **135 games from 2020-21**, which ran to 16 May 2021, and **44 from 1998-99**, which ran
to 5 May. Those 179 games were silently dropped from the backtest. There were no mis-tagged
playoff rows anywhere in the data for the window to catch, so it was defending against a problem
that did not exist while clipping two real seasons to do it.

The window was also documented as "the project's single season-regime policy" while being applied
by only some readers, and the same rule was hand-written a second time in SQL.

## Decision

**Ingest records what was played. Each module decides what it may read.**

Three named rules replace the one window, each owned by the concern that actually objects:

| Rule | Where | Objection | Scope |
|---|---|---|---|
| `ABNORMAL_STRETCHES` | `src/lib/season-regime.ts` | The games were not reached by travelling to them | Dates, never a season. One entry: the bubble. |
| `TRUNCATED_SEASONS` | `src/lib/schedule-disparity.ts` | Teams played unequal numbers of games, so they cannot be ranked | Schedule Edge only. One entry: 2019-20. |
| Bubble playoffs | `ml/build_series_dataset.py`, mirrored for the UI in `src/lib/playoff-seasons.ts` | Entry rest is meaningless after a 4½-month layoff | The series model only. |

They are deliberately not one rule. An abnormal stretch is about *how* games were played; a
truncated season is about *how many* there are. 1998-99 and 2011-12 are short and are ranked
normally — short is fine, interrupted is not.

`NBA_SEASONS` becomes the plain list of seasons that have been played: **41**.

## Consequences

- Player Shooting gains 2019-20's pre-suspension games. Its Python export needed the regime
  filter that the TypeScript readers already had — a player's first bubble game sits ~141 days
  after his last one before the suspension, which without the filter becomes the cleanest-looking
  "3+ days rest" sample in the file, produced by a global pause rather than by rest.
- Schedule Edge offers 40 seasons where every other surface offers 41. `rankableSeasons()` derives
  the selector and the API route from one list, and `seasonRankability()` still throws with the
  measured counts if a season reaches the server anyway. The static list is a UI convenience; the
  computed check is the rule.
- The October–April window survives only as `regularSeasonDateBounds`, used by `isNbaOffSeason` to
  decide roughly when basketball is not being played. **Nothing filters games by it.**
- The Games browser gained the months it could never reach: 2020-21's May and 1998-99's lockout
  May. Month tabs outside Oct–Apr are read off the days that exist, so a season shows a May tab
  when it played in May, and the other 38 seasons show no empty tabs.
- `getGamesByDate` and the date-count query now apply the regime filter like every other reader.
  Each row there carries a rest advantage, and publishing one for a bubble game would have the
  site contradict its own methodology page.
- `fetch_playoffs.py` no longer skips 2019-20, because its skip was inherited from
  `fetch_schedule.SEASONS`. The bubble playoffs land in `games` and are excluded by the series
  model itself, which is where the objection belongs.
- The backtest grew from 38,084 to **38,851** games; the headline rate moved 55.6% → **55.50%**.
  The new games are ~2% of the sample and behave like the rest of it.

### Follow-up: the selector this missed (2026-07-30)

The first version of this change gave Schedule Edge its own season list and did not give one to
Playoff Predictions, whose exclusion is described above but existed only in Python. The selector
began offering 2019-20, and the page rendered two **0%** accuracy tiles above an empty bracket —
which reads as a broken tab, not as an empty season. Reported from production the same day.

Two fixes, and the second is the more general one:

1. `playoffModelSeasons()` mirrors the Python `EXCLUDED_SEASON`, with a test that reads
   `ml/build_series_dataset.py` and fails if the two disagree.
2. The accuracy header is no longer rendered when there are no series. `0 / 0 CORRECT` under a
   `0%` headline claims the model got everything wrong when it in fact predicted nothing — and
   that path is reachable for any season whose playoffs have not been played yet, so it was
   waiting to misfire again every October regardless of 2019-20.

The lesson generalises past this ADR: moving a rule from ingest to per-module means **every**
module that holds an opinion needs somewhere to express it. Two of the three had a home; the
third had only a Python constant and a paragraph in a design doc.

## What this does not license

Adding a season to `NBA_SEASONS` that has not been played. `NBA_SEASONS.length` is what the
"N-SEASON BACKTEST" copy counts, so widening it for browsing convenience would advertise more
evidence than exists. `browsableSeasons()` exists for that and is deliberately separate.
