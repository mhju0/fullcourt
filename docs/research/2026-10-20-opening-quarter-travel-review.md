# October–December 2026 schedule and travel review

Research date: October 20, 2026 (Korea). Source commit: `f7a20dac58a52b1f4be50d562bdc327ea5bcf4c4`, FullCourt v1.0.2. This is an audit and proposal, not a production correction. No database records, model coefficients or application code were changed.

## Assessment

The calendar-density calculations passed the independent checks. Travel arithmetic also reproduces the published venue-based estimate. However, this audit found a homecoming road-load inconsistency, a missing Austin venue and a stale opening-week tip time. I would address these before calling the first quarter fully verified. Actual flights and time away from home remain estimates.

## What was checked

The read-only database snapshot contains all 30 teams, 1,200 assigned regular-season games and 2,400 latest fatigue rows, with no duplicate score rows. The entire fixture list agrees with the NBA's August 13 release PDF. A separate live ESPN comparison detects later changes; agreement with an old release alone is insufficient.

For October through December, the audit covers **475 games / 950 team appearances across 62 game dates**. It compares calendar dates, back-to-backs, 3-in-4, 4-in-6, days off, seven/thirty-day workload, direct travel legs, rolling travel, away streaks, composite scores and the live Games API. Month boundaries retain prior games. Counts below count team appearances satisfying each condition, so the categories overlap.

| Month | Assigned games | Back-to-backs | 3-in-4 | 4-in-6 | Estimated inbound venue miles, all teams |
| --- | ---: | ---: | ---: | ---: | ---: |
| October | 88 | 30 | 44 | 42 | 83,887 |
| November | 215 | 72 | 103 | 111 | 222,626 |
| December | 172 | 61 | 77 | 83 | 191,088 |
| Total | 475 | 163 | 224 | 236 | 497,601 |

The independent density/rest/travel checks agree with all 950 API team appearances. Stored road streaks have the discrepancy described below. Composite score replay agrees with current code; that establishes reproducibility, not correctness of every modeling assumption. December excludes still-unassigned Cup-dependent fixtures.

Source: [official NBA schedule by date](https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf). Local numeric evidence and reproduction instructions are in [the numeric audit](2026-10-20-schedule-audit/NUMERIC_AUDIT.md).

## Findings to fix or resolve

### 1. Homecoming games can retain a road-streak penalty

`venueStreak()` walks backward through prior away games even when tonight is at home. The API displays zero at home, but the scorer can still charge that retained streak. The API type contract defines this field as consecutive away games including tonight, with zero at home.

The snapshot has **208 homecoming field discrepancies** and **66 home games with a positive road-streak load** in October–December. An offline diagnostic that zeroes only the home-game streak, with every coefficient unchanged, changes 18 rested-side/neutral classifications and 21 edge-size classifications. These are counterfactual results, not corrected published figures.

Example: Knicks–Jazz, December 23. The Knicks' previous seven away games produce a 1.70-point road load at home. Removing that load in the diagnostic changes the Knicks score from 4.86 to 3.16 and the home-relative rest gap from −0.87 to +0.83. This illustrates why a display-only fix would be insufficient.

Independent review found this behavior in older implementations too; it is a long-standing contract/model inconsistency, not a newly introduced regression. The inspected ratification does not settle whether road-streak carryover at home was intended. The same helper can retain a prior home-stand length on the first away game; that exported feature needs review, although it does not currently add to the score.

Recommendation: review the intended homecoming behavior, fix the inconsistent streak rule if accepted, add a homecoming regression, and measure effects across historical and projected scores before a reviewed rescore. Preserve all ratified coefficient values. Do not silently introduce a new carryover term to justify existing behavior.

Evidence: `src/lib/fatigue.ts` (`venueStreak`, `roadSegmentLoad`, `calculateFatigue`), `src/types/index.ts`, `homecoming-impact.csv` and `score-diagnostic.json` in the numeric audit.

### 2. Houston–San Antonio on October 23 uses the wrong physical venue

The NBA schedule places this game at Moody Center, Austin. The database has `neutral_site=false` and no alternate venue city, so the current location resolver uses the usual San Antonio arena.

This affects the estimate into that game and the following leg. Correcting physical location must preserve a separately justified home-court classification: a Spurs alternate home venue is not automatically a neutral game. The current resolver couples neutral status, venue coordinates and physical away status, so simply setting `neutral=true` would change more than geography.

Recommendation: represent the actual venue independently from the nominal host and neutral-home-court decision. Audit all alternate and international sites with that separation. Clippers/Warriors arena coordinates in the database already match Intuit Dome/Chase Center.

