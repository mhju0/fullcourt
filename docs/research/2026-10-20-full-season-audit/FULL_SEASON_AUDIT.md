# 2026–27 full-season numeric and schedule audit

This supersedes the numeric coverage of the October–December audit. It audits **every assigned 2026–27 regular-season fixture through April 11, 2027**, not just the opening quarter. It does not treat the 30 still-undefined regular-season Cup fixtures as known games.

Fresh database capture: October 20, 2026 KST / October 19 **16:38:11–16:38:12 UTC**, commit `6cb7ce8e86ff9e5aebd7974c4e8c71e5d6f9ffb9`. All reads used one `REPEATABLE READ READ ONLY` transaction. No app/model changes, database writes, schema changes, rescoring, migrations or deployments occurred.

## Coverage and acceptance

| Evidence | Exercised scope | Result |
| --- | --- | --- |
| Fresh database | 1,200 fixtures; 30 teams × 80 games; 2,400 latest fatigue rows | All scheduled; zero held/cancelled; zero duplicate score-side rows, external IDs or team/date bookings |
| Official August 13 NBA by-date PDF | 1,200/1,200 parsed; neutral `vs` rows included | Zero fixture/date/initial-tip differences; release PDF is not current-time authority |
| Fresh ESPN | 242/242 dates, September 1–April 30 | 1,200 defined regular fixtures + 4 unresolved placeholders; zero fixture/identity/neutral-flag differences; 2 confirmed stale tips |
| Current venue feed | 1,200/1,200 defined fixtures, 34 distinct venue IDs | Three Austin alternate home courts omitted from model geography; three neutral venues present |
| Independent calendar/geodesic oracle | 2,400/2,400 team-games; 19,200 stored field comparisons | All fields pass except 508 homecoming road-streak fields |
| Canonical public date API | 156/156 assigned dates; 2,400/2,400 sides | Zero differences in 8 compared workload/mileage fields, including display-normalized home streak |
| Current source score replay | 2,400/2,400 sides | Every stored composite score reproduced exactly; this preserves existing semantic defects |

The oracle uses Eastern calendar dates. B2B means prior game yesterday; 3-in-4 and 4-in-6 count tonight and preceding three/five dates. All full-season prior context is built before month filtering. No monthly rest, streak or mileage reset occurs. Held fixtures are excluded by policy; the authentic season contains none, so held/cancelled behavior is inspected rather than exercised on real rows.

## Monthly results

These are **team-game flags**, not unique dense stretches. A game can have multiple flags. Mileage counts each incoming arena leg once for each team, starting the first fixture at that team's home arena. It excludes a hypothetical trip home after the season's last game.

| Month | Assigned games | B2B | 3-in-4 | 4-in-6 | Mileage, arena legs |
| --- | ---: | ---: | ---: | ---: | ---: |
| October | 88 | 30 | 44 | 42 | 83,886.906 |
| November | 215 | 72 | 103 | 111 | 222,625.714 |
| December | 172 | 61 | 77 | 83 | 191,088.025 |
| January | 236 | 91 | 144 | 174 | 257,303.385 |
| February | 169 | 56 | 84 | 101 | 191,488.227 |
| March | 232 | 88 | 121 | 135 | 249,049.720 |
| April | 88 | 28 | 55 | 70 | 91,671.926 |
| Season | **1,200** | **426** | **628** | **716** | **1,287,113.905** |

The displayed monthly mile figures are rounded; `numeric-summary.json` and `per-leg.csv` retain finer precision. The mileage reproduces current stored venue assumptions, including the three Austin omissions. [team-season.csv](team-season.csv) contains all 30 team totals; [team-month.csv](team-month.csv) has 210 team-month rows. Rolling 7-day values are explicitly separated from once-counted season Mileage and must not be summed as the season total.

## Confirmed defects and semantic findings

### Two stored tips predate official changes

