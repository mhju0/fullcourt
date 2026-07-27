# Schedule Disparity — design

**Date:** 2026-07-27
**Status:** implemented and verified against the live database (2026-07-27)
**Module:** Schedule Disparity (`/schedule`, `/api/schedule-disparity`)

## 1. What this answers

Which teams the schedule favored in a given season, and by how much.

The inspiration is Warren Sharp's annual NFL rest-disparity piece, which ranks all 32 teams by
net rest edge in days and asks whether the league scheduled fairly. This module asks the same
question of the NBA, over the ~40 seasons already in the database.

It is **descriptive, not predictive**. It reports a property of the schedule. Whether rest
predicts outcomes is the flagship Rest Advantage backtest's job, and the page links there
rather than restating the claim.

## 2. Scope boundaries

**In scope.** Regular-season games (`game_type = 'regular'`) for every season in `NBA_SEASONS`,
browsable by season picker, plus not-yet-played seasons once their schedule is ingested.

**Out of scope, deliberately.**

- **Any cross-season comparison.** No "largest since 1990" framing, no all-time ranking, no era
  buckets. See §6 for why.
- **Prediction.** No win-rate claims, no edge calls, no betting framing.
- **Attribution of intent.** The page does not claim the league favors or punishes anyone.
  See §7.

## 3. Metrics

Grain: one computed row per `(season, team)` — roughly 1,200 rows across the history.

| Metric | Definition |
|---|---|
| **Net rest edge** | Σ over the team's games of (own rest days − opponent's rest days). The headline. |
| **Net fatigue edge** | Σ over the team's games of (opponent fatigue score − own fatigue score). |
| **B2B edge** | Opponents' back-to-back count − this team's, over those games. |
| **3-in-4 / 4-in-6 edges** | Same construction over games that are themselves the 3rd in 4 nights / 4th in 6. |

Every published figure is oriented so **positive is favorable** — the page states that rule once
and applies it to every column, which is why the density fields are named `…Edge` (short-rest
games *avoided*) rather than `…Diff`. A column that counted upward for a worse schedule while its
neighbours counted upward for a better one cannot be labelled coherently.
| **Games with an edge** | Count of games where own rest days exceeded the opponent's. |
| **Games with a 3+ day edge** | Same, threshold 3. |

Season-level figures, shown for the selected season only and **never ranked against other
seasons**: largest net rest edge, largest net rest disadvantage, the delta between them, count
of games with a 3+ day advantage, count of games with any advantage.

### 3.1 Rest-day rules

- **Rest days** for a game = calendar days between it and the team's previous regular-season
  game in the same season.
- **Cap: 5 days per side** before differencing. Justified by the fatigue model's own belief
  that rest stops helping after three days (`FRESHNESS_PLATEAU_DAYS = 3`,
  `src/lib/fatigue.ts`). Without a cap the All-Star break dominates a season's total with
  something that is not disparity: both teams get roughly a week off, rarely the same number of
  days, and those few games would swamp the other 80.
- The **uncapped** sum is computed and returned alongside the capped one, so the cap is
  auditable and reversible without recomputation.
- **Season openers are excluded** — a team's first game of a season has no previous game, and a
  game is only counted when *both* sides have a defined previous game.
- Rest is computed per team over that team's own season games, so it never reaches across a
  season boundary.

### 3.2 Density flags are defined here, not read from `fatigue_scores`

`fatigue_scores.is_three_in_four` asks whether a 3-in-4 occurred anywhere in the team's 30-day
lookback (`maxGamesInRollingCalendarSpan`, `src/lib/fatigue.ts`). That flag stays true for many
games after the dense stretch ends, so summing it over a season would not count short-rest games.

This module instead classifies each game on its own — "this game is the third in four nights" —
so the season total counts actual short-rest games. The two predicates are deliberately
different and must not be described as the same measure.

## 4. Architecture

Read-only. **No migration, no new table, no ingest script, no pipeline change.** The module
aggregates `games` joined to `fatigue_scores` and writes nothing.

This departs from Playoff Predictor and Shot Quality, which both materialize their outputs.
Those materialize because their inputs are expensive ML fits; this is pure SQL aggregation over
indexed columns, so a table would be unearned complexity. Per-season queries touch ~1,230 games.
If measurement shows the route is slow, materializing later is a contained change that does not
alter the metric definitions.

Module isolation is preserved and in fact stronger than the existing three: the module reads
existing tables, writes none, and no existing query reads anything it produces.

