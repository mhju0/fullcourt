# Full 2026–27 schedule, Mileage and itinerary review

Researched October 20, 2026. This extends the earlier October–December review through the final assigned regular-season date, April 11, 2027. All findings below concern the current assigned schedule. This is a research deliverable, not a production correction.

## Your Mileage decision

Keep **Mileage** as the visible label. Explain the estimate in Behind the Data, while retaining enough period context to distinguish a seven-day value from a season total. D-120 records this owner decision. The current audit changes no live UI or calculation.

## What passed across the entire assigned season

The fresh read-only snapshot covers **30 teams, 1,200 assigned games, 2,400 team appearances and 156 game dates**. Every team has 80 assigned games. There are no duplicate external IDs, duplicate fatigue-side rows or same-team double bookings.

The independent date/geography oracle agrees with all stored back-to-back, 3-in-4, 4-in-6, rest-day, seven/thirty-day workload and rolling Mileage fields. All 2,400 public Games API side records agree with that oracle, including displayed current-away streaks. All 2,400 composite scores reproduce the current code. Reproducibility does not resolve the homecoming rule inconsistency below.

All 1,200 fixtures agree with the NBA's August 13 release PDF. Current ESPN coverage was checked for every September–April date: all 1,200 assigned fixtures match, with two later tip changes identified. Every ESPN fixture has a venue ID; 34 distinct venues expose six nonstandard home endpoints, including three Austin games.

The assigned-schedule totals are **426 back-to-backs, 628 3-in-4 flags and 716 4-in-6 flags**, counting team appearances satisfying each condition. Categories overlap; these are not counts of unique difficult trips. The remaining 30 Cup-dependent regular-season games are not yet assigned, so final totals will change.

