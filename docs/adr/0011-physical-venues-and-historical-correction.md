# Physical venues are separate from home-court designation

Accepted October 20, 2026, after the owner approved the all-season audit recommendations and full recalculation. A fixture's listed home team, actual arena, modeled team base and neutral/home-court status are separate facts. A provenance-bearing fixture registry keyed by Eastern date and canonical pairing supplies known exceptions without requiring a production schema migration; one resolver feeds tonight's score, prior-game context and season Mileage.

Alternate homes such as Austin, Tacoma and San Jose keep their non-neutral home designation. Their actual arena endpoints still contribute travel, including consecutive designated home games in different arenas. Tampa has explicit temporary-base evidence; an arena-only season statement does not establish a residential or circadian-base relocation elsewhere. Genuine neutral fixtures exclude both sides from home-court baselines and venue-priced Worth, while remaining part of physical workload and descriptive schedule-edge counts.

The current-away streak ends at a non-neutral designated home game, and the current home stand ends at an away game. Earlier travel and workload remain measured by their existing terms. This resolves a shared helper contract inconsistency; it neither fits new coefficients nor invents a separate lingering post-trip term. The coefficient values, one-mile same-arena tolerance, windows, zero floor and JavaScript rounding remain unchanged.

Known Japan venues use UTC+9 without daylight saving. Civil-clock differences use the shortest signed shift modulo 24 hours, retaining the raw sign for exactly ±12 hours; this avoids interpreting a Pacific trip as a 14–17-hour eastward shift. Historical US daylight saving before 1987 and Indianapolis before 2006 follow their documented rules. This is bounded support for known venues, not complete worldwide historical timezone geocoding. Calendar-day transition approximations and the inactive body-clock feature's instant/calendar limitation remain documented.

Mileage is estimated straight-line venue distance, not recorded flights. Season totals begin at the dated modeled base, charge each inbound leg once and omit a final return; the fatigue model's separate no-prior-history reset remains zero. No automatic intermediate home return, airport substitution, aircraft route or travel mode is inferred.

The three completed NBA Cup finals and the 2020 play-in game are workload events even though
they are not regular-season outcome targets. Insert only these source-verified missing fixtures,
with explicit `cup_final` or `play_in` types, and retain all existing game identities. Density,
recent-game history and season Mileage must include this physical context without adding
regular-season target rows. Season Mileage attributes intervening context legs to the next
published regular appearance; it does not drop the inbound Cup leg or include a trailing
postseason journey after the final regular appearance.

The bounded 2020 restart uses a Disney-campus location and temporary operating base for its
22 participating teams, with an individual court override where verified. The campus point
represents intercity mileage, not surveyed court locations. NBA/NBPA's
[single-site restart release](https://www.nba.com/news/nba-nbpa-finalize-season-comeback-official-release)
and [team roster release](https://pr.nba.com/nba-announces-team-rosters-for-season-restart/)
establish the bounded regime. These games are neutral; the existing abnormal-stretch exclusion
continues to remove them from published regular-season findings. Geometry correction does not
validate the normal-travel fatigue model for bubble life: neutral games remain non-home and
retain the ratified workload terms. No score is forced to zero.

Confirmed input corrections, all score pairs and eligible unresolved pre-tip predictions are rehearsed against a restored PostgreSQL backup in a single locked, compare-and-swap transaction. Resolved predictions remain historical records, while current win-rate analyses are recalculated from corrected game/score joins. Generated artifacts and their producers move together. Production replacement requires immediate owner approval, a verified maintenance cutover, exact source/data fingerprints and conditional rollback; an approved local candidate is not deployed evidence.


Analysis-cache fingerprints cover game identities, result/venue fields and all relevant
fatigue revisions. This conservative scope includes the selected latest rows and detects
missing/recovered sides; edits to superseded rows can also invalidate the cache. Latest-row
selection still uses computation time and then row ID descending to resolve ties consistently.
A count/date/result-only stamp misses these inputs.

The measured ordered latest-row digest cost more than the loader itself. The completed cache
instead fingerprints tagged, structured native `ROW` text using two seeded whole-text hashes,
XOR aggregates and row counts. Null and empty values remain distinct. PostgreSQL documents
[`bit_xor` for unordered checksums](https://www.postgresql.org/docs/15/functions-aggregate.html).
This is a version-prefixed, bounded-age cache freshness check, not cryptographic integrity or
a guarantee of independent 128-bit security. Physical-season context retains its richer
fingerprint. Production transition approval and audit integrity still use exact SHA-256
manifest/source/snapshot hashes, maintenance and CDN/deployment-cache verification.

## Arena-era source amendment — October 20, 2026

D-131 extends dated physical locations to moves within a metro. `arena-history.json` assigns
one sourced point per building, including shared Los Angeles homes. Historical coordinates
are mapped estimates with explicit provenance; first/last observed games do not establish an
exact operating move date. Ordinary offseason cutovers use July 1, with actual midseason
arena changes and the already ratified temporary operating-base bounds handled explicitly.

A modeled-base override is not a factual active-arena era. Atlanta's 1997-99 interregnum keeps
the exact released base point because no operating relocation is established. Every actual
home fixture is separately assigned to Georgia Dome or Alexander Memorial Coliseum. Missing
fixture evidence fails before the base can be mistaken for the game's physical location.
This does not introduce a majority-venue, airport or inferred-return rule. The new correction
protocol is separate from the immutable previous overtime transition.