Source: [NBA schedule release](https://pr.nba.com/2026-27-nba-regular-season-schedule/), October 23 entry and schedule PDF's Austin annotation.

### 3. Chicago–Milwaukee tip time is stale; Houston–Atlanta needs reconciliation

Chicago–Milwaukee on October 23 is stored at 8 p.m. ET. Current Bulls scheduling shows **4 p.m. ET / 3 p.m. Central**, consistent with the Bucks' announced move. Correcting the time can change the next back-to-back's turnaround multiplier even though the calendar-day flag stays the same.

Source: [current Bulls schedule](https://www.nba.com/team/1610612741/schedule). The [October 16 NBA announcement](https://www.nba.com/news/milwaukee-bucks-move-home-opener-world-series) confirms a four-hour move; its heading's ET wording conflicts with local-time context, so use the current team schedule's timezone.

Houston–Atlanta on October 24 is 8 p.m. ET in the database, release PDF and inspected NBA/Hawks pages; live ESPN reports 8:30 p.m. ET. Treat this as a source conflict requiring a fresh first-party resolution, not permission to overwrite with whichever feed was read last.

Sources: [NBA game page](https://www.nba.com/game/0022600107), [Hawks schedule](https://www.nba.com/hawks/schedule). Capture details and both differences are retained in the numeric audit.

### 4. “Miles flown” overstates what is measured

The application calculates great-circle distances between game venues. It does not use airports, actual flight paths, overnight stops, departure dates or transport mode. Summed season legs count each inbound trip once. The per-game seven-day field is a rolling sum and must never be added as a season total.

The largest direct October–December leg is Brooklyn's New York-to-Portland move into December 29, approximately **2,438 miles**. The largest rolling seven-day value is 5,474 miles, for the Clippers on November 1. These sizes fit the endpoints and rolling window. More misleading examples are local arena moves: Knicks/Nets approximately **4.8 miles** and the two Los Angeles arenas approximately **7.5 miles**. Those are venue distances, not evidence of flights.

Recommendation: use **Estimated travel miles** and a nearby explanation: “Straight-line distances between game venues. Actual routes, transport and returns home may differ.” Keep “scheduled away-game streak” distinct from days continuously on a road trip.

### 5. Forty-three away-game gaps need itinerary uncertainty

The audit flags **43 consecutive-away pairs at least three calendar days apart**, plus **33 nonzero local venue legs under 100 miles**. These thresholds select review candidates; they do not infer a flight, a return home or a transport mode.

| Team and interval | Direct venue estimate | Hypothetical extra miles via home | Interpretation |
| --- | ---: | ---: | --- |
| Indiana: Chicago Nov 28 → Cleveland Dec 1 | 310 | 119 | A relatively small home detour; worth checking team reporting. No return confirmed. |
| Detroit: Atlanta Dec 23 → Chicago Dec 26 | 589 | 247 | Holiday gap is a research candidate, not proof of a home visit. |
| Miami: Golden State Nov 5 → Sacramento Nov 8 | 74 | 5,063 | An automatic three-day return rule would manufacture a large cross-country detour. |

Six of the 43 gaps cross the December 4–10 Cup assignment window; the other 37 do not. Those six long December gaps overlap unassigned Cup games. They cannot be treated as actual uninterrupted rest or a confirmed itinerary. Even with the final schedule, teams can split their traveling party or practice in a third location.

Recommendation: retain the direct venue itinerary as the baseline; record sourced exceptions separately and show via-home comparisons as labeled sensitivity scenarios. Do not insert a home stop after a universal two/three/four-day threshold.

## Airport research: all 30 teams

The [Eastern inventory](2026-10-20-team-airports-east.md) and [Western inventory](2026-10-20-team-airports-west.md) list every team, candidate airports, primary links, dates and confidence limits. A private terminal is an FBO within an airport, not automatically another airport. An airline sponsorship or nearby terminal does not establish the team's charter preference. Home-team departures and visiting-team arrivals may differ.

The strongest recurring-practice finding is **Sacramento / SMF**, explicitly described by the airport authority. Boston / BOS and Milwaukee / MKE have official team departure examples. Other dated movement evidence includes Memphis / MEM, Oklahoma City / OKC, Portland / PDX, San Antonio / SAT and Utah / SLC. These examples have different ages and do not establish exclusive current use. Golden State OAK/SFO, Dallas DAL/DFW and Houston HOU/IAH remain unresolved alternatives.

I recommend keeping the cited airport inventory as a research reference and, if useful, a separate airport-distance sensitivity view. Replacing all arena coordinates with guessed “usual airports” would add unsupported precision and change the model inputs. Correcting wrong game venues and itinerary claims has higher priority.

## Recommended decisions

| Decision | Recommendation |
| --- | --- |
| Homecoming road-load inconsistency | Correct the rule after explicit semantic review; quantify historical consequences and verify a controlled rescore. |
| Austin physical venue | Separate physical location from home-court classification before correcting affected legs. |
| Tip-time refresh | Correct the confirmed Chicago–Milwaukee change; reconcile Houston–Atlanta against a fresh primary source. |
| Public mileage wording | Say Estimated travel miles, with the straight-line venue method beside it. |
| Airports | Keep sourced candidates and confidence; do not replace all model coordinates now. |
| Long gaps on the road | Preserve schedule streaks; use confirmed exceptions and labeled sensitivity, without a universal return-home cutoff. |
| December | Re-audit once Cup assignments are published, including surrounding games whose workload and travel then change. |

## What this audit cannot certify

Future flights, hotels, practices, return-home decisions, diversions and transport choices are not public schedule facts. December's unassigned games are genuinely unresolved. A mathematical match to the code cannot certify a team's actual fatigue. This audit establishes the checked snapshot and identifies specific corrections; it does not declare the entire upcoming season finished.

## Verification record

The independent Python oracle and source replay were rerun successfully. All 30 airport rows and 90 team-month rows reconcile; documentation links, type checking and audit-script lint/syntax checks passed. The HTML report was inspected at desktop and 390px width with contained table scrolling. A separate read-only reviewer approved the audit conclusions, independently reproduced all 66 homecoming counterfactuals, and recounted the 18 classification / 21 size changes. Actual flight records and corrective production deployment remain outside this completed audit.