- **CHI at MIL, October 23:** DB/API/PDF say 8 p.m. ET (October 24 00:00 UTC); current ESPN and team schedule say 4 p.m. ET (October 23 20:00 UTC). The [October 16 official release](https://www.nba.com/news/milwaukee-bucks-move-home-opener-world-series) describes moving 7 p.m. to 3 p.m. Milwaukee local time. Its introductory ET wording is inconsistent; local release body, team schedule and current feed establish 4 p.m. ET.
- **HOU at ATL, October 24:** DB/API/PDF say 8 p.m. ET; current ESPN says 8:30 p.m. ET. The [October 13 Dream/Hawks joint statement](https://www.statefarmarena.com/news/detail/joint-statement-from-the-atlanta-dream-and-atlanta-hawks) and [current venue event](https://www.statefarmarena.com/events/detail/atlanta-hawks-vs-houston-rockets-tickets-atlanta-georgia-2026-10-24) independently establish 8:30 p.m. ET. Some NBA team/game surfaces still show the older time. The earlier opening-quarter report left this unresolved; the newer dated team/venue evidence resolves it as a stale stored tip.

Neither change crosses the Eastern game date, so the audited calendar-density and mileage fields remain unchanged. Tip-based turnaround terms can change; a corrected production rescore was not executed.

### Three alternate home courts lose their physical venue

Official PDF note A and fresh ESPN venue ID 7317 identify **Moody Center, Austin** for:

| Date | Visitor | Nominal home | Provider neutral flag |
| --- | --- | --- | --- |
| October 23 | HOU | SAS | false |
| February 26 | MEM | SAS | false |
| February 28 | DEN | SAS | false |

DB stores all three as ordinary SAS home-arena games with no venue override. They therefore use San Antonio coordinates. This can create missing San Antonio–Austin positioning and wrong incoming/outgoing legs, and can affect workload geography downstream. An alternate Spurs home court is not automatically a neutral game. Physical venue must be represented separately from home-court designation, or be resolved by an explicit owner decision. No speculative neutral reclassification or approximate Austin coordinate correction was applied.

All three true neutral fixtures match current venue flags: DEN–IND November 7 at Arena CDMX, NOP–SAS January 14 at Accor Arena, and SAS–NOP January 17 at Co-op Live. Configured neutral coordinates resolve all three. Current LAC and GSW coordinates correspond to Intuit Dome and Chase Center, not their former arenas. The 34 current venue IDs consist of 30 primary arenas, Austin and three neutral arenas; this is feed/fixture validation, not a surveyed coordinate validation of every building.

### Homecoming streaks affect 185 scores

Independent current-away streak is **0 on a home game**. Stored `road_trip_consecutive_away` instead retains the prior road streak on **508 homecoming sides**. The public API sets that displayed value to 0, so API matching does not expose the stored/model inconsistency. `venueStreak` in `src/lib/fatigue.ts` walks prior matching venues but does not reset when the current venue is opposite.

**185 homecomings** have a prior road streak above the two-game soft threshold, so they receive a positive road term. With constants and every other input unchanged, diagnostic removal of only the homecoming road term changes **57 rested-side/neutral classifications** and **66 gap-size classifications**. These are counterfactual classifications, not actual outcome changes and not an approved model revision.

Largest score effect: LAL vs LAC February 10, prior streak 7, road term 1.70, multiplied score **6.12 → 4.25** (difference 1.87), home-relative gap **1.16 → 3.03**, small → medium. A direction flip example from the opening quarter remains NYK vs UTA December 23: **4.86 → 3.16**, gap **−0.87 → +0.83**. [homecoming-impact.csv](homecoming-impact.csv) lists every positive-load game. Coefficients were not changed.

### Mirror home-stand feature also retains the previous stand

A separate independent current-home oracle finds **507 `features.homeStandLength` mismatches** on away/neutral sides: expected 0, model feature retains the preceding home stand. This feature is not a stored fatigue column and does not enter the current score. It is exposed to offline feature analysis/fitting; changing its meaning would require regenerating affected analysis artifacts and assessing prior fitted conclusions, rather than silently editing a published model number. Full mismatches are in `home-stand-feature-mismatches.json`.

## Mileage and geographic return-home research

The stored per-game mileage is a rolling window: prior-game arrivals dated D−7 through D−1, plus arrival at tonight. Its inbound leg into the first prior fixture can have been travelled earlier. Season Mileage charges each leg once. All 2,400 stored rolling values agree with the independent oracle; that verifies implementation consistency, not observed travel.

There are **708 zero incoming legs** under the current rule. Same arena/home stands are expected zeros; Austin is the confirmed missing physical-venue case. Maximum single incoming leg is SAS Manchester → San Antonio, January 20, **4,851.365 miles**; the same game's rolling total is **9,603 miles**, including the earlier European inbound legs. The large value is plausible geography under the published venue sequence, not a negative/impossible-distance failure.

There are **86 nonzero local legs under 100 miles**: LAC/LAL 24, GSW/SAC 23, NYK/PHI 10, BKN/NYK 9, CHI/MIL 8, BKN/PHI 7, CLE/DET 5. Such legs are geographic distances and must not be described as observed flights or charter mileage.

Every **consecutive away-to-away pair**, including one-off-day possibilities, is exported: **680 pairs** in `all-consecutive-away-pairs.csv`. For each, the audit computes direct distance, hypothetical via-home distance, extra detour, home-to-origin/destination distance, closest distance from home to the finite great-circle route, projected position along it, and ratio. Distance to the finite route uses cross-track distance only where projection falls within the segment, otherwise nearest endpoint.

An explicit **research-only queue** uses gap ≥2 calendar days and via-home extra distance ≤150 miles: **55 pairs**. This arbitrary screening threshold is not a routing rule or evidence of a home visit. [geography-research-queue.csv](geography-research-queue.csv) retains the numerical basis and break flags. Geographic examples with small detours include ORL Miami → Atlanta March 10–13 (+0.355 miles, home within 9.808 miles of direct route), OKC Memphis → Phoenix March 20–23 (+1.682; proximity 30.824), and WAS Philadelphia → Houston January 12–15 (+1.671; proximity 19.126). Geography does not establish transport, arrival time or the itinerary.

There are **99 away-to-away gaps ≥3 calendar days**, kept separate from the 55-pair queue. Six cross the undefined December Cup window and six cross the All-Star break; the six Cup gaps can acquire intervening games and are not reliable completed itineraries. All-Star examples include DAL Orlando → GSW February 17–25 (+4.430 via-home miles) and PHX Philadelphia → New Orleans on the same dates (+2,303.401). A long break alone cannot justify a universal return-home assumption. Individual All-Star travel can differ from team travel.

## Breaks, unknown fixtures and limits

`all-long-gaps.csv` retains **424 team gaps ≥3 days**, with separate Cup, All-Star, Thanksgiving, Christmas, MLK and Presidents' Day overlap flags. All 30 teams cross the December undefined-fixture window and the February break; holiday flags are calendar annotations, not explanations of team behavior. Current [NBA key dates](https://www.nba.com/news/key-dates) identify All-Star break February 19–24; that interval contains no assigned regular fixtures in this snapshot.

The [NBA release](https://pr.nba.com/2026-27-nba-regular-season-schedule/) and [Cup FAQ](https://www.nba.com/news/nba-cup-frequently-asked-questions) leave two regular-season matchups per team unresolved for December 4–10: 30 future fixture rows overall, eventually 1,230 regular games. Cup championship December 11 is excluded from regular-season standings, but is still a physical game for two participating teams. Their participants are unknown now. A future refresh must verify that this final enters physical workload/travel context even while remaining outside regular-season publication and totals. The present 1,200 assigned regular fixtures are not the complete future physical-game itinerary; the missing-context boundary is 30 unresolved regular fixtures plus this championship event, not just the 30 standings games. All 80-game totals, rankings, workloads after the gap and season Mileage are provisional until additions are published and downstream context is refreshed.

Observed scope is the entire assigned season, not every possible future reschedule. No actual flight logs, charter contracts, ground itineraries, physical arrival times or airport usage were measured. No real held/cancelled fixture path, production correction, rescore, rendered UI or deployment was exercised. The owner's presentation preference is **Mileage** in the interface, with definitions in **Behind the Data**; this audit records that preference and changes no app copy.

## Reproduction and raw evidence

See [README.md](README.md). Raw DB/public/provider/PDF evidence remains gitignored under `docs/audit/2026-10-20-full-season-audit/`; `raw-manifest.json` records exact file sizes, SHA-256 hashes and source URLs, including original capture provenance for the reused August schedule PDF. Scripts perform read-only capture, sequential paced canonical API requests, independent computation and offline source replay. The full unit suite is unnecessary for these document-only audit artifacts; targeted script and repository type checks establish reproducibility.
