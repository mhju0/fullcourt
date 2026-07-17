# FullCourt — full schedule & date audit (all 40 seasons)

**Date:** 2026-07-12
**Oracle:** Basketball-Reference monthly schedule pages (`NBA_<year>_games-<month>.html`),
cross-checked against ESPN for the flagged games. B-Ref reachable only from the dev
machine (residential IP); it 403s from datacenter IPs.
**Method:** per-season diff of DB vs B-Ref. Primary signal = per-date game **count**
(team-agnostic, immune to 40 years of franchise-code churn). Backstop = full game-set
comparison (date + normalized matchup) → classifies SHIFTED / MISSING / EXTRA.
**Coverage:** 40 seasons (1985-86 → 2025-26, no 2019-20 bubble), 340 B-Ref month-pages,
0 fetch failures. All game types (regular + playoffs + finals + play-in).

## Headline

- **37 seasons (1985-86 → 2022-23): byte-perfect** vs B-Ref — every date and every
  matchup, including all playoffs, finals, both lockout seasons (1998-99, 2011-12) and
  the 2020-21 COVID calendar. The nba_api historical seed is completely correct.
- **All real problems are confined to the two most recent, CDN-ingested seasons.**
- **The audit found 2 actual date errors** — both 2025-26, both the known UTC-vs-ET
  +1-day shift, both missed by the prior April-only repair. They were corrected after this
  comparison; see Resolution below.

## Findings

### 2025-26 — 2 date shifts (UTC-bug residue) [repaired]
Confirmed by **both** B-Ref and ESPN:

| Matchup | Stored (wrong) | Correct | Note |
|---|---|---|---|
| `DAL@DET` | 2025-11-02 | **2025-11-01** | night tip stored as next-day UTC |
| `SAS@OKC` | 2025-12-14 | **2025-12-13** | NBA Cup semifinal (low-game day) |

2025-26 regular season is otherwise **complete** (1230/1230). The April 2026 finale
repair from the prior session holds (B-Ref independently confirms Apr 12 = 15, Apr 13 = 0).

### 2024-25 — 5 missing regular-season games [repaired]
Regular season = **1225**, five short of 1230. All genuinely absent (not shifted, not
home/away-swapped):

| Matchup | Date | Kind |
|---|---|---|
| `MIA@WAS` | 2024-11-02 | ordinary |
| `ATL@MIL` | 2024-12-14 | NBA Cup **semifinal** (counts toward record) |
| `HOU@OKC` | 2024-12-14 | NBA Cup **semifinal** (counts toward record) |
| `SAS@IND` | 2025-01-23 | ordinary (DB has 0 SAS/IND games all season) |
| `IND@SAS` | 2025-01-25 | ordinary |

Sourcing constraint for repair: B-Ref supplies date, teams, final score, and OT, but
**not** the stats.nba `002…` game id our `external_id` convention requires. nba_api
(stats.nba.com) is unreachable from Seoul; it may be reachable from CI (US IP).

### Expected exclusions — NOT errors (3 IST/NBA-Cup finals)
The In-Season Tournament **championship** is played at a neutral site (T-Mobile Arena,
Las Vegas) and does **not** count toward the 82-game record, so nba_api correctly omits
it. Our DB is right to lack these:

| Matchup | Date | Season |
|---|---|---|
| `IND@LAL` | 2023-12-09 | 2023-24 |
| `MIL@OKC` | 2024-12-17 | 2024-25 |
| `SAS@NYK` | 2025-12-16 | 2025-26 |

## Root cause

Both problem seasons (2024-25, 2025-26) passed through the CDN "current-season" ingest
(`fetch_nba_schedule_cdn.py`) — the path that had the UTC date bug (now fixed) and, for
2024-25, apparently never captured 5 games (the 2 neutral-site Cup semifinals + 3
others, likely rescheduled after the last sync). The nba_api historical seed
(`fetch_schedule.py`) that produced 1985-86 → 2023-24 is complete and correctly dated.

## Resolution (completed 2026-07-12)

1. The two 2025-26 rows were updated to the independently confirmed ET dates.
2. The five missing 2024-25 games were inserted with documented `bref-…` synthetic IDs because
   the NBA stats IDs were not retrievable from the available network location.
3. Affected fatigue scores and predictions were recomputed. The resulting database inventory and
   tag-integrity verification are recorded in `docs/DATABASE.md`.
