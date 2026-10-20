# Western arena research — 2026-10-20

Research records only; no application, generated analytics, or database mutation. The requested Claude handoff and A3 report were read in full. Their coordinates and dates were treated as candidates.

`inventory.csv` and [INVENTORY.md](INVENTORY.md) cover all 15 assigned current franchises: 39 default arena eras, 34 distinct physical-site keys. They contain dated NBA fixture links, primary era-history links, original coordinate-provider links, coordinate type, and independent status fields. All 34 physical sites now have source-mapped arena-scale points for owner review; there are no coordinate HOLDs. HemisFair and old Salt Palace use the root’s separately captured/adjudicated original USGS map-symbol points with explicit selection uncertainty. This is an exhaustive default-era candidate inventory, not a claim that every intervening fixture’s venue has been individually proved.

## Date contract and fixture replay

The baseline is the completed-game `after` state in the immutable overtime candidate SHA256 `69582d522ef03055cf093ec7cd83438d1eedd6bbbd076ad50ab75c1461ef0bd0`. Its location is recorded as an input, not as an output dependency that may be silently relabeled. All first/last fixtures are actual FINAL games; scheduled 2026-27 games are excluded. Regular season, postseason, and play-in endpoints are retained where present. Preseason, exhibitions, and later preseason returns are excluded.

For arenas already used before 1985-86, **first means first covered fixture**, not the arena’s first-ever NBA game. Active eras have a last completed fixture as of the frozen snapshot, not a known final-ever game. A verified boundary fixture’s identity/date does not alone prove its venue or extremality; those depend on the independently cited physical-era history and the separate exception inventory.

`python3 docs/research/2026-10-20-arena-shooting/western-arenas/verify-boundaries.py` re-read the retained HTML, verified compressed/uncompressed hashes, parsed the original `__NEXT_DATA__` game payload, and checked ID, ET date, game-code date, final status, both teams, game-code pairing, and both final scores against the frozen snapshot: **78/78 passed**. Historical source codes include UTH→UTA, SEA→OKC, VAN→MEM, and NOH/NOK→NOP. Output: `boundary-identity-check.json`.

## A primary provider can have the wrong historical building

`venue-label-conflicts.csv` retains **17 demonstrably conflicting boundary arena labels**. These are physical-building errors rather than sponsor renames. Examples:

