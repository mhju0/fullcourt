# Per-game shooting data comes from hoopR, not Basketball-Reference or stats.nba.com

Status: accepted (2026-07-28)

The Shooting by Rest module needs one thing this repo does not have: each team's shooting line
for each individual game. Three sources could supply it. We ingest from **hoopR**
(`sportsdataverse/sportsdataverse-data` GitHub releases), cross-check a sample against **ESPN**,
and use **Basketball-Reference** only by hand, never in a pipeline.

## Why not stats.nba.com

It does not answer. Measured 2026-07-28 from the development machine:
`https://stats.nba.com/stats/leaguedashteamshotlocations` → **HTTP 000 after 18.0s**. This
matches the finding recorded in `docs/audit/` for the Shot Quality module and the reason its raw
cache can no longer be rebuilt. `cdn.nba.com` returns 403. Anything that requires a live fetch
from the NBA's own stats host is not buildable here.

This is also why the obvious page — `nba.com/stats/teams/shooting` — is not an option. It is a
front end for that host.

## Why not Basketball-Reference

Technically it is the best source of the three. `/boxscores/{id}.html` serves `efg_pct` and
`ts_pct` already computed, back to 1996-97, and `/boxscores/shot-chart/{id}.html` carries every
attempt with its distance in feet. Both paths are robots-allowed. An independent parse of
NYK@BOS 2024-10-22 reconciled exactly against the box score on both teams.

It is ruled out on terms and load, not capability. From the Terms of Use §5, read directly:

- **§5(i)** prohibits, *"without our express written permission,"* using automated means
  *"in a manner that adversely impacts site performance or access."* Their Bot Traffic page sets
  that line at **twenty requests per minute**, block up to a day. A full backfill at their
  `Crawl-delay: 3` is exactly 20/min sustained for roughly **51 hours** — sitting on the stated
  limit for two days, which is the behaviour the clause exists to stop.
- **§5(i)(ii)** prohibits using their Content to create *"any database, archive, or other data
  store that competes with or constitutes a material substitute"* for what the Site offers. A
  70,000-row per-game shooting store is arguably that. Arguably is enough to decline.
- **§5(j)** prohibits using their Content for *"training, fine-tuning, prompting, or instructing
  artificial intelligence models."* This repo is developed with an AI assistant, so any pipeline
  reading Basketball-Reference would sit inside that clause by construction.

Their own explanation for having no API is worth recording, because it says the restrictions are
contractual rather than discretionary: *"Most of our data comes from third parties who sell the
data to us. As part of our agreements with them we can not provide the data available as a
download on our site."*

Note the counterweight, since it is easy to over-read the above. §5 **welcomes** reuse:
*"sharing, using, modifying, repackaging, or publishing data found on individual SRL webpages is
welcomed, whether for commercial or non-commercial purposes,"* provided it *"explicitly credit[s]
SRL as the source... to the maximum extent possible."* Reading a box score in a browser to check
a number is ordinary use. That is the role Basketball-Reference keeps here, and any figure of
theirs quoted in these docs is credited.

## Why hoopR

`sportsdataverse/sportsdataverse-data` publishes NBA datasets as static release assets on
GitHub's CDN. MIT licensed, no auth, no key, no rate limit, no terms question.

Verified rather than assumed, 2026-07-28:

- `team_boxscores_2024.csv` → **HTTP 200, 306,801 bytes**. 2,628 rows = 1,314 games × 2 sides.
  Carries `field_goals_made/attempted`, `three_pointers_made/attempted`,
  `free_throws_made/attempted`, `points` — everything eFG% and TS% require.
- Every season file **1996 through 2025** returns 200, for both `nba_stats_team_boxscores` and
  `nba_stats_shots`.
- **The join is exact.** Its `game_id` is the 10-digit zero-padded stats `GAME_ID`, which is
  precisely `games.external_id`. Of 1,230 hoopR regular-season ids for 2024-25, **1,225 matched**,
  and the 5 that did not are exactly the 5 documented `bref-…` synthetic-id backfills
  (`bref-202411020WAS`, `bref-202412140MIL`, `bref-202412140OKC`, `bref-202501230IND`,
  `bref-202501250SAS`). Every matched game has `fatigue_scores` rows. So it is 100% of the games
  that carry a stats id at all.
- Internal consistency: across all 2,628 team-games of 2024, its per-shot rows summed to its own
  box scores at **100.00% exact** on FGA, FGM and 3PA — min and max difference both zero.
- External agreement: on NYK@BOS 2024-10-22 it reproduced Basketball-Reference's box totals and
  all five distance buckets identically for BOS, and differed by **one shot** at the 3ft boundary
  for NYK — a provider rounding difference, not a defect.

`nba_stats_shots` also carries per-shot distance in feet, so the later distance-bucket and
player-level phases need no new integration.

## Consequences

**We depend on a mirror.** If sportsdataverse stops publishing, the ingest stops. The mitigation
is that the files are static and cached locally, so an outage costs future seasons rather than
existing data.

**hoopR is not an independent witness.** hoopR, pbpstats and shufinskiy are all proxies of
stats.nba.com. One upstream error propagates to all three identically. Only Basketball-Reference
and ESPN observe independently, which is the entire reason ESPN is retained as a cross-check
rather than dropped as redundant. A sample of games is asserted equal across hoopR and ESPN
before the numbers are trusted.

**Distance data is gated at 2000-01, on all sources.** Shot charts for 1996-97 through 1999-00
return HTTP 200 with well-formed markup while containing only **37–81%** of attempts, with
nothing on the page saying so. Measured coverage ratios: 0.373, 0.614, 0.765, 0.814 for those
seasons against 0.993–1.000 from 2000-01 on. This is an upstream property, so it applies to hoopR
as much as to Basketball-Reference. Any pipeline that treats HTTP 200 as coverage will produce
plausible, wrong distance splits for four seasons. Two defences: hard-gate distance work at
2000-01, and assert `shots_parsed / box_FGA >= 0.98` per game regardless.

**Box scores are not affected by that gate.** The degradation is in shot-level rows. Team
box-score totals are complete back to 1996-97, which is why the team-level phase covers all 30
seasons while the distance phase does not.

## Considered and rejected

**pbpstats** (`api.pbpstats.com`) is reachable and serves pre-computed zone buckets — one call
returns 82 per-game rows per team with AtRim / ShortMidRange / LongMidRange / Corner3 / Arc3.
That is attractive for the distance phase and worth revisiting then. Rejected as the primary
source because it is per-team-per-season HTTP calls rather than static files, and it is the same
stats.nba.com upstream, so it adds a live dependency without adding independence.

**ESPN as primary.** It reaches further back (box scores to 1993-94) and is genuinely
independent. Rejected as primary because it is undocumented with no published terms, requires one
request per game rather than one file per season, and sets `cache-control: max-age=1`. It is more
valuable as the thing we check hoopR against.

**balldontlie** requires an API key (401 without one). Not evaluated further once hoopR verified.