```
games ⋈ fatigue_scores  →  /api/schedule-disparity  →  /schedule
       (read-only aggregate, route-cached)
```

### 4.1 Rest days derive from `games`, not `fatigue_scores`

`fatigue_scores.days_since_last_game` exists and looks like the obvious source. The module does
**not** use it for the headline. Instead it derives rest days from the game dates themselves.

The season's games (~1,230 rows) are fetched and the arithmetic runs in a pure TypeScript module,
`src/lib/schedule-disparity.ts`, rather than in SQL. At that row count the aggregation is
negligible, and it makes every metric directly assertable in unit tests instead of requiring
assertions against generated SQL.

The reason is staleness under schedule change, and the NBA Cup makes it concrete (§5).
`scripts/backfill_fatigue.ts:131` only fills games *missing* fatigue rows, so when a game is
inserted mid-season the neighbouring already-scored games keep a stale
`days_since_last_game`. `scripts/run-daily.ts:63-65` repairs each game on the day it is played,
so the error self-heals — but a published forward-looking number would drift silently for weeks.

Deriving from `games` makes the headline correct the instant a game is added or moved, and makes
it a pure schedule fact requiring no model trust. The **net fatigue edge** column still reads
`fatigue_scores` and may lag for unplayed games; this is stated on the page.

Cost: two places in the codebase compute "days since last game." A test pins them together
(§8). Recorded as [ADR 0001](../../adr/0001-derive-rest-days-from-games.md) so the duplication is
not "cleaned up" later, reintroducing the drift.

## 5. Provisional schedules and the NBA Cup

The NBA announces only **80 of each team's 82 games** before the season. The remaining two are
announced at the end of NBA Cup group play in December: teams eliminated in group play receive
two additional games, quarterfinal losers receive one, and knockout games count as regular-season
games. The championship game does not count and is an 83rd game for the two finalists.

So a schedule released in August is genuinely incomplete, and the missing games always land in
the November–December window. Adding a game there also changes the rest value of the *following*
game, so more than the two inserted games are affected.

**Rule: a season is provisional whenever it contains any game that is not final**, read directly
from `games.status`. Provisional seasons display an as-of date and the current games-per-team
count, and their figures may revise.

This is deliberately generic rather than Cup-aware:

- It needs no hardcoded 82, which would wrongly mark the lockout seasons (50 games in 1998-99,
  66 in 2011-12, 72 in 2020-21) as permanently provisional.
- It covers postponements and arena conflicts, which do the same thing at smaller scale.
- It does not break when the league changes the Cup format, which it already has — the 2026
  final moves to Hinkle Fieldhouse and the semifinals move to home arenas.

### 5.1 Known limitation: the Cup championship gap

The championship game is absent from `games` — ingest gates on `002…` (regular), `004…`
(playoffs/finals) and `005…` (play-in) IDs, and the uncounted championship carries none. For the
two finalists, `LAG` therefore computes rest *across* a game they actually played, overstating
their rest for the following game.

Accepted and documented rather than fixed. It affects two teams per Cup season by one game each,
which is below the leaderboard's resolution, the existing fatigue model has the same blind spot,
and the data source needed to fix it (`stats.nba.com`) is currently unreachable. The clean fix,
if it ever matters, is to ingest the finals under their own `game_type`, following the `play_in`
precedent.

## 6. Why there is no cross-season comparison

Sharp's hook is historical — "the #2 largest net rest edge since 1990." That framing is not
available here, for three reasons specific to this metric:

1. **Season length varies.** 1998-99 was 50 games, 2011-12 was 66, 2020-21 was 72. A season
   *total* partly measures how many games were played, so any raw ranking silently favors full
   seasons.
2. **The rest distribution itself moved.** The league has spread the calendar and reduced
   back-to-backs over these four decades. If the league-wide spread of rest was wide in 1987 and
   narrow today, then the same raw number means different things in the two seasons, while a
   ranking prints them as equal.
3. **Team count changed**, from 23 in 1985-86 to 30 by 2004-05, changing both the opponent pool
   and the travel geometry.

Every figure is therefore scoped to its own season. The one form of cross-season comparison that
would be defensible — standardizing each team against its own season's distribution — is
deliberately not built, and would be the only such feature considered later.

## 6.1 Two season lists, and why

