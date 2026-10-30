# Official NBA source validation for current shot attempts

Measured October 30 UTC / October 31 KST against FullCourt `9a18bf09`, before
production adoption. The staged artifact was collected at 12:26 PM Eastern on
October 30. Local raw records, hashes and reproducible checks are retained under
`.local/shot-validation-2026-10-31/`; the collector and stripped real fixtures are
tracked with this change. No database reads, model fitting or model deserialization
were used for this source validation.

## Finding

[Verified] NBA.com's public game pages embed a structured box score and play-by-play
record. Both `hanaV3` and `ngss` are present in this season. This is a distinct source
contract from the unreachable Stats ShotChartDetail endpoint; it must not carry that
endpoint's provider label.

[Verified] The earlier Milwaukee discrepancy is an actual omission in ESPN's PBP.
The official NBA record includes Nate Ament's missed two-pointer at Q4 8:39,
action 698, and the following offensive rebound, action 699. The cached and freshly
fetched ESPN records omit both. The [official gamebook](https://statsdmz.nba.com/pdfs/20261028/20261028_HOUMIL_book.pdf)
and [game page](https://www.nba.com/game/hou-vs-mil-0022600138/box-score) corroborate the attempt.
The 177 ordinary NBA attempts match the official player/team box counts; 176 match
ESPN events. Changing a filter would not recover the omitted attempt.

[Verified] Team-only heaves have separate accounting. The HOU–MIL gamebook records
one `TM FGA` per team outside the ordinary box totals. The NGSS example in
[CLE–ATL's gamebook](https://statsdmz.nba.com/pdfs/20261029/20261029_CLEATL_book.pdf)
records one Cleveland team attempt and none for Atlanta. Its PBP action 326 has
no shot value, result or coordinates despite retaining the player ID. Neither adapter
invents a three-point attempt, miss or rim location from that row.

## Coordinates and format-specific fields

[Verified] Four historical NBA pages join bijectively to the local ShotChartDetail
cache by NBA game ID and action number: 764/764 attempts have identical legacy
coordinates, made flags, two/three-point types, periods, players and teams. The sample
includes 42 OT attempts, 14 attempts in the final second, 77 corner threes and four
long twos. IDs: `0022400061`, `0022400107`, `0022400084`, `0022500974`.

[Verified] The PBP's `shotDistance` disagrees with the cached Stats field in 397/764
cases, including zero distances on some corner threes. It is not substituted for
the existing model's feature. PBP contains no validated NBA zone labels.

[Verified] All 549 ordinary attempts in the three NGSS games passed a separate,
fixed court-frame check. The [official court diagram](https://cms.nba.com/wp-content/uploads/sites/4/2025/10/2025-26-NBA-Officials-Guide.pdf)
supplies the 94-by-50-foot court and 5-foot-3-inch rim offset. With full-court
percentages `x/y`, the left basket predicts legacy coordinates
`((25 - y*0.5)*10, (x*0.94 - 5.25)*10)`; the right basket reverses orientation.
Maximum residual was 0.5 legacy unit per axis, within rounding tolerance; no offset
was fitted and native coordinates were retained. This is consistency between two
encodings in one feed, not independent tracking accuracy or Stats equivalence.
Eight bounded historical probes found only hanaV3, so direct NGSS-to-Stats overlap
remains unverified. These facts support raw observations, not model readiness.

## Current-season staged result

[Verified] A fresh 101-request run completed in 38.99 seconds with DATABASE_URL unset.
All 71 final regular-season games through October 29 passed the collector's page,
identity, player/team count, coordinate and end-of-collection slate checks.

| Observation | Result |
| --- | ---: |
| Accepted formats | 68 hanaV3, 3 ngss |
| Ordinary field-goal attempts | 12,652 |
| Separate team-only attempts | 65 |
| Total observed source attempts | 12,717 |
| Mapped attempts | 12,642 |
| Missing locations / outside map | 65 / 10 |
| Occupied cells | 1,208 |
| Combined excluded share | 0.5898% |

The artifact's SHA256 is
`02cdb9b7acd91f63d6dd5bcac1a0ccd49b694b3913f9bd25a76db9462c393ae5`.
The actual TypeScript publication validator accepted it as season 2026-27.
[Verified] An independent ESPN scoreboard check matched all 71 final game/date/team/score
identities, with no missing games, extras or score differences. This corroborates this
observed cohort, not every future collection.

An initial fresh CLI attempt failed with an HTTP error and wrote no artifact; its
specific HTTP status was not retained. The instrumented successful run reported no
HTTP errors. No unobserved status or cause is assigned retroactively.

## Publication boundary

RAW-v2 uses the explicit `NBA.com play-by-play` provider and accepted-format counts.
The source total equals mapped attempts plus missing-location and outside-map counts;
team-only attempts are a subset of missing locations. Duplicate shot IDs, unknown
formats, inconsistent boxes, changed cohorts and incomplete fetches reject publication.
The combined 2% exclusion guard and last-good/CAS safeguards remain in force.

Both model fields and all zone labels remain null. Existing historical models and
v1 artifacts retain their contracts. Current raw-only Expected eFG% and Model Difference
links show unavailable-model guidance; they do not render raw volume as an estimate
or copy a model finding. Existing-model inference/export and zone compatibility remain
separate work.
