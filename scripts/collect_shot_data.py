"""
[Shot Quality Model, Phase SQ-2] Bulk shot data collector.

Resumable per-team-season collector for nba_api's ShotChartDetail. Caches raw
shot data LOCALLY under ml/data/shots/{season}/{team_abbr}.csv.gz -- never
writes to Postgres, never touches the DB at all. This is the "raw shots stay
local" half of the hybrid storage strategy in docs/SHOT_QUALITY_DESIGN.md
(SS3); a later phase aggregates these into a spatial grid for the DB.

Storage format note: pandas.DataFrame.to_parquet requires pyarrow or
fastparquet, and NEITHER is installed in the root venv (checked before
writing this script). Rather than silently installing a new dependency, this
collector falls back to gzip-compressed CSV (.csv.gz), which needs no extra
packages. Swap to parquet later if pyarrow/fastparquet get added.

Team-season pairs where the call succeeds but returns 0 rows (e.g. an
expansion-era gap for a franchise's current team_id) are treated as a valid
empty result, not a failure -- a placeholder (header-only) file is still
written so resumable runs don't keep re-querying a season a team didn't
play. Only call exceptions/timeouts and malformed column sets go to
_failures.log.

Run with the ROOT data-pipeline venv:
    ./venv/bin/python scripts/collect_shot_data.py --dry-run       # current season only, all 30 teams
    ./venv/bin/python scripts/collect_shot_data.py --season 2013-14
    ./venv/bin/python scripts/collect_shot_data.py                 # full 1996-97..2025-26 backfill
    ./venv/bin/python scripts/collect_shot_data.py --force         # re-pull and overwrite existing files
"""

import argparse
import gzip
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("collect_shot_data")

DELAY_SECONDS = 1.5
DATA_DIR = Path(__file__).resolve().parent.parent / "ml" / "data" / "shots"
PROGRESS_LOG = DATA_DIR / "_progress.log"
FAILURES_LOG = DATA_DIR / "_failures.log"
EMPTY_LOG = DATA_DIR / "_empty.log"

# Confirmed by SQ-0 (ml/shot_data_probe.txt): 1996-97 is the earliest season
# with usable non-zero LOC_X/LOC_Y; 1990-91 returns 0 rows / no LOC columns.
EARLIEST_SEASON_START_YEAR = 1996
# "current season" per the SQ-2 task scope -- update this when a new season starts.
CURRENT_SEASON_START_YEAR = 2025

# The 24 columns SQ-0 actually observed from a live pull (ml/shot_data_probe.txt §2).
EXPECTED_COLUMNS = {
    "GRID_TYPE", "GAME_ID", "GAME_EVENT_ID", "PLAYER_ID", "PLAYER_NAME",
    "TEAM_ID", "TEAM_NAME", "PERIOD", "MINUTES_REMAINING", "SECONDS_REMAINING",
    "EVENT_TYPE", "ACTION_TYPE", "SHOT_TYPE", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA",
    "SHOT_ZONE_RANGE", "SHOT_DISTANCE", "LOC_X", "LOC_Y", "SHOT_ATTEMPTED_FLAG",
    "SHOT_MADE_FLAG", "GAME_DATE", "HTM", "VTM",
}


def season_label(start_year):
    return f"{start_year}-{str(start_year + 1)[2:].zfill(2)}"


def all_seasons():
    return [season_label(y) for y in range(EARLIEST_SEASON_START_YEAR, CURRENT_SEASON_START_YEAR + 1)]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def log_progress(msg):
    print(msg)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_LOG, "a") as f:
        f.write(f"{now_iso()} {msg}\n")


def log_failure(season, team_abbr, error):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(FAILURES_LOG, "a") as f:
        f.write(f"{now_iso()}\t{season}\t{team_abbr}\t{error}\n")