`NBA_SEASONS` does two jobs: it gatekeeps which seasons may be requested, and its `.length`
backs the "N-SEASON BACKTEST" copy (`src/app/page.tsx`, `src/app/opengraph-image.tsx`). Those
coincide until schedule-release day, when the upcoming season exists as *data* but not yet as
*calendar* — `NBA_SEASONS` derives its upper bound from the ET clock and does not roll over
until October 1.

Widening `NBA_SEASONS` would make the site advertise a backtest one season larger than the
evidence, trading a data gap for a false claim. So the browsing meaning gets its own list,
`browsableSeasons()`, which is `NBA_SEASONS` plus the upcoming season during August and
September only. The counting meaning keeps `NBA_SEASONS` untouched.

The window closes on October 1 because `NBA_SEASONS` rolls over then and the upcoming season
becomes the current one. Only Schedule Disparity uses the wider list; `SeasonSelector` takes it
as an optional prop, so the other four pages are unaffected.

## 7. Honest framing on the page

Two statements the page carries, both load-bearing:

- **This is not a prediction.** It describes the schedule. The Rest Advantage backtest is where
  the question "does it matter?" is answered, and the page links there.
- **Much of the disparity is structural.** Geography, arena availability, and broadcast windows
  produce rest imbalance without anyone favoring anyone. Reading intent into the raw number is
  the easy and wrong version of this page.

## 8. Testing

- **Aggregation unit tests** against a fixture season with hand-computed rest days, asserting
  the 5-day cap, the excluded-opener rule, and the season-boundary partition **on the generated
  SQL or the pure function**, not on incidental row order.
- **A pinning test** asserting this module's rest days equal the fatigue model's
  `daysSinceLastGame`. It calls `calculateFatigue` directly rather than reading the database, so
  it runs in CI with no `DATABASE_URL`. This is what makes the §4.1 duplication safe; it must
  fail if either definition drifts.
- **Provisional-rule test**: a season with any non-final game reports provisional; a fully final
  season does not; a 66-game lockout season is not misreported.
- **Route test** mirroring `src/app/api/__tests__/analysis.test.ts`, covering the `{ data, error }`
  contract and an unknown-season request.

## 9. Vocabulary

Added to [GLOSSARY.md](../../GLOSSARY.md). All three are explicitly distinct from the existing,
protected **rest advantage**, which is matchup-level and home-oriented:

- **Net rest edge** — season total of (own rest days − opponent's), capped at 5 per side.
- **Net fatigue edge** — the same sum in fatigue-score units.
- **Provisional season** — a season containing any game that is not final.

## 10. Dependencies and risks

1. **The schedule-release use case is gated on ingest that does not yet work.**
   [SEASON_ROLLOVER.md §2–3](../../SEASON_ROLLOVER.md) records that the 2026-27 schedule will not
   auto-ingest: `cdn.nba.com` returns 403 from both Seoul and GitHub Actions, and
   `stats.nba.com` from Actions is untested. Until that is resolved the page renders historical
   seasons but not the upcoming one. This is a prerequisite the module cannot satisfy itself.
2. **`docs/SEASON_ROLLOVER.md:108` goes stale this season** — it describes the Cup finals as
   "neutral-site, T-Mobile Arena." Exclusion is by ID prefix, not venue, so no code breaks.
3. **Verified against the live database (2026-07-27).** Read-only queries confirmed every
   claim this design had inferred:
   - **Cup championships are absent from `games`** — no rows at all on 2023-12-09, 2024-12-17
     or 2025-12-16.
   - **All 30 teams have exactly 82 regular-season games** in each of 2023-24, 2024-25 and
     2025-26, so the finalists are correctly not at 83.
   - **Lockout counts are as documented** — 1998-99: 50 games across 29 teams (correct for that
     era); 2011-12: 66; 2020-21: 72; 2019-20 absent entirely.
   - **Every historical season is fully final**, so `provisional` is correctly false throughout.
   - The module ran over 2025-26, 2011-12 and 1998-99 with the **zero-sum invariant holding
     exactly** (Σ net rest edge = 0, capped and uncapped) on all three.

   One result worth recording: 2025-26 Portland is **+15 rest days but only +4.39 fatigue
   edge**, against Cleveland's +10 / +49.02. That divergence — favourable rest days largely
   consumed by travel and density — is what the second column exists to expose.
4. **Neutral-site regular-season games** (Paris, Mexico City, Abu Dhabi, pre-2026 Cup
   semifinals) are tagged home/away though neither team is home. This does not affect the
   rest-days headline, only travel inside the fatigue column.