- DAL’s 2001-10-30 AAC opener is labeled Reunion Arena in the NBA payload. The team’s [2024-25 guide](https://cdn.nba.com/teams/legacy/www.mavs.com/wp-content/uploads/2025/02/2024-25-Dallas-Mavericks-Media-Guide-2.pdf), PDF pages 364–365, places that fixture at American Airlines Center.
- GSW’s Oakland fixtures in 1985 and April 1996 are labeled San Jose; the actual 1996-97 San Jose boundaries are labeled Oracle. The [Warriors guide](https://cdn.nba.com/teams/uploads/sites/1610612744/2023/12/2324-gsw-media-guide.pdf), PDF page 287, expressly puts all 1996-97 home games at San Jose during Oakland renovation.
- Seattle’s 1994-95 Tacoma boundaries are labeled KeyArena. The [Seattle municipal report](https://seattle.gov/documents/departments/council/committees/centralstaff/key-arena-report-june-2015.pdf) documents the renovation/displacement.
- Old Phoenix Veterans, Portland Memorial, Sacramento ARCO I, and Utah Salt Palace boundaries carry their franchises’ later building labels. San Antonio’s 1993-05-20 HemisFair finale is even labeled US Airways Center in Phoenix. Primary guides/history sources are attached row by row.

Do not derive physical arena eras directly from `arenaName` or its provider arena ID, even when the game identity and scores are correct.

## Per-franchise progress

| Franchise | Default physical sequence from coverage start | Primary anchors and remaining boundary limits |
|---|---|---|
| DAL | Reunion → AAC (2001-10-30) | Team guide opener table closes the new-arena first fixture; NBA last-Reunion fixture 2001-05-12 retained. Original GeoNames historical point is corroborated by Dallas’s 2009 demolition address and municipal archive history. |
| DEN | McNichols → Pepsi/Ball (1999-11-02) | [2025-26 team guide](https://cdn.nba.com/teams/uploads/sites/1610612743/2025/10/2025-26-Denver-Nuggets-Media-Guide.pdf) has season/arena attendance history (PDFp334) and historical matchup dates. Original GeoNames historical point was projected onto the 1983 USGS map and matches its arena footprint; Google’s former-arena marker does not. |
| GSW | Oakland → San Jose 1996-97 → Oakland → Chase (2019-10-24) | Whole San Jose season is expressly documented; [team opening-night account](https://www.nba.com/warriors/news-blogs/warriors-opening-night-20191025) and final Oracle playoff fixture 2019-06-13 retained. Same Oakland site key/point used before and after renovation. |
| HOU | Summit/Compaq → Toyota (2003-10-30) | [Rockets guide](https://ak-static-int.nba.com/wp-content/uploads/sites/3/2016/10/2016-17-Media-Guide-Rockets.pdf), PDFp134, separates 2002-03 Compaq and 2003-04 Toyota. Original OSM surviving-building ring yields a mapped footprint center; municipal appraisal links Lakewood to former Compaq. |
| LAC | Sports Arena → STAPLES (1999-11-02) → Intuit (2024-10-23) | Team-authored [2016 guide](https://library.sfo2.cdn.digitaloceanspaces.com/publications/basketball/yearbooks/KLACLMG-2016.pdf), PDFp138, explicitly gives Sports Arena final 1999-05-05 and STAPLES regular opener 1999-11-02. Its 1999-10-27 STAPLES event is preseason. [NBA opener report](https://www.nba.com/news/starting-5-espn-doubleheader-oct-23) corroborates Intuit’s first regular fixture. Sports Arena’s wrong Google match is rejected; original GeoNames historic point is paired with the 2015 city redevelopment map/address. |
| LAL | Forum → STAPLES/Crypto (1999-11-03; ongoing) | [Lakers season capsules](https://www.nba.com/lakers/history/season-capsule) confirm competitive Forum finale 1999-05-23. Later preseason Forum games do not extend the default era. LAL and LAC use one STAPLES physical key and identical coordinate strings. |
| MEM | Vancouver GM Place → Memphis Pyramid (2001) → FedExForum (2004) | [Team ownership history](https://www.nba.com/grizzlies/news/news-120611-grizzlies-sale) confirms 2001 relocation and 2004 FedEx move; all six boundary fixtures retained. Vancouver municipal report identifies GM Place as present Rogers Arena. Original OSM surviving Pyramid building ring yields a mapped footprint center. |
| MIN | Metrodome 1989-90 → Target (1990-11-02) | [Wolves guide](https://cdn.wolveslynx.com/timberwolves/communications/guides/2020-21_Wolves-MediaGuide.pdf), PDFp55 and home-opener tables, supports Target first regular game. It explicitly describes 1990-04-17 as final Metrodome appearance. Native GeoNames Metrodome point is corroborated by the 2012 MSFA site-map footprint/address (PDFp26, rendered). |
| NOP | New Orleans → mostly Oklahoma City 2005-07 → New Orleans | [Pelicans guide](https://ak-static-int.nba.com/wp-content/uploads/sites/3/2016/10/2016-17-Media-Guide-Pelicans.pdf), PDFp131, counts 36 Ford +3 NO +1 Baton Rouge +1 Norman homes in 2005-06, and 35 Ford +6 NO in 2006-07. The 11 exceptions remain separate. [Team’s 2014 record-allocation explanation](https://www.nba.com/pelicans/news/countdown-pelicans-training-camp-18-days) makes official Pelicans history begin 2002-03; pre2002 Charlotte belongs to CHA. |
| OKC | Seattle Coliseum/Key → Tacoma 1994-95 → Key → OKC Ford (2008) | Seattle municipal report supports the one-season displacement. Earlier Tacoma fixtures are separate candidates. NOP and OKC Ford/Chesapeake/Paycom share one physical key and identical mapped coordinates. Historical Seattle marker is a site estimate, not proof of unchanged court center after later reconstruction. |
| PHX | Veterans → America West and sponsor renames (1992-11-07) | Team-authored [2013 guide](https://library.sfo2.cdn.digitaloceanspaces.com/publications/basketball/yearbooks/KPHXSMG-2013.pdf), PDFp120 and167, gives both new-home opener and last Veterans game (1992-05-11). State Fair identifies the surviving Coliseum/address. |
| POR | Memorial → Rose Garden/Moda (1995-11-03) | Municipal/NPS identity records support Memorial’s physical building; the [city’s historic-landmark hearing](https://www.portland.gov/bds/landmarks/events/2024/5/13/5-13-24-historic-landmarks-commission-hearing-agenda) gives 300 N Ramsay Way. Both boundary games retained; historical NBA labels falsely say Moda for old Memorial. |
| SAC | ARCO I → ARCO II (1988-11-08) → Golden 1 (2016-10-27) | [Kings guide](https://cdn.nba.com/teams/uploads/sites/1610612758/2023/10/2023-24SacramentoKingsMediaGuide.pdf), PDFp132, expressly separates first three Sacramento seasons at ARCO I from first ARCO II game. [Team’s final-home-game preview](https://www.nba.com/kings/blog/preview-kings-thunder-40916) corroborates ARCO II final 2016-04-09. Original OSM ARCO I building ring is paired with the state DCA’s explicit original-arena identity and 1625 N Market address; ARCO II uses its own original Google marker plus municipal One Sports Parkway and preserved HIFLD corroboration. Never reuse one arena’s point for the other. |
| SAS | HemisFair → Alamodome (1993-11-05) → SBC/AT&T/Frost (2002-11-01) | Team-authored [2013 Spurs guide](https://library.sfo2.cdn.digitaloceanspaces.com/publications/basketball/yearbooks/KSASPMG-2013.pdf), PDFp120, explicitly gives HemisFair finale 1993-05-20. Alamodome 2023 return and Austin games belong to fixture overrides. HemisFair uses the root’s original 1992 USGS map-symbol point, selected against the official 1968 site plan; estimated selection uncertainty 40m. |
| UTA | Salt Palace → Delta and sponsor renames (1991-11-07) | [Jazz guide](https://ak-static-int.nba.com/wp-content/uploads/sites/3/2016/10/2016-17-Media-Guide-Jazz.pdf), PDFp136, lists Salt Palace 1979-91 separately from new arena 1991 onward. Current convention-center map pin is rejected; original USGS 1963 /1975 photorevision /1993 imprint arena-symbol point is selected against the USFS 1978 aerial, with 100m selection uncertainty. |

## Coordinates, raw preservation, and adoption limits

`capture-google-named-markers.py` extracts only the mapping provider’s typed named-place tuple: provider place ID, name/address, latitude/longitude pair, CID. Viewport centers are excluded. Golden 1 required a second CID-specific response after a multi-result search; the original discovery response is retained. Provider precision is retained verbatim without implying corresponding survey accuracy.

Original coordinate bodies, primary sources, and boundary game bodies are retained under relative `raw/` paths with SHA256 bindings. `sources.json` includes failed captures as failures. Some primary pages were readable through the browsing service but direct retention returned 403; that distinction is retained. `mapping-marker-candidates.json` contains deliberately unapproved Apple address geocodes; request-name echo alone is not named-POI evidence.

NPS Forum registration contains four parcel corners, not the court point. Portland NPS registration supplies UTM references whose datum was not established here. Neither was silently converted into a court-center coordinate. The preserved HIFLD mirror is labeled government-authored data carried by a third party whose original government service is now inaccessible; it is corroboration, not a current official government publication.

The root closed HemisFair and old Salt Palace using original USGS GeoPDF georeferences and independent primary visual identity. Native GeoNames, original OSM rings, and USGS map comparisons close the other historical/converted-site points as mapped estimates. No point was inserted into application data. Original ARCO I is a surviving repurposed building, not assumed demolished. Native GeoNames ARCO’s point about 450m west of ARCO II was rejected despite its matching name.

## Separate fixtures

`alternate-fixture-candidates.csv` contains 78 deduplicated western alternate/neutral fixture candidates from the supplied audit and current registry, excluding the full San Jose/Tacoma seasons already represented as default eras. It does not promote all candidates to primary-verified status. The Clippers guide supplies a direct Arrowhead Pond 1994-01-27 anchor; Pelicans’ guide supplies categorical counts for its 11 displacement exceptions. The 1992 Lakers Las Vegas eyewitness source is identified separately; the root owns the official UNLV building marker. Full fixture-by-fixture adoption remains the root’s separate work.

## McNichols historical-map adjudication

The first USGS 1:24,000 Fort Logan sheet was photorevised1971, before McNichols opened, and was rejected as arena proof. The retained original1983DenverWest1:100,000 sheet instead shows the small indoor arena immediately south of MileHighStadium. `den-1983-geonames-comparison.json` records the full original PDF hash, source NAS-E/NAD27 transverse-Mercator projection, CTM, explicit ESRI transformation chain, and four independent neatline corner controls. `raw/den-1983-comparison-overlay.png` shows the GeoNames point inside that arena footprint and the Google former-arena point southeast and outside it. This supports an arena-scale mapped facility estimate, not court-center survey precision.

## Reproduction

Run `verify-boundaries.py`, `derive-building-points.py`, `curate_inventory.py`, `publish-research-index.py`, then `verify-archive.py` from this directory or using their project-relative paths. These scripts write only research records in this folder. `western-arenas.json` is the compact machine-readable owner-review handoff; it is not an application runtime registry. `archive-verification.json` currently checks 252 retained original-body files and the shared-coordinate invariants.

## Final root historical-point import

`root-historical-points.json` copies the exact approved two-record input (SHA256 `e434b60adb1d63cff2755d89a2b070ef53d99210c59638d00ada1f0a15a79538`) and binds original GeoPDFs, derivation script, annotated review images, and primary identity images. HemisFair is29.42051607163162,-98.48445037283402 (40mselectionuncertainty); oldSaltPalace is40.76632977658519,-111.89559815900985 (100mselectionuncertainty). Both retain7mreportedNAD27→WGS84transformationaccuracy. These are manually selected historical arena-map-symbol points, not roof-polygon centroids or court surveys. Root’s mathematical derivation was imported and its source hashes were verified; it was not independently rerun here.

Final checks:78/78NBAfixtureidentity/date/pair/final/scores;252retainedoriginal-bodyfilehashes;39eras,34physicalsites,15franchises,zero coordinateholds; all repeated physical-key coordinate strings identical. No application/generated-data/DB changes were made.

Root follow-up: the same two coordinates were independently accepted after same-datum control checks tightened to 1e-7 degrees; all four corners reproduce their original NAD27 bounds. Source record binding was refreshed; arena points did not move.


## Public embed-key redaction, 2026-10-20

A Google Maps embed key copied from the publicly served Smoothie King Center source page
was inadvertently retained in the extracted `sources.json` final URL. Its query value is
now `[REDACTED_PUBLIC_EMBED_KEY]`; every other byte of that metadata file is preserved.
The research capture process was responsible for publishing the extracted value. This is
not an application credential supplied from FullCourt's environment, and that provenance
does not make republishing it necessary. No key was printed, API-tested or revoked.

The exact original metadata is privately retained with mode 0600 at
`docs/audit/arena-shooting-correction/release/security/source-metadata-original.json`.
Original raw response bytes, their hashes, source proof and candidate manifest are unchanged.
The public metadata file has a new hash; retain the original against earlier provenance
bindings instead of rewriting frozen proof. A native Node contract scans tracked extracted
`source(s).json` metadata URLs for Google API key values; it does not rewrite or scan private
raw captures. Existing Git history has not been purged, and this correction does not claim
credential revocation or production deployment. Future capture must redact extracted public
URLs before publication while separately preserving authenticated private original bytes.

The historical public-commit exposure remains a residual issue. The secret alert stays OPEN;
it has not been closed as a false positive or as revoked. A sanitized current tree alone
does not remove old public history.
