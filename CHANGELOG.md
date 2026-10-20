# Release history

## 1.0.12 — 2026-10-20

- Keep season labels, "5+ points" and win/game counts whole at phone widths on Season
  Report, Availability, the board guide and Home Court; reword the chart's key help.
- Refresh browser specs that expected an empty Shooting default to have players, copy
  replaced in v1.0.6 and later, or classic scrollbars. No published figure changes.

## 1.0.11 — 2026-10-20

- Read Season Report's other-seasons rested-home rate beside those seasons' home win rate,
  and state Schedule Edge method tiles in points against the home baseline.
- Rename workload columns to MILEAGE and TIME ZONES, show playoff sweeps as "swept 4–0",
  label the zero-rest GAMES column as a season total, and count the referee foul-share
  table's own chance cells. No published figure changes.

## 1.0.10 — 2026-10-20

- Count the social card's backtest seasons from the measured sample, not the season list
  that adds the upcoming season on 1 October.
- Correct stale and misleading copy: missed playoff picks, the non-model entry-rest column,
  the Availability trend's first season, overtime coverage, methods history, Data Status
  scope, the ALT legend and the board's ET check time.
- Correct post-v1.0.9 repository documentation and refresh the Availability input hash;
  no published figure changes.

## 1.0.9 — 2026-10-20

- Reject stale or failed local research exports before dependent analyses; bind successful
  inputs to the complete arena dependency closure and exact player/team cache inventory.
- Preserve prior research outputs and audit receipts while validating current intermediates
  against the accepted arena correction, without refitting or changing publications.

## 1.0.8 — 2026-10-20

- Resolve historical arena moves and individually sourced alternate homes while preserving
  arena-to-arena Mileage, ratified coefficients and graded prediction history.
- Include all five canonical shooting aliases; correct Data Status coverage, referee
  source dates, the L2M canonical link and two historical conference metadata cells.
- Make prediction verification preservation-aware and the legacy reset command report-only.
- Render methods-page ablation rates from generated facts and fix team-logo fallback
  text contrast while preserving official fills.
- Recalculate dependent publications from the reviewed local correction; production
  application uses the owner-approved manifest and retains exact before/after evidence.

## 1.0.7 — 2026-10-20

- Confirm the remaining historical overtime source gap with retained NBA box scores
  and reviewed supporting records; correct 346 game inputs while preserving exact
  multi-overtime counts and earlier fixture corrections.
- Recalculate fatigue and dependent win-rate, schedule and methodology publications
  with the existing coefficients. Preserve resolved predictions and playoff records.
- Clarify that the playoff coefficient table is a separate regularized interpretation
  fit, while displayed series probabilities use unregularized fits.

## 1.0.6 — 2026-10-20

- Restore the homepage large-rest-gap comparison to all eligible completed regular
  seasons, with the home baseline, sample counts and period covering the same history.
- Audit every Behind the Data topic and the referee archive; correct stale coverage,
  cohort, travel, evaluation, uncertainty and formula descriptions against current producers.

## 1.0.5 — 2026-10-20

- Use an unpipelined node-postgres application pool for Supabase transaction pooling,
  avoiding the session-client limit across concurrent Vercel workers.
- Preserve atomic refresh/status writes, transaction-local timeouts and API row shapes;
  recover the pool after failed transaction starts and interrupted connections.
- Support CA-verified database TLS through `DATABASE_SSL_CA` and document the required
  serverless transaction-pool connection settings.

## 1.0.4 — 2026-10-20

- Calculate Player Shooting rest and workload from confirmed competitive appearances
  before selecting regular-season shooting results, including played zero-shot games.
- Add source-evidenced Cup appearances and historical game-ID aliases; keep the raw
  shooting outcome cohort, comparison thresholds and career estimation protocol.
- Restore five omitted regular fixtures to Availability's source joins and guard
  against silently shortened team/player history windows.
- Distinguish unknown participation from absence and unknown minutes from zero;
  withhold only affected comparisons and publish source-coverage metadata.
- Carry exact integer shooting numerators into season/career displays to prevent
  intermediate-rounding disagreements, retaining legacy payload compatibility.
- Correct one primary-confirmed historical player team assignment without changing
  shot totals or the stored game score.
- Regenerate the player/career and Availability studies together, with clearer
  methodology describing their different history scopes. Annual absence rates retain
  missing-season gaps and sample counts, without an unsupported league-wide trend claim.


## 1.0.3 — 2026-10-20

- Correct current home/away streak resets and use actual arena endpoints for
  alternate homes, temporary venues and accepted historical exceptions.
- Backfill confirmed overtime, neutral-site and postseason metadata corrections,
  plus revised upcoming tip times, through a controlled all-season recalculation.
- Restore missing Cup-final/play-in workload context and the bounded 2020 restart’s
  campus geography while preserving regular-season publication rules.
- Refresh analysis caches when underlying fatigue or venue inputs change.
- Correct known Japan, date-line and historical daylight-saving inputs while
  retaining ratified fatigue coefficients.
- Regenerate affected win-rate evidence and dependent analytics together; keep
  resolved historical prediction records intact.
- Correct stale playoff inputs under a new data revision, preserving previous model outputs.
- Deliver a guarded maintenance cutover, full-domain change checks and tested conditional rollback.

Released in PR #182 at `0f30d34594e7abb50e9881fff25315ab6208f1a2`. The exact
Vercel deployment `dpl_AB8Fc1sBfoHNptroC9Z8jDW6kM8c` is verified on fullcourt.fyi;
12 API checks match the corrected local data, and scheduled writers are restored.

## 1.0.2 — 2026-10-19

- Home-court history uses direct hover, tap and keyboard season inspection, with the
  large-gap toggle retained and the duplicate season dropdown removed.
- Model Results adds a game-weighted five-season home win-rate average beside annual
  results, replacing the flat historical-average line and its confusing caption.
- Playoff series lead with the historical model pick; the fit using known results is
  available inside details with its retrospective limits explained.
- Season Report adds a league-centered color key and plain labels to team home/rest
  gaps. Team differences are calculated from wins and games before rounding.

## 1.0.1 — 2026-10-19

Player Shooting now opens the current season and shows “Awaiting results” when
that edition is unavailable. It no longer automatically displays the previous
season’s player table beneath a current-season notice. Earlier publications remain
available through the season selector and previous-results link. Current-season
readiness and pooled-career safeguards remain in place.

## 1.0.0 — 2026-10-19

FullCourt officially released on October 19, 2026, by owner decision. This is the
baseline for subsequent versioned releases at https://fullcourt.fyi.

The release includes Games, Season Report, Schedule Edge, Home-court history,
Player Shooting by Rest, Expected Shot Value, Playoff Rest, Availability Cost,
Officiating, and source/methodology pages. It includes the recent-ten-season
homepage comparison, optional large-rest-gap history, and publication-aware
season-data guides.

The product baseline is production commit `114617dc91927382c804a40aff0a54d81461476a`
(PRs #177 and #178). The `v1.0.0` tag identifies that baseline plus its version and
release records. Release designation does not close outstanding operational
checks: first completed-slate verification, physical-device testing, new-season
source publication, canonical game-ID reconciliation, or later schedule additions.

## Versioning from this release

For each subsequent production release, increment `package.json` and add a dated
entry here. Use patch versions for fixes, minor versions for backward-compatible
features, and major versions for breaking changes. Create a matching immutable
`vX.Y.Z` Git tag and GitHub release on the verified release commit. Never move a
published version tag to include later work.