Source: [NBA schedule release](https://pr.nba.com/2026-27-nba-regular-season-schedule/). Reproduction, capture dates and exact source fingerprints: [full numeric audit](2026-10-20-full-season-audit/FULL_SEASON_AUDIT.md).

## Monthly checks

Mileage here follows the current venue-based itinerary assumptions. It is shown to reconcile the website, not certify actual flights. Its method and limits are explained below.

| Month | Assigned games | B2B team appearances | 3-in-4 | 4-in-6 | Mileage, both teams combined |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-10 | 88 | 30 | 44 | 42 | 83,887 |
| 2026-11 | 215 | 72 | 103 | 111 | 222,626 |
| 2026-12 | 172 | 61 | 77 | 83 | 191,088 |
| 2027-01 | 236 | 91 | 144 | 174 | 257,303 |
| 2027-02 | 169 | 56 | 84 | 101 | 191,488 |
| 2027-03 | 232 | 88 | 121 | 135 | 249,050 |
| 2027-04 | 88 | 28 | 55 | 70 | 91,672 |

## Findings requiring a correction or decision

### Homecoming road load: larger full-season impact

The scorer retains the preceding away streak on **508 homecoming team records**, while the public type contract and API treat the current-away streak as zero at home. **185 home games** receive a positive road-streak component.

A diagnostic removing only that home-game component, while preserving all ratified coefficients and other inputs, changes **57 rested-side/neutral classifications and 66 edge-size classifications**. These are counterfactual changes, not corrected forecasts or observed results. The behavior predates the current release; prior review found no explicit decision establishing whether this homecoming carryover was intended.

Largest score effect: **Lakers–Clippers, February 10**. The Lakers' score changes diagnostically from **6.12 to 4.25**, with the rest gap moving from **+1.16 to +3.03**. That changes the edge size from small to medium without changing which side is more rested.

The shared helper also leaves a previous home-stand length on **507 away-game feature records**. That feature is exported for analysis but is not currently a score term. Inspect both sides of the helper when resolving the rule. Correcting only the visible road-streak label would leave the scoring inconsistency intact.

Recommendation: explicitly settle whether a road-streak term should apply on the first home game, then implement the accepted contract with regression coverage and a measured, reviewed rescore. Do not change coefficient values or silently reinterpret this as an approved carryover term.

### Austin: three physical venue omissions

The current assigned schedule contains these Spurs-designated home games at **Moody Center, Austin**:

- October 23: Houston at San Antonio.
- February 26: Memphis at San Antonio.
- February 28: Denver at San Antonio.

The database provides no separate physical-venue override, so the scorer resolves the usual San Antonio arena. The first game can therefore receive a zero inbound distance despite a different city. Audit the inbound leg, following leg and rolling windows around every affected game.

Recommendation: separate actual venue location from nominal home team and home-court eligibility. Do not repair Austin by automatically marking every game neutral. The Spurs' alternate home designation and physical travel are different facts. Mexico City, Paris and Manchester resolve through the existing neutral-venue map; the current LAC/GSW coordinates use Intuit Dome/Chase Center.

Sources: [Spurs schedule](https://www.nba.com/spurs/schedule), [NBA dated schedule PDF](https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf), captured current provider venue IDs.

### Two stale tip times are now corroborated

| Game | Stored ET | Current supported ET | Current authority |
| --- | --- | --- | --- |
| October 23, Chicago at Milwaukee | 8:00 p.m. | 4:00 p.m. | Current Bulls schedule and Bucks' October 16 change announcement. |
| October 24, Houston at Atlanta | 8:00 p.m. | 8:30 p.m. | Hawks/Dream October 13 joint statement and current arena event listing. |

The earlier report left Houston–Atlanta as a provider conflict. The expanded research found a dated first-party announcement resolving it to 8:30 p.m.; some NBA game/team pages still display 8 p.m. Historical release PDFs must not override subsequent dated announcements.

Sources: [Bulls schedule](https://www.nba.com/team/1610612741/schedule), [Bucks announcement](https://www.nba.com/news/milwaukee-bucks-move-home-opener-world-series), [Hawks/Dream joint statement](https://www.statefarmarena.com/news/detail/joint-statement-from-the-atlanta-dream-and-atlanta-hawks), [arena game listing](https://www.statefarmarena.com/events/detail/atlanta-hawks-vs-houston-rockets-tickets-atlanta-georgia-2026-10-24).

These changes preserve calendar-day B2B flags but can affect clock-based turnaround multipliers for surrounding games. A correction should refresh both teams' dependent scores, not only print the new tip time.

## Actual home interruptions: your geography intuition has support

Teams sometimes return to their home area between two away games, without playing a home game. The deeper research found contemporary reporting on these cases:

| Team and event | Reported route | Evidence boundary |
| --- | --- | --- |
| Sixers, December 2024 | Boston Dec 25 → Philadelphia respite → Utah Dec 28 | Close analogue to a nearby Northeast game followed by a Western destination. Christmas context matters. |
| Bulls, November 2012 | Houston Nov 21 → Chicago-area practice Nov 23 → Milwaukee Nov 24 | Reported home practice and bus departure; the arena road-trip label concealed a home interruption. |
| Nets, March 2016 | Minnesota Mar 5 → Brooklyn respite → Toronto Mar 8 | Contemporary coach/report evidence; no intervening game. |

Sources and calendar checks: [Eastern itinerary cases](2026-10-20-itinerary-research-east.md). Additional Spurs and Western stay-away cases are in [Western itinerary research](2026-10-20-itinerary-research-west.md).

The exact **Knicks Boston → New York → Los Angeles** itinerary was not verified. Our arena-distance illustration is nevertheless informative: via New York adds approximately **44 miles** to Boston→LA. A Knicks Chicago→New York→Milwaukee itinerary adds approximately **1,365 miles** over the direct regional leg. These are hypothetical distances, not observed movements or return probabilities.

Geography helps prioritize the search. It does not settle nights at home, practice access, airport/ground transfers, holiday plans, acclimation or which players stayed together. Teams also stay away through off dates. A roster can split over All-Star break, so a single team itinerary may itself be an approximation. The [NBPA's current agreement](https://nbpa.com/cba), Article XX section 9, permits qualifying Days Off outside the home city.

### Cup championship: workload and standings are separate

The December 11 Cup championship does not count toward regular-season standings, but the two participating teams still play and travel. The current snapshot contains only regular-season fixtures. When participants and surrounding games are known, check that this physical game enters workload/travel context separately from publication eligibility. Thirty unassigned regular-season fixtures plus the non-standings championship are distinct follow-ups; excluding the final from the standings must not imply no fatigue effect. This is an unresolved future-context check, not an observed finalized score error.

## Full-season itinerary review queue

The audit calculates geography for **680 consecutive-away pairs**, including short intervals rather than assuming only long gaps can contain home stops:

- **99 away-to-away gaps** are at least three calendar days apart.
- **6** of those overlap unassigned December Cup fixtures; those gaps may acquire intervening games.
- **6** overlap the All-Star break; participation and personal travel remain unknown.
- **86 nonzero venue legs** are under 100 miles, including local/nearby arenas. They do not establish a flight.
- **55 pairs** have at least one game-free calendar day and a hypothetical home detour of at most 150 miles. This arbitrary threshold creates a research queue only; it is not a prediction rule or approval to insert a stop.

The [all-pairs CSV](2026-10-20-full-season-audit/all-consecutive-away-pairs.csv) preserves direct distance, via-home distance, detour and route-proximity information. A nearby home city and a low detour can make a home stop plausible even when a game-count road streak continues. A distant detour can still happen for a holiday or other reason. No representative frequency dataset or validated behavioral probability was found.

Recommendation: keep documented observations, inferred baseline routes and hypothetical alternatives distinct. For future unsourced intervals, preserve the direct-venue baseline while prioritizing low-detour, holiday and long-gap cases for dated reporting. Add confirmed exceptions only through a provenance-aware mechanism after deciding how they affect the model. Do not turn a research threshold into an automatic geography-based home-return rule.

## All 30 teams: assigned-schedule reconciliation

The table counts each incoming venue leg once. It excludes final post-season home returns and assumes a home departure before a team's first assigned game. It includes current Austin omissions and unknown itinerary choices. Every figure is provisional until the missing Cup fixtures and later schedule changes are incorporated.

| Team | Games | B2B | 3-in-4 | 4-in-6 | Mileage | Home games with positive road load |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ATL | 80 | 14 | 21 | 23 | 36,537 | 8 |
| BKN | 80 | 16 | 21 | 23 | 37,595 | 6 |
| BOS | 80 | 16 | 22 | 23 | 41,282 | 7 |
| CHA | 80 | 13 | 21 | 26 | 36,521 | 6 |
| CHI | 80 | 15 | 24 | 25 | 35,394 | 6 |
| CLE | 80 | 16 | 23 | 27 | 39,350 | 5 |
| DAL | 80 | 16 | 21 | 22 | 44,775 | 7 |
| DEN | 80 | 14 | 21 | 24 | 47,986 | 6 |
| DET | 80 | 15 | 21 | 27 | 35,984 | 6 |
| GSW | 80 | 15 | 23 | 21 | 45,657 | 7 |
| HOU | 80 | 14 | 24 | 26 | 45,437 | 7 |
| IND | 80 | 15 | 20 | 22 | 36,601 | 7 |
| LAC | 80 | 13 | 20 | 24 | 47,441 | 6 |
| LAL | 80 | 15 | 26 | 30 | 43,716 | 7 |
| MEM | 80 | 13 | 19 | 23 | 45,816 | 4 |
| MIA | 80 | 13 | 19 | 19 | 47,887 | 7 |
| MIL | 80 | 14 | 22 | 24 | 41,492 | 6 |
| MIN | 80 | 13 | 22 | 27 | 47,309 | 7 |
| NOP | 80 | 16 | 27 | 29 | 55,529 | 6 |
| NYK | 80 | 13 | 17 | 17 | 35,134 | 5 |
| OKC | 80 | 13 | 18 | 22 | 44,283 | 5 |
| ORL | 80 | 14 | 18 | 22 | 43,327 | 7 |
| PHI | 80 | 13 | 16 | 19 | 41,319 | 4 |
| PHX | 80 | 13 | 22 | 26 | 44,281 | 6 |
| POR | 80 | 15 | 19 | 23 | 44,606 | 6 |
| SAC | 80 | 14 | 25 | 28 | 48,270 | 6 |
| SAS | 80 | 13 | 18 | 22 | 54,043 | 6 |
| TOR | 80 | 15 | 22 | 25 | 35,110 | 7 |
| UTA | 80 | 13 | 20 | 25 | 48,690 | 6 |
| WAS | 80 | 14 | 16 | 22 | 35,743 | 6 |

## Behind the Data: what Mileage measures

The current model uses great-circle distances between scheduled game venues. It does not observe airports, flight paths, departure/arrival times, hotels, practices, intermediate home stops or transport mode. Adding rolling seven-day values across games would double-count travel; season totals instead use one inbound leg per game.

The largest assigned inbound leg is Manchester→San Antonio, approximately **4,851 miles**, into the Spurs' January 20 game after Europe. The highest venue-based total is New Orleans at approximately **55,529 miles**; Toronto is lowest at approximately **35,110 miles**. European fixtures explain substantial additional distance for the Pelicans/Spurs. These scales are plausible under the current endpoint assumptions, rather than evidence of actual aircraft mileage.

The [30-team airport reference](../reports/2026-10-20-schedule-travel-audit.html#east) remains dated research, with verified events separated from unverified candidates. This audit has not established airport choices for each season leg; a candidate is not a current exclusive team preference. Replacing arena coordinates with guessed airports would not resolve home interruptions or wrong physical venues.

Proposed Behind the Data copy: “Mileage uses straight-line distances between scheduled game venues. Actual airports, routes, ground travel and intermediate stops can differ.” Retain the simple **Mileage** label in the product. A future sourced-exception mechanism needs its own explanation once it exists.

## Completion and remaining limits

Completed: full assigned-calendar audit, stored-score/source replay, public API comparison, current schedule/venue-feed comparison, 30-team reconciliation, deeper documented itinerary research and a geography-based review queue. No production records, coefficients or UI were changed.

Still open: the homecoming rule decision and corrective implementation/rescore; physical venue support for Austin; the two confirmed tip corrections and dependent rescoring; actual future travel; the remaining Cup assignments and championship workload context; and any later reschedule. A corrected dataset must be re-audited after those writes. This report does not certify the eventual 82-game schedule or claim that a future trip has already been observed.

## Verification record

The full numeric artifact checks and 2,400-side source replay passed again. All 30 team totals reconcile with monthly/oracle data. Type checking, targeted audit-script lint, Python/JavaScript syntax and documentation-link checks passed. A separate read-only reviewer independently recounted calendar flags, unique API sides, all 185 score counterfactuals and all 680 route comparisons, and checked selected primary itinerary sources. The report was rendered at desktop and 390px width with contained table scrolling. The reviewer did not reverify every historical link, and neither reviewer nor audit observed future flights or approved a production correction.
