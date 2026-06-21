"""Fetch NBA PLAYOFF (and Finals) game schedules and insert into the games table.

This is the **separate, isolated** playoff ingestion path described in
``docs/PLAYOFF_PREDICTOR_DESIGN.md`` (§4.3). It is the per-game substrate for the
Playoff Predictor; it does NOT build models, series tables, or new schema. Playoff
games live in the existing ``games`` table tagged ``game_type`` = ``playoffs`` /
``finals`` and are excluded from every regular-season read query.

What this script does (and only this):
  * Calls nba_api ``LeagueGameFinder`` with ``league_id="00"`` and
    ``season_type_nullable="Playoffs"`` for each in-scope season.
  * Reuses ``fetch_schedule.py``'s pairing logic (``_pair_games_dataframe``),
    ``ABBR_ALIASES`` normalization, ``get_game_type`` tagging, and the
    ``INSERT ... ON CONFLICT (external_id) DO UPDATE`` upsert. Nothing is
    duplicate-and-diverged — the shared code is imported.
  * Keeps ONLY ``004``-prefixed stats GAME_IDs via ``is_playoff_game_id``
    (the playoff analogue of ``is_regular_season_game_id``).

Seasons: 1985-86 through the current season, EXCLUDING 2019-20 (the COVID Orlando
bubble — mirrors ``fetch_schedule.py``'s skip). 2020-21 is included. The season list
is imported from ``fetch_schedule.SEASONS`` so the two paths never drift.

DATE CONVENTION (critical):
  This historical backfill uses the nba_api ET ``GAME_DATE`` exactly like
  ``fetch_schedule.py`` — NOT the CDN/UTC path. First-round entry-rest later subtracts
  a playoff Game-1 date from a regular-season game date, and both sides must share the
  ET basis or the day count is off by one.

PLAY-IN (deferred — REQUIRED follow-on):
  Play-in tournament games (2020-21+) are NOT ingested here. They are a distinct
  season type with a different GAME_ID prefix, so the ``004`` gate naturally drops any
  that leak into the Playoffs query. Play-in games are NOT series and must NOT become
  series targets, but a team that entered the playoffs via the play-in has its
  "previous game" = its last play-in game. Therefore **ingesting play-in games as
  per-game rows is a required separate task before first-round entry-rest is correct
  for 2020-21+**. See ``docs/PLAYOFF_PREDICTOR_DESIGN.md`` §3.1 (play-in handling) and
  §7 (open question on play-in tagging).

HARD ISOLATION GUARANTEES:
  * Only ``004`` external_ids are ever upserted; a ``002`` (regular-season) row can
    never be written or mutated here (the ``002`` vs ``004`` id namespace is disjoint).
  * Regular-season ``fetch_schedule.py`` behavior is unchanged (this script never sets
    ``SEASON_TYPES`` or touches ``is_regular_season_game_id``).

Usage:
  python scripts/fetch_playoffs.py                     # all in-scope seasons (slow)
  python scripts/fetch_playoffs.py --season 2023-24    # one season
  python scripts/fetch_playoffs.py --dry-run           # parse + pair + tag, no writes
  python scripts/fetch_playoffs.py --dry-run --season 2023-24

DATABASE_URL is required even for --dry-run, because pairing needs the team
abbreviation → id map loaded from the DB (the dry-run connection is read-only and
performs no writes). Resolution order: process env, else repo-root .env.local, else
scripts/.env (mirrors daily_update.py).

Set NBA_SEED_SKIP_OT=1 to skip per-game BoxScore overtime lookups (much faster).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)


def resolve_database_url() -> str:
    """
    Prefer DATABASE_URL from the process environment; else load repo-root .env.local
    then scripts/.env and read again (mirrors daily_update.resolve_database_url).
    """
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    from dotenv import load_dotenv  # lazy: only the local .env fallback needs it

    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        print(
            "ERROR: DATABASE_URL is not set. "
            "Set it in the environment or add it to .env.local / scripts/.env. "
            "It is required even for --dry-run (pairing needs the team id map).",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


# Resolve DATABASE_URL BEFORE importing fetch_schedule: that module reads DATABASE_URL
# at import time and sys.exit()s if it is unset. Push the resolved value into the env so
# the import-time check there passes (it reads the process env first). This also adds the
# .env.local fallback that fetch_schedule's own import-time loader does not check.
DATABASE_URL = resolve_database_url()
os.environ["DATABASE_URL"] = DATABASE_URL

import psycopg2  # noqa: E402  (after DATABASE_URL resolution)

from fetch_schedule import (  # noqa: E402  (after DATABASE_URL resolution)
    SEASONS,
    _pair_games_dataframe,
    fetch_games_df,
    load_team_id_map,
    normalize_stats_game_id,
    upsert_game_records,
)

API_DELAY_SECONDS = 1
PLAYOFF_SEASON_TYPE = "Playoffs"


def is_playoff_game_id(game_id: object) -> bool:
    """Playoff (incl. Finals) games use a 004 prefix in NBA stats GAME_ID.

    Mirrors fetch_schedule.is_regular_season_game_id (the 002 gate). Play-in games use a
    different prefix and are intentionally NOT matched here (see module docstring).
    """
    gid = normalize_stats_game_id(game_id)
    return len(gid) >= 3 and gid.startswith("004")


def pair_playoff_games(
    df,
    season: str,
    team_map: dict[str, int],
    *,
    force_skip_ot: bool | None = None,
) -> list[tuple]:
    """Reuse fetch_schedule's pairing, but gated to 004 (playoff/finals) GAME_IDs.

    game_type is tagged by the existing get_game_type (004 + month >= 6 -> finals, else
    playoffs). Season is forced to the queried label (single-season Playoffs query),
    matching fetch_schedule.pair_games.
    """
    return _pair_games_dataframe(
        df,
        team_map,
        lambda _home: season,
        force_skip_ot=force_skip_ot,
        id_filter=is_playoff_game_id,
        id_filter_label="004",
    )


def resolve_seasons(requested: str | None) -> list[str]:
    """Return the season list to process (all in-scope, or one validated --season)."""
    if requested is None:
        return list(SEASONS)
    if requested not in SEASONS:
        in_range = f"{SEASONS[0]} … {SEASONS[-1]}"
        sys.exit(
            f"ERROR: season '{requested}' is not in scope. "
            f"Expected one of the in-scope labels ({in_range}, 2019-20 excluded)."
        )
    return [requested]


def summarize(records: list[tuple]) -> tuple[int, int]:
    """(playoff_games, finals_games) from paired records (game_type is index 9)."""
    finals = sum(1 for r in records if r[9] == "finals")
    playoffs = sum(1 for r in records if r[9] == "playoffs")
    return playoffs, finals


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest NBA playoff/finals games (004-prefixed) into the games table."
    )
    parser.add_argument(
        "--season",
        metavar="YYYY-YY",
        help="Process a single in-scope season (e.g. 2023-24). Default: all in-scope.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse + pair + tag and print a report, but perform NO database writes.",
    )
    args = parser.parse_args()

    seasons = resolve_seasons(args.season)
    dry_run = args.dry_run

    conn = psycopg2.connect(DATABASE_URL)
    try:
        team_map = load_team_id_map(conn)
        print(f"Loaded {len(team_map)} teams from DB.")
        print(
            f"Mode: {'DRY-RUN (no writes)' if dry_run else 'WRITE (upsert 004 rows)'} | "
            f"season type: {PLAYOFF_SEASON_TYPE} | seasons: {len(seasons)}\n"
        )

        total_playoffs = 0
        total_finals = 0
        total_upserts = 0
        processed: list[str] = []
        per_season: dict[str, int] = {}

        for season in seasons:
            print(f"── Season {season} (Playoffs) ──────────────────────")

            df = fetch_games_df(season, PLAYOFF_SEASON_TYPE)
            time.sleep(API_DELAY_SECONDS)

            # Dry-run forces OT skip (no per-game BoxScore network calls); a real run
            # respects NBA_SEED_SKIP_OT (read inside _pair_games_dataframe).
            records = pair_playoff_games(
                df, season, team_map, force_skip_ot=True if dry_run else None
            )

            # Belt-and-suspenders: every paired row MUST be a 004 playoff/finals row.
            # This guarantees we never touch a regular-season (002) row.
            bad = [r for r in records if not is_playoff_game_id(r[0])]
            if bad:
                sys.exit(
                    f"FATAL: {len(bad)} non-004 row(s) slipped through the playoff gate "
                    f"for {season}; refusing to write. First: {bad[0][0]}"
                )

            playoffs, finals = summarize(records)
            per_season[season] = len(records)
            total_playoffs += playoffs
            total_finals += finals
            processed.append(season)
            print(f"  Paired {len(records)} games ({playoffs} playoffs, {finals} finals).")

            if dry_run:
                print("  DRY-RUN: skipping database write.\n")
            else:
                with conn:
                    n = upsert_game_records(conn, records)
                total_upserts += n
                print(f"  Upserted {n} playoff game row(s) (insert or update).\n")

        # ── Coverage report ────────────────────────────────────────────
        print("══ Coverage report ══════════════════════════════════════")
        print(f"  Seasons processed : {len(processed)}")
        if processed:
            print(f"  Season range      : {processed[0]} … {processed[-1]}")
        print(f"  Playoff games     : {total_playoffs}")
        print(f"  Finals games      : {total_finals}")
        print(f"  Total games       : {total_playoffs + total_finals}")
        if not dry_run:
            print(f"  Rows upserted     : {total_upserts}")
        if len(processed) == 1:
            s = processed[0]
            print(f"  {s} game count : {per_season[s]}")
        if dry_run:
            print("  (DRY-RUN — no rows were written.)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
