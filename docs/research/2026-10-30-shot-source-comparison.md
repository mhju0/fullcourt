# Current-season shot-source comparison

Measured 2026-10-30 UTC against FullCourt `ec5e17ca`. This follows the
[collection diagnosis](2026-10-30-shot-value-collection.md). No ingestion, model,
database or provider configuration was changed. Raw downloads, hashes, a reproducible
`compare.py`, `comparison.json`, and `team-games.csv` are retained locally under
`.local/shot-source-comparison-2026-10-30/` in the primary checkout.

## Recommendation

Use hoopR's full ESPN play-by-play as the first bulk-source validation candidate,
with direct ESPN summaries for recent-game/correction checks. Do not adopt the compact
shots artifact alone, and do not switch production yet. This is a convenience and
coverage recommendation, not evidence that hoopR improves ESPN's source accuracy.

The release artifacts are accessible and contain current games, but share ESPN's
accounting differences. Event identity, two/three-point type, heave treatment, coordinate
conversion, NBA zones and full season coverage must be validated before publication.
If those requirements cannot be satisfied, test a documented authenticated provider
such as Sportradar rather than forcing this source to fit existing totals.

## Measured comparison

| Dimension | Direct ESPN summary | hoopR full PBP | hoopR compact shots | NBA Stats / paid feeds |
| --- | --- | --- | --- | --- |
| Actual current sample | Oct 28: 12 finals, 24 team-games | 68 games, Oct 20–28; 34,860 events | Same 68 games; 15,647 rows including free throws | NBA Stats timed out; paid data not accessed |
| Field-goal candidates on Oct 28 | 2,108 | 2,108; no sampled event differences | Matches PBP shooting-row projection in all 12 games | No same-game comparison possible |
| Observed makes / three-point makes | 952 / 302 | 952 / 302 | Same underlying shooting events | Unverified |
| Event IDs and detailed context | Available | Available | Missing event ID, points attempted, game date, season type and event text | NBA Stats has the required contract when reachable; paid fields need sample verification |
| Coordinates | Integer feet in sampled raw fields | Preserves raw coordinates plus transformed coordinates | Useful for plotting; insufficient alone for missed-shot 2/3 attribution | Existing NBA model uses a different origin/precision; paid feeds have their own frames |
| Best role | Latest game and correction checks | Bulk historical/current ingestion candidate | Derived visualization input after a validated PBP join | Preserve NBA compatibility if reachable; paid sample is fallback |

[Verified] The decoded hoopR PBP and shots assets have exactly the same game-ID set.
The PBP has 12,164 naive field-goal candidates across those 68 games. All have finite,
nonsentinel raw coordinate pairs; their raw x range is 0–50 feet and y range is −5–88.
Zero missing coordinates does not establish correct event accounting or spatial accuracy.

[Verified] Successfully read ESPN scoreboards supplied 55 completed game IDs, all present
in both artifacts. October 26 and 27 scoreboard requests returned empty/non-JSON bodies;
13 artifact games were consequently not independently checked against a readable slate.
Thus this investigation does not establish complete current-season coverage or a
freshness SLA. The same dates failing here also appeared in the failed daily workflow.

## Why the shot totals differ

| Oct 28, all 12 games | FGA | FGM | 3PA | 3PM |
| --- | ---: | ---: | ---: | ---: |
| ESPN displayed team box scores | 2,099 | 952 | 873 | 302 |
| ESPN naive PBP field-goal filter | 2,108 | 952 | 883 | 302 |
| hoopR PBP, same filter | 2,108 | 952 | 883 | 302 |
| Diagnostic only: omit type 282 heaves | 2,098 | 952 | 873 | 302 |

[Verified] All ten additional three-point candidates are missed events classified as
ESPN type 282, `Heave Jump Shot`. They are retained in hoopR. Omitting them makes all
four metrics match the ESPN team box scores for 23 of 24 team-games, but Milwaukee
still has 92 PBP attempts versus 93 box-score attempts. The remaining discrepancy
concerns a two-point attempt; its cause is [Unknown]. This is not a clean dataset.

NBA's [heave explanation](https://www.nba.com/news/nba-heaves-rule-change-early-results)
says qualifying missed heaves remain in team statistics while being excluded from
player statistics. Do not delete heaves merely to match ESPN's displayed team aggregate.
Matching two ESPN representations is internal consistency, not independent NBA validation.
The exact period/clock/distance attribution rule was not adjudicated here.

Example: [MIA–ATL, event 401909881](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909881)
has 194 distinct PBP candidates and 192 displayed box-score attempts. Two candidates
are missed heaves. Root independently checked the raw response; the source-comparison
worker compared all 12 games, and a separate reviewer checked the heave interpretation.

## Coordinate compatibility

[Verified] hoopR's processed full-court coordinates are a transform of raw ESPN fields,
not independent measurements. All 12,164 field-goal candidates obeyed the inspected
home/away transform. Use documented raw fields when comparing providers; do not feed
processed full-court x/y directly into FullCourt's rim-relative grid.

[Verified] A bounded historical overlap matched all 173 attempts from NYK–BOS on
2024-10-22 between the local NBA raw cache (`0022400061`) and
[ESPN event 401704627](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401704627),
using normalized player name, period, clock and made flag. The diagnostic transform
showed average coordinate differences of about +0.05 feet across court and −0.71 feet
upcourt, with nonzero shot-level variation. This is evidence of an origin/precision
difference, not a validated conversion formula. Name/clock matching is not a production
event-ID join; one historical game does not validate 2026-27 coordinates.

[Verified] The existing comparison baseline needs NBA `zone_basic||zone_range` labels;
unknown labels fall back to an overall mean
([lookup](../../scripts/sq5_write_surface.py#L231)). A source switch requires validated
zone mapping and fallback counts in addition to coordinates. Existing daily artifacts
also prohibit nonnull model values, so model publication remains a separate change.

## Adoption gates

1. Resolve the Milwaukee attempt discrepancy and document team/player heave scope;
   corroborate representative games against an independent NBA record when accessible.
2. Reconcile game/team/player attempts, makes and three-point counts without discarding
   valid events to force a match. Include corrections, duplicates, free throws and overtime.
3. Verify every completed game/date against a reliable slate; retain last good data when
   a slate or event feed is unreadable. Current bulk existence is not proof of completeness.
4. Validate rim origin, orientation, units, precision, clipping and zone boundaries on
   an overlap sample. Retain actual source identity and ESPN IDs.
5. Publish raw attempts only after those gates pass, then validate the existing model's
   inference and both complete surfaces separately. Do not refit merely to fill a chart.

Primary references: [hoopR PBP loader](https://hoopr.sportsdataverse.org/reference/load_nba_pbp.html),
[PBP release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_pbp),
[shots release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_shots),
[SportsDataverse coordinate investigation](https://js.sportsdataverse.org/docs/tutorials/nba-pbp-shots),
[Sportradar NBA coordinates](https://developer.sportradar.com/basketball/v7/reference/nba-faq).
Paid-provider coverage, price and account access remain untested. Full-season parity,
current NBA spatial equivalence and publication readiness remain unverified.
