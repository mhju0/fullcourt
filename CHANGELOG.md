# Release history

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
