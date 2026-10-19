# Historical venue and itinerary audit — 2026-10-20

The **51,695 stored games in all 42 seasons** have a row-level venue inventory. This is **not a complete validation of every historical arena or actual journey**. The bounded case register identifies **167 omitted physical venues**: 156 supported by primary event/history or whole-season statements, plus 11 Austin cases whose venue is supported by the schedule feed and partially checked against primary dated announcements. A whole-season statement establishes an era; it is not an individual gamebook for every date.

No application, model, coefficient, database, or published figure changed. The immutable database snapshot comes from [the numeric capture manifest](../numeric/snapshot-manifest.json). These files are research, not an approved correction or rescore.

## Results and confidence

| Class | Games | What the count establishes |
|---|---:|---|
| Toronto temporary base, 2020–21 | 36 | Physical home city was Tampa; source still uses Toronto. [League announcement](https://www.nba.com/news/raptors-to-finish-2020-21-season-in-tampa). |
| Golden State, 1996–97 | 41 | San Jose temporary season; source uses San Francisco. [City environmental report](https://sfocii.org/sites/default/files/inline-files/Vol%201_GSW_MB_DSEIR.pdf). |
| Seattle, 1994–95 | 43 | Tacoma temporary season, including two playoff homes; source uses Seattle. [Seattle council arena report](https://seattle.gov/documents/departments/council/committees/centralstaff/key-arena-report-june-2015.pdf). Individual fixtures are inferred from the season statement. |
| Katrina minority homes | 11 | Nine New Orleans homes, one Baton Rouge, one Norman, all mapped to Oklahoma City. [Team history](https://www.nba.com/pelicans/news/the_hornets__hurricane_katr_2010_08_26.html), [Baton Rouge game](https://www.nba.com/game/phx-vs-nok-0020500329/box-score), [Norman game](https://www.nba.com/game/sac-vs-nok-0020500518). |
| Pre-2013 international neutral games | 15 | Twelve Japan, one Mexico, two London fixtures retain false neutral flags. Sources below; these do not exhaust domestic alternate homes. |
| Recent omitted genuine neutral games | 3 | Mexico City 2022-12-17 and both Las Vegas semifinals 2023-12-07. Details below. |
| Austin homes | 11 | Two per season 2022–23 through 2025–26, plus three assigned 2026–27. Per-date primary checking is partial. [2023 team announcement](https://www.nba.com/spurs/news/san-antonio-spurs-announce-spurs-week-and-spurs-fan-fest-in-conjunction-with-i-35-series-in-austin), [2025 league schedule](https://pr.nba.com/2024-25-nba-regular-season-schedule/), [current team schedule](https://www.nba.com/spurs/schedule). |
| Anaheim corroborated subset | 4 | 1992 playoff plus Lakers visits in 1997–99. [Lakers history](https://www.nba.com/lakers/news/161021-lakers-history-orange-county). The wider 1994–99 split schedule is not individually validated. |
| Hartford corroborated subset | 2 | 1986-12-02 and 1995-02-23; broader alternate-home history remains incomplete. [League history](https://www.nba.com/news/history-this-date-in-nba-dec), [official game](https://www.nba.com/game/orl-vs-bos-0029400699). |
| Baltimore corroborated subset | 1 | 1997-02-14; broader Bullets split schedule remains incomplete. [Official game](https://www.nba.com/game/njn-vs-was-0029600707/box-score). |

[corroborated-venue-cases.csv](corroborated-venue-cases.csv) lists exact stored game IDs, dates, sides, modeled/actual city, source and confidence. **Every one of its 167 rows has a wrong modeled city; this count does not include correctly represented games.** [affected-adjacent-team-legs.csv](affected-adjacent-team-legs.csv) lists **334 team contexts**, with previous fixture and immediate next fixture. These are exposed inbound/outbound contexts, **not 334 proven nonzero mileage errors**. Same-building and home-to-home branches can suppress a change; rolling windows can expose later games too. No numerical rescore was executed.

Separately, [confirmed-era-individual-venue-inferences.csv](confirmed-era-individual-venue-inferences.csv) holds **1,415 Detroit home fixtures** across Silverdome/Palace eras. The historical arena omission is established by [league history](https://www.nba.com/news/pistons-former-arena-palace-torn-down); individual actual venues remain inferred, so these are **not added to the 167**. They require alternate-site reconciliation. This is a material suburban displacement, not a sub-mile arena adjustment.

## Genuine neutral sites and publication exposure

| Stored game ID | ET date | Fixture | Actual venue | Stored state |
|---|---|---|---|---|
| 11144 | 2022-12-17 | MIA at SAS | Arena CDMX, Mexico City | neutral=false; modeled San Antonio |
| 923 | 2023-12-07 | IND at MIL | T-Mobile Arena, Las Vegas | neutral=false; modeled Milwaukee |
| 924 | 2023-12-07 | NOP at LAL | T-Mobile Arena, Las Vegas | neutral=false; modeled Los Angeles |

The [league Mexico announcement](https://pr.nba.com/nba-mexico-city-game-to-return-with-regular-season-matchup-featuring-san-antonio-spurs-and-miami-heat-on-dec-17/) and official [IND–MIL](https://statsdmz.nba.com/pdfs/20231207/20231207_INDMIL_book.pdf)/[NOP–LAL gamebooks](https://statsdmz.nba.com/pdfs/20231207/20231207_NOPLAL_book.pdf) corroborate these locations. The two 2024 semifinals and two 2025 semifinals already have recognized Las Vegas neutral records. The three Cup championships remain absent by design; excluding standings totals does not remove their physical workload. This audit does not add them.

A neutral omission affects more than Mileage: nominal-home road status, circadian displacement, Mexico altitude and rested-at-home eligibility may also be wrong. **Austin, Hartford, Anaheim, Tacoma and temporary team bases must not automatically become neutral simply to supply coordinates.** Physical venue, designated side and local-home status need separate decisions. All **34 stored true-neutral rows** resolve to one of the six source cities; there are **zero currently stored unknown-city neutral rows**. Unknown future cities still fall back to a home arena and home classification because resolution returns null.

The 15 early international fixtures are Japan 1990/1992/1994/1996/1999/2003 pairs, Mexico 1997 and London March 2011. [League November history](https://www.nba.com/news/history-this-date-in-nba-nov), [Magic history](https://www.nba.com/magic/news/orlando-magic-utah-jazz-postgame-story-recap-20211107), [2003 official game](https://www.nba.com/game/lac-vs-sea-0020300015), [Mexico announcement history](https://www.nba.com/news/history-this-date-in-nba-june), [London history](https://www.nba.com/news/nba-london-game-2026-everything-to-know). Stored ET dates for Japan can precede the local event date; the CSV preserves stored ET dates. ADR 0003's example saying “2011–12 London” should be reconciled with the March 2011 events. Mexico's 1997 arena also differs from today's Arena CDMX; adding its city alone would still approximate an older arena.

The 2019–20 bubble has **88 regular-season rows**. Their cities remain nominal in stored metadata but publication excludes the abnormal stretch. This is an excluded geometry limitation, distinct from active-season omissions. The all-game inventory also retains bubble playoff rows. No preseason or All-Star event is silently added to team workload.

## Provider coverage is not actual-venue verification

The capture issued **1,260 team/season requests**. **257 responses did not identify the requested season** and are rejected. The remaining responses match **40,123 stored fixtures**, of which **36,548 have a nonempty venue city**. The secondary Basketball-Reference archive supplies **3,048 additional early-season arena observations**, including nine Hartford candidates; these are not all primary-verified. Coverage is tabulated for **every season below and in [season-venue-coverage.csv](season-venue-coverage.csv)**.

The **3,049 provider/model city mismatches** in [provider-city-candidates.csv](provider-city-candidates.csv) are candidates, **not 3,049 defects**. They include deliberate metro-level approximations (Oakland/San Francisco, New Jersey/Brooklyn), correctly located modern Clippers games whose team city label says Los Angeles but whose coordinates are in Inglewood, bubble rows, real omissions and provider mistakes. [provider-arena-era-inventory.csv](provider-arena-era-inventory.csv) inventories 150 observed franchise/arena/city groups across all 30 franchises, with observed date ranges. Those ranges are coverage boundaries, **not authoritative arena occupancy dates**.

A concrete provider error: ESPN assigns **2010-11-17 WAS at BOS to Orlando's current arena name**, while the [NBA record identifies TD Garden, Boston](https://www.nba.com/game/was-vs-bos-0021000160/play-by-play). ESPN also assigns 1996–97 Warriors homes to Oakland despite the primary San Jose season statement. Names such as today's Tampa arena sponsor are retroactive. Neither name agreement nor a nonempty city is sufficient acceptance evidence.

Still unclosed: full Hartford/Baltimore/Anaheim dates; historical Cleveland/Richfield, Detroit suburbs, Nets' successive New Jersey homes, Oakland/San Francisco, Clippers' LA/Inglewood arenas, Sacramento's ARCO sites, Atlanta's 1997–99 split venues, and the smaller intra-city moves of the other franchises. Current team coordinates cannot be represented as exact arena geography for every past season. Sub-mile coordinate/name changes should be prioritized below wrong-city and cross-city cases, but no arbitrary distance threshold proves correctness.

## Itinerary and airport limits

`docs/audit/2026-10-20-historical-audit/venues/all-consecutive-away-pairs.csv` (local raw, not committed) inventories **26,054 pairs** across all stored seasons; **4,081 have a calendar gap of at least three days**. Those are research descriptors only. No gap, geographic detour, apparent nearby home city or All-Star interval establishes a team home visit. The underlying chain includes regular season and playoffs; the inventory identifies that scope explicitly.

[season-allgame-endpoints.csv](season-allgame-endpoints.csv) preserves first/last fixture assumptions for each team/season. Current Season Report charges an away opener from the era home arena, counts no return after its last included regular fixture, and does not include pre-season camp travel. A postseason chain answers another scope. All-Star participants can travel separately from their team; Cup finalists play an extra physical game; actual intermediate home stops and overnight locations are generally unknown.

Nearby pairs (New York/Brooklyn/Philadelphia, LA/LA, Chicago/Milwaukee, Cleveland/Detroit, Golden State/Sacramento) are geographic legs, not verified flights. Existing [East](../../2026-10-20-team-airports-east.md)/[West airport research](../../2026-10-20-team-airports-west.md) is mostly dated candidate or capability evidence, not a historical airport table. Arena relocations do not prove airport changes; FBO identity does not identify a different airport. Historic charters, ground transport, actual departure/arrival, diversions and intermediate stops remain unmeasured. Existing [East](../../2026-10-20-itinerary-research-east.md)/[West itinerary cases](../../2026-10-20-itinerary-research-west.md) demonstrate exceptions without validating a universal return-home classifier.

D-120's approved interface label is **Mileage**. Behind the Data should retain scheduled venue-to-venue straight-line assumptions and the rolling/once-counted distinction. This audit approves no airport substitution, automatic home-stop rule or coefficient change.

## Reproduction and artifacts

Run from the repository root:

```sh
python3 docs/research/2026-10-20-historical-audit/venues/capture_espn.py
python3 docs/research/2026-10-20-historical-audit/venues/inventory.py
python3 docs/research/2026-10-20-historical-audit/venues/classify.py
```

Python needs BeautifulSoup and lxml for the secondary archived HTML parser; network capture uses stdlib urllib. No database connection is used by these scripts. The first command reuses cached response bodies. DB snapshot capture is owned by the numeric audit. Raw captures, the complete 51,695-row inventory and complete away-pair inventory are local under `docs/audit/2026-10-20-historical-audit/venues/`; [raw-artifact-manifest.json](raw-artifact-manifest.json) pins their SHA-256 hashes. [espn-manifest.json](espn-manifest.json) pins every response; [primary-source-manifest.json](primary-source-manifest.json) distinguishes successful raw archives from HTTP 403s. Primary NBA pages were readable through web retrieval, but most raw urllib requests were blocked; an unarchived body is not claimed hashed evidence. City-report PDFs were archived.

Implemented: reproducible coverage/case/context inventories. Exercised: frozen all-row matching and public-provider capture. Verified: bounded primary venue omissions and the source fallback contract. Unverified: complete historical venue correctness, actual routing/airports, score impact and corrected production behavior. No app test/build, rendered UI, deployment or rescore is claimed by this research-only slice.

## Every-season coverage

`ESPN city` means a matched response contains a city, not independently verified geography. `BRef arena` is secondary evidence. `Cases` includes the explicitly qualified Austin register.

| Season | Stored games | ESPN fixture | ESPN city | BRef arena | Cases |
|---|---:|---:|---:|---:|---:|
| 1985-86 | 1011 | 0 | 0 | 1011 | 0 |
| 1986-87 | 1014 | 0 | 0 | 1014 | 1 |
| 1987-88 | 1023 | 0 | 0 | 1023 | 0 |
| 1988-89 | 1087 | 0 | 0 | 0 | 0 |
| 1989-90 | 1179 | 0 | 0 | 0 | 0 |
| 1990-91 | 1175 | 0 | 0 | 0 | 2 |
| 1991-92 | 1180 | 0 | 0 | 0 | 1 |
| 1992-93 | 1183 | 0 | 0 | 0 | 2 |
| 1993-94 | 1184 | 1107 | 451 | 0 | 0 |
| 1994-95 | 1180 | 1107 | 533 | 0 | 46 |
| 1995-96 | 1257 | 1189 | 656 | 0 | 0 |
| 1996-97 | 1261 | 1189 | 660 | 0 | 45 |
| 1997-98 | 1260 | 1189 | 742 | 0 | 2 |
| 1998-99 | 791 | 724 | 484 | 0 | 1 |
| 1999-00 | 1264 | 1168 | 990 | 0 | 2 |
| 2000-01 | 1260 | 1189 | 1025 | 0 | 0 |
| 2001-02 | 1260 | 1189 | 1066 | 0 | 0 |
| 2002-03 | 1277 | 1189 | 1107 | 0 | 0 |
| 2003-04 | 1271 | 1189 | 1146 | 0 | 2 |
| 2004-05 | 1314 | 1230 | 1230 | 0 | 0 |
| 2005-06 | 1319 | 1230 | 1228 | 0 | 5 |
| 2006-07 | 1309 | 1230 | 1230 | 0 | 6 |
| 2007-08 | 1316 | 1230 | 1230 | 0 | 0 |
| 2008-09 | 1315 | 1230 | 1229 | 0 | 0 |
| 2009-10 | 1312 | 1230 | 1230 | 0 | 0 |
| 2010-11 | 1311 | 1230 | 1227 | 0 | 2 |
| 2011-12 | 1074 | 990 | 990 | 0 | 0 |
| 2012-13 | 1314 | 1229 | 1229 | 0 | 0 |
| 2013-14 | 1319 | 1230 | 1230 | 0 | 0 |
| 2014-15 | 1311 | 1230 | 1230 | 0 | 0 |
| 2015-16 | 1316 | 1230 | 1230 | 0 | 0 |
| 2016-17 | 1309 | 1230 | 1230 | 0 | 0 |
| 2017-18 | 1312 | 1230 | 1230 | 0 | 0 |
| 2018-19 | 1312 | 1230 | 1230 | 0 | 0 |
| 2019-20 | 1142 | 1055 | 1055 | 0 | 0 |
| 2020-21 | 1171 | 1080 | 1080 | 0 | 36 |
| 2021-22 | 1323 | 1230 | 1230 | 0 | 0 |
| 2022-23 | 1320 | 1230 | 1230 | 0 | 3 |
| 2023-24 | 1318 | 1230 | 1230 | 0 | 4 |
| 2024-25 | 1320 | 1230 | 1230 | 0 | 2 |
| 2025-26 | 1321 | 1230 | 1230 | 0 | 2 |
| 2026-27 | 1200 | 1200 | 1200 | 0 | 3 |