def log_empty(season, team_id, team_abbr):
    """Record a confirmed-empty (200 + 0 rows on both the call and its retry) pair."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(EMPTY_LOG, "a") as f:
        f.write(f"{now_iso()}\t{season}\t{team_id}\t{team_abbr}\n")


def output_path(season, team_abbr):
    return DATA_DIR / season / f"{team_abbr}.csv.gz"


def already_collected(season, team_abbr):
    return output_path(season, team_abbr).exists()


def save_frame(df, season, team_abbr):
    path = output_path(season, team_abbr)
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", newline="") as f:
        df.to_csv(f, index=False)
    return path


def pull_team_season(shotchartdetail, team_id, season):
    resp = shotchartdetail.ShotChartDetail(
        team_id=team_id,
        player_id=0,
        season_nullable=season,
        season_type_all_star="Regular Season",
        context_measure_simple="FGA",
    )
    return resp.get_data_frames()[0]


def fetch_and_validate(shotchartdetail, team_id, team_abbr, season):
    """Pull one (season, team) frame and validate its columns.

    Returns (df, elapsed) on success. On a raised call exception or a malformed
    column set, logs to _failures.log + a FAIL progress line (unchanged error
    path) and returns (None, elapsed).
    """
    t0 = time.time()
    try:
        df = pull_team_season(shotchartdetail, team_id, season)
    except Exception as e:
        elapsed = time.time() - t0
        log_failure(season, team_abbr, f"call_exception: {e!r}")
        log_progress(f"FAIL  {season} {team_abbr} call raised {e!r} ({elapsed:.2f}s)")
        return None, elapsed

    elapsed = time.time() - t0
    cols = set(df.columns)
    if not EXPECTED_COLUMNS.issubset(cols):
        missing = sorted(EXPECTED_COLUMNS - cols)
        log_failure(season, team_abbr, f"malformed_columns: missing={missing}")
        log_progress(f"FAIL  {season} {team_abbr} malformed columns, missing={missing} ({elapsed:.2f}s)")
        return None, elapsed

    return df, elapsed


def process_pair(shotchartdetail, team_id, team_abbr, season):
    df, elapsed = fetch_and_validate(shotchartdetail, team_id, team_abbr, season)
    if df is None:
        return "failure"

    if len(df) > 0:
        path = save_frame(df, season, team_abbr)
        log_progress(f"{'OK':5s} {season} {team_abbr} rows={len(df)} -> {path} ({elapsed:.2f}s)")
        return "ok"

    # 200 + 0 rows: retry the SAME request ONCE (after the inter-call delay)
    # before trusting the empty result -- guards against a transient empty
    # response. Confirmed-empty only if the retry ALSO returns 0 rows.
    logger.info("empty response for %s %s; retrying once after %.1fs delay", season, team_abbr, DELAY_SECONDS)
    time.sleep(DELAY_SECONDS)
    df_retry, elapsed_retry = fetch_and_validate(shotchartdetail, team_id, team_abbr, season)
    if df_retry is None:
        return "failure"

    if len(df_retry) > 0:
        # Transient empty: the retry recovered real data -- save as a normal pull.
        path = save_frame(df_retry, season, team_abbr)
        log_progress(
            f"{'OK':5s} {season} {team_abbr} rows={len(df_retry)} -> {path} "
            f"(retry recovered after empty, {elapsed_retry:.2f}s)"
        )
        return "ok"

    # Confirmed empty: both the initial call and the retry returned 0 rows.
    # Keep the existing header-only placeholder AND record it in _empty.log.
    path = save_frame(df_retry, season, team_abbr)
    log_empty(season, team_id, team_abbr)
    log_progress(f"{'EMPTY':5s} {season} {team_abbr} rows=0 -> {path} (confirmed after retry, {elapsed_retry:.2f}s)")
    return "empty"


def build_team_list():
    from nba_api.stats.static import teams
    return sorted(teams.get_teams(), key=lambda t: t["abbreviation"])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="current season only (2025-26), all 30 teams")
    parser.add_argument("--force", action="store_true", help="re-pull and overwrite existing files")
    parser.add_argument("--season", help="limit to a single season label, e.g. 2013-14")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    try:
        from nba_api.stats.endpoints import shotchartdetail
    except Exception as e:
        print(f"FATAL: could not import nba_api.stats.endpoints.shotchartdetail: {e!r}")
        sys.exit(1)

    team_list = build_team_list()

    if args.dry_run:
        seasons = [season_label(CURRENT_SEASON_START_YEAR)]
    elif args.season:
        seasons = [args.season]
    else:
        seasons = all_seasons()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    log_progress(
        f"=== run start: seasons={seasons[0]}..{seasons[-1]} ({len(seasons)} season(s)) "
        f"x {len(team_list)} teams, force={args.force} ==="
    )

    run_t0 = time.time()
    counts = {"ok": 0, "empty": 0, "failure": 0, "skipped": 0}
    total_pairs = len(seasons) * len(team_list)
    done = 0

    for season in seasons:
        for team in team_list:
            done += 1
            team_abbr = team["abbreviation"]
            if not args.force and already_collected(season, team_abbr):
                counts["skipped"] += 1
                log_progress(f"SKIP  {season} {team_abbr} already collected ({done}/{total_pairs})")
                continue

            result = process_pair(shotchartdetail, team["id"], team_abbr, season)
            counts[result] += 1
            time.sleep(DELAY_SECONDS)

    elapsed = time.time() - run_t0
    log_progress(
        f"=== run complete: ok={counts['ok']} empty={counts['empty']} "
        f"failure={counts['failure']} skipped={counts['skipped']} "
        f"elapsed={elapsed:.1f}s ==="
    )
    print(f"\nDone. See {PROGRESS_LOG} and {FAILURES_LOG} for details.")


if __name__ == "__main__":
    main()
