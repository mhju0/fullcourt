# Fatigue and schedule recompute audit

Audit run on 2026-10-11 against the production database, at the owner's request, before the
first 2026-27 game on 2026-10-20. It records what was recomputed, how, and what was found, so the
next audit can repeat it and compare. The scripts written for this audit were temporary; the
method below is enough to rebuild them, and the repository scripts it names are committed.

## What a fatigue score is computed from

`src/lib/fatigue.ts` is the only implementation. Every stored row is written through
`scoreGameFatigue()`, which scores both sides of a game from that team's prior games in the
30 days before the game date.

```
score = max(0, baseLoad × backToBack × altitude × density + freshness + overtime)
```

| Term | Input | Calculation |
| --- | --- | --- |
| Recent workload | Prior games in 30 days, final margins | Each game costs `2.65 × e^(−0.52 × daysAgo)`, discounted up to 25% for a margin between 15 and 35 points |
| Travel | Venue coordinates of consecutive games in 7 days | `1.75 × ln(1 + miles / 1000)`; great-circle miles, a trip home counted only when the next game is at home |
| Body clock | UTC offset of each venue | `0.88 × direction × max(0, 1 − nightsInZone / zonesCrossed)`, direction 1.25 eastward and 0.85 westward, from a 2-hour shift |
| Road segment | Consecutive road games | 0.34 per game after the first two |
| Back-to-back | Game the previous day, tip-off times | `clamp(1.38 + 0.02 × (24 − turnaroundHours), 1.30, 1.46)`; flat 1.38 when tip-off times are unknown |
| Altitude | Venue altitude flag | 1.29 when visiting Denver, Utah or Mexico City; 1.06 the following night |
| Schedule density | Games in five trailing windows | Multiplier above 1 when the pace exceeds a normal schedule |
| Extended rest | Days since the last game | A discount from 3 days of rest, approaching −2.0 |
| Overtime | Overtime periods of the previous game | +0.5 for one period, +1.0 for two or more |

The table names the constants so a later reader can see which version was audited. The code is
the authority; if the two disagree, the table is out of date.

Derived figures:

- **Rest advantage** is the away score minus the home score (`classifyRestAdvantage`). Under 0.5
  in either direction is neutral.
- **A pick** is recorded only when the home team is the more rested side (`isCalledSide`), for
  regular-season games outside the 2019-20 Orlando bubble.
- **Prior games for an upcoming game** are every scheduled or played game in the window, with
  overtime and margin left out for games not yet played (the `"scheduled"` basis, D-82).
- **3-in-4, 4-in-6 and the 30-day count** count prior games whether or not they have been played.
- **Season travel miles** are summed one leg per game by `seasonTravelLegs()`, with the same leg
  rule the fatigue model uses.

## What was recomputed

All reads were read-only. Stored rows were compared with fresh results to nine decimal places.

| Check | Method | Result |
| --- | --- | --- |
| 2026-27 schedule | Each of 1,200 games compared with the ESPN scoreboard and basketball-reference for teams, Eastern date, tip-off time and neutral site | All match; 80 games and 40 home games per team |
| Fatigue rows, every season | `refreshDailyGames()` replayed in memory over all 51,695 games (1985-86 to 2026-27, playoffs included) with a port that loads priors from a dump and writes nothing; every numeric and flag column compared | 0 of 103,390 rows differ |
| Fatigue rows, repository check | `scripts/export_fatigue_features.ts` fidelity report | 100,990 played rows compared, 0 mismatches |
| Picks | Each final game re-classified with `classifyRestAdvantage`, `isCalledSide` and `isNormallyPlayed`; side, stored gap and winner compared | 27,404 expected and stored; 0 missing, 0 extra, 0 wrong; 16,765 correct (61.18%) |
| Upcoming picks | Same replay on the scheduled basis for 2026-27 | 633 expected and stored |
| Live site | `/api/games/<date>` for all 178 dates, `/api/games/upcoming`, `/api/analysis`, `/api/season-report` and `/api/schedule-disparity` compared with the recompute | All match after the fixes below |
| Generated artifacts | `measure_uncalled_half.ts`, `playoff_rest_report.py`, `availability_facts.py`, `timezone_test.py`, `prepare_fatigue_dataset.py` and `ablate_fatigue_terms.py` rerun | Committed outputs unchanged |
| Page text | Rendered text of the 29 static routes read from production; figures on the fatigue-related pages traced to their source | One stale figure, below |

## What was found and fixed

1. **Upcoming fatigue was understated.** The nightly job counted only played prior games, so a
   game ahead of the last final lost its recent schedule. 26 rows on 22 and 23 October were zero
   or low, and 5 picks were missing. Fixed in PR #120; the affected rows were recomputed on
   2026-10-10 with `scripts/run-daily.ts`.
2. **Density figures were blank on future dates.** 3-in-4, 4-in-6 and the 30-day count read
   false or 0 for games not yet played. Fixed in PR #120.
3. **Season Report travel miles were about four times too high**, in every season, because a
   7-day rolling total was summed per game. San Antonio's 2026-27 total read 217,826 miles and is
   54,043 by legs. Fixed in PR #120.
4. **One typed rate on the rest-advantage method page was stale.** The home win rate when the
   home team flew farther reads 59.93% in `scripts/measure_home_rest_confound.ts`; the page said
   60.0%. Fixed in PR #121.
5. **The [home advantage trend record](2026-09-11-home-advantage-trend.md) predated the stored
   corrections of 2026-10-04.** Regenerated in PR #121.

## Limits

- The recompute proves that stored scores follow from stored inputs. The inputs themselves
  (dates, scores, overtime) were last compared with basketball-reference and nba.com on
  2026-10-04 and were not compared again here.
- Referee, officiating and shooting figures do not use fatigue scores and were not regenerated.
- The typed rates from `measure_home_rest_confound.ts` are not pinned by a test. After any
  stored-row correction, rerun that script and `research_home_advantage_trend.ts`.
- A game-day row is written the evening before, so the previous night's overtime and margin
  reach it at that evening's run.
- Overtime before 2002-03 is unknown and reads 0, as documented in Data sources and coverage.
