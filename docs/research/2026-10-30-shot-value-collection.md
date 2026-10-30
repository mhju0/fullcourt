# Shot Value collection: access failure and replacement options

Investigated 2026-10-30 UTC against commit `ec5e17ca`. Research only: no application,
database, model, workflow, or production changes. Primary-source research and a separate
read-only review informed this report. Observations below are a dated snapshot.

## Finding

[Verified] The current collector fails while waiting for an NBA Stats HTTP response,
before it can inspect shot counts. There is no minimum-games or minimum-season-shots
publication gate. Empty provider data would be a distinct outcome (exit 3); the observed
collector outcome was a transport exception (exit 1). See
[fetch and retry](../../scripts/publish_current_shot_grid.py#L184),
[empty data handling](../../scripts/publish_current_shot_grid.py#L82), and
[coordinate validation](../../scripts/publish_current_shot_grid.py#L135).

[Inferred] Access/transport failure is the supported explanation for this reproduction.
Waiting for more games does not address that failure. [Unknown] Whether NBA Stats has
complete current-season shot rows, and whether the exact network cause is filtering,
throttling, routing, or another upstream condition: no usable response was obtained.
Do not describe this as proof that the NBA has not published shots or is globally down.

## Reproduction and controls

Executed from the repository root:

```bash
python3 scripts/publish_current_shot_grid.py --season 2026-27 --timeout 20 --output .local/shot-value-research-2026-10-30/current.json
```

[Verified] Both attempts ended in `TimeoutError: The read operation timed out`, exit 1;
no current artifact was created. The full captured log is under
`.local/shot-value-research-2026-10-30/collector-default-timeout.log`.

| Probe executed this session | Result |
| --- | --- |
| Actual current collector, 3-second timeout, two attempts | Read timeout; exit 1 |
| Current and prior season using collector request, 8 seconds each | Both read timeout |
| Prior season with default urllib headers, 10 seconds | Read timeout |
| Current season with maintained-client-style browser headers, 10 seconds | Read timeout |
| `https://stats.nba.com/` | HTTP 403 |
| NBA CDN live scoreboard | HTTP 403 |

[Verified] The latest publication run recorded `shotQuality: failed` while Shooting and
Officiating published: [run 40985414683](https://github.com/mhju0/fullcourt/actions/runs/40985414683).
The workflow does not retain the child exception; the wrapper captures diagnostics and
returns only the exit code ([wrapper](../../scripts/collect_daily_publications.py#L32)).
Consequently, the precise exception in that hosted run remains [Unknown]; the timeout
above is a local reproduction, not a recovered CI stack trace.

The maintained client [documents network/cloud-host restrictions](https://github.com/swar/nba_api#rate-limits-and-hosting).
In [issue 728](https://github.com/swar/nba_api/issues/728), a user reported 2026-27
timeouts and the maintainer said the same roster request worked from their environment.
That corroborates environment-dependent access; it does not establish ShotChartDetail
coverage. The current [endpoint implementation](https://github.com/swar/nba_api/blob/master/src/nba_api/stats/endpoints/shotchartdetail.py)
still uses the same host and endpoint. Switching Python wrappers alone is not a new source.

## Separate gap: daily publication does not produce model estimates

[Verified] The collector sets `gbm` and `baseline` to null for every cell
([producer](../../scripts/publish_current_shot_grid.py#L140)); the current artifact
validator requires those nulls ([schema](../../src/lib/shot-quality-publication.ts#L11)).
Successful collection restores the observed-attempt map, not the Expected eFG% or
model-difference surfaces. This is a separate pipeline limitation, not evidence of a
provider failure or insufficient sample size.

[Verified] The existing surface producer uses saved models, cell coordinates, the
cell's three-point attempt mix, and NBA zone labels
([surface computation](../../scripts/sq5_write_surface.py#L16)). Its zone baseline maps
`zone_basic||zone_range`; unknown labels fall back to the global rate
([baseline lookup](../../scripts/sq5_write_surface.py#L231)). Thus an alternate source
needs validated zone semantics as well as a coordinate conversion. A numeric surface
alone would not prove the model comparison is meaningful.

## Alternatives

| Option | Evidence obtained | Assessment |
| --- | --- | --- |
| ESPN per-game summary | Current-season coordinates returned for all 12 Oct 28 finals; root independently checked event 401909881 | Best direct candidate for validation; not ready for unqualified publication |
| hoopR/SportsDataverse releases | 2027 PBP and shot assets returned HTTP 200 on HEAD; current loader documentation includes 2027 examples | Convenient bulk candidate, but contents/completeness were not decoded or reconciled in this investigation; same ESPN lineage, not independent corroboration |
| NBA Stats on another permitted, demonstrably reachable runner | Maintainer reports environment-dependent access | Preserves existing fields/model compatibility if a real current-shot request succeeds; no new runner has been proven here |
| NBA PBP/CDN | Different feeds exist, but CDN returned 403 here | Not an established escape route; do not assume V3 and liveData coordinate contracts are interchangeable |
| Sportradar NBA PBP | Documented per-event coordinates and explicit court frame; authenticated feed | Stronger documented coordinate contract; current account access, coverage and price not tested |
| SportsDataIO NBA PBP | Dictionary documents coordinates and court offsets | Secondary paid candidate; current coverage, precision, package entitlement and price need confirmation |

ESPN sample source: [Oct 28 scoreboard](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261028)
and [MIA–ATL summary](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909881).
[Verified] A naive filter of `shootingPlay && pointsAttempted in {2,3}` produced 194
unique candidate plays for that game, but the same response's box scores total 192 FGA
(96 per team). Coordinates were usable on all 194 candidates; candidate makes matched
97 FGM. The two excess missed-shot candidates remain unexplained. Across the scout's
12-game sample, this filter produced 2,108 candidates versus 2,099 box-score FGA.
Coordinate presence therefore does not establish correct shot accounting.

SportsDataverse's own [coordinate investigation](https://js.sportsdataverse.org/docs/tutorials/nba-pbp-shots)
fits ESPN's frame from captured games: integer-foot coordinates, hoop near x=25 and
y=0–1, both teams on one basket, and invalid sentinels for free throws. This is a library
author's measured convention, not an ESPN contractual specification. The current
NBA model uses tenths-of-foot coordinates relative to the rim. Validate origin,
direction, precision, distance and zone boundaries before connecting the two.

hoopR evidence: [loader documentation](https://hoopr.sportsdataverse.org/reference/load_nba_pbp.html),
[PBP asset](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_pbp/play_by_play_2027.rds),
[shot asset](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_shots/shots_2027.rds).
Anonymous HEAD checks reported 1,272,212 and 246,143 bytes respectively. This is an
existence/access check only, not proof that all recent games are present.

Paid-feed primary references: Sportradar [NBA PBP](https://developer.sportradar.com/basketball/v7/reference/nba-play-by-play)
and [coordinate FAQ](https://developer.sportradar.com/basketball/v7/reference/nba-faq);
SportsDataIO [NBA dictionary](https://sportsdata.io/developers/data-dictionary/nba) and
[access methods](https://sportsdata.io/developers). Sportradar documents a full-court
inch-based frame and basket orientation, which requires a different transform.
SportsDataIO's general free trial supplies scrambled values, unsuitable for this
analysis. Public hobby pricing does not establish that a package includes NBA PBP
coordinates. No purchase or account change was made.

## Recommendation

1. Preserve sanitized operational reason codes such as transport timeout, HTTP denial,
   empty dataset, schema rejection and coverage mismatch. Keep prior good data; keep
   independent modules publishable. Child logs must not expose database credentials.
2. Validate ESPN/hoopR as a separate staged source. Decode the bulk data first; retain
   raw event IDs and provenance. Reconcile each game's team FGA, FGM, 3PA and 3PM,
   including overtime, cancellations/corrections and free throws. Resolve the observed
   excess events before publishing. An ESPN PBP-to-box-score match is internal
   consistency, not an independent NBA cross-check.
3. Verify full current-season game/date coverage and coordinate/zone compatibility.
   Keep provider identity and ID namespaces honest: the existing artifact schema is
   explicitly NBA Stats-only and cannot simply relabel ESPN data as NBA Stats.
   Publish observed attempts first only after these checks pass.
4. Separately prepare versioned inference using the existing approved models, explicit
   training-period metadata, trusted model artifacts, and complete model coverage.
   Validate zone mappings and count global-rate fallbacks. Do not retrain on early-season
   outcomes merely to fill the page. Both models must be valid before difference maps.
5. If the free-source reconciliation or spatial checks cannot be satisfied, evaluate an
   authenticated Sportradar sample against the same gates before committing to a plan.

This recommends a validation experiment, not an immediate provider switch. More games
will improve spatial density but will not repair transport access or add missing inference.

## Checks and limits

[Verified] `python3 -m unittest discover -s scripts/tests -p test_current_shot_grid.py`:
5 tests passed. Actual network reproductions and current ESPN sample checks are described
above. An independent read-only reviewer checked the source interpretation and highlighted
zone-baseline compatibility. No production DB reads/writes, workflow reruns, deployment,
new dependency, coefficient change, or model execution occurred.
