"""Fetch NBA PLAY-IN tournament games and insert them tagged game_type='play_in'.

This is Phase 1b of the Playoff Predictor (``docs/PLAYOFF_PREDICTOR_DESIGN.md`` §3.1, §4).
It mirrors ``fetch_playoffs.py`` but for the **play-in tournament** (2020-21+). Play-in
games are ingested as per-game substrate for ONE reason: a team that reaches the playoffs
via the play-in has its "previous game" = its last play-in game, so first-round entry-rest
is only correct once play-in rows exist. **Play-in games are NEVER series targets.**

Empirically determined signature (see Phase 1b STEP 1, not assumed):
  * NBA stats GAME_ID prefix = ``005``.
  * nba_api ``LeagueGameFinder`` season type = ``"PlayIn"``.
  (2023-24 ``PlayIn`` returned 12 rows = 6 games, 2024-04-16…19.)

Own game_type — locked decision:
  Play-in rows get their OWN ``game_type = 'play_in'`` (NOT folded under ``playoffs``).
  ``game_type`` is a varchar, so no migration is needed. ``get_game_type`` does not know
  the ``005`` prefix (it would default to ``regular``), so this script forces the tag via
  ``_pair_games_dataframe(..., game_type_override="play_in")``.

CRITICAL ISOLATION CONTEXT:
  Unlike May/June playoff rows, play-in games are dated in **mid-April — INSIDE** the
  regular-season calendar guard (``gameDateWithinRegularSeasonCalendar``, Oct 1–Apr 30 in
  ``src/lib/db/queries.ts``). The calendar guard does NOT exclude them. The
  ``game_type='play_in'`` tag is therefore the ONLY thing keeping play-in games out of the
  regular-season product, so correct tagging is mandatory. Any pre-existing play-in row
  tagged ``regular`` is live pollution; the ``ON CONFLICT (external_id) DO UPDATE`` upsert
  re-tags it to ``play_in`` (this script also audits + reports such rows before writing).

DATE CONVENTION: nba_api ET ``GAME_DATE`` (consistent with fetch_schedule / fetch_playoffs)
so first-round entry-rest day-counts line up across regular/play-in/playoff rows.

Seasons: 2020-21 through current (the play-in era), derived from ``fetch_schedule.SEASONS``
(2019-20 is already excluded there).

HARD ISOLATION GUARANTEES:
  * Only ``005`` external_ids are ever upserted — a ``002`` (regular) or ``004`` (playoff)
    row can never be written or mutated here (disjoint id namespaces).
  * Regular-season ``fetch_schedule.py`` and playoff ``fetch_playoffs.py`` behavior are
    unchanged (this script only adds a new ingest path).

Usage:
  python scripts/fetch_play_in.py                     # all in-scope play-in seasons
  python scripts/fetch_play_in.py --season 2023-24    # one season
  python scripts/fetch_play_in.py --dry-run           # parse + pair + tag, no writes

DATABASE_URL resolution + the --dry-run team-map note are identical to fetch_playoffs.py.
Set NBA_SEED_SKIP_OT=1 to skip per-game BoxScore overtime lookups.
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
    """Prefer DATABASE_URL from the env; else .env.local then scripts/.env (mirrors
    daily_update.resolve_database_url / fetch_playoffs.resolve_database_url)."""
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


# Resolve DATABASE_URL BEFORE importing fetch_schedule (it sys.exit()s at import time if
# DATABASE_URL is unset). See fetch_playoffs.py for the full rationale.
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
PLAY_IN_SEASON_TYPE = "PlayIn"
PLAY_IN_GAME_TYPE = "play_in"
# Play-in tournament debuted in its current form in 2020-21 (2019-20 is excluded upstream).
PLAY_IN_FIRST_START_YEAR = 2020


def is_play_in_game_id(game_id: object) -> bool:
    """Play-in tournament games use a 005 prefix in NBA stats GAME_ID.

    Mirrors is_regular_season_game_id (002) / is_playoff_game_id (004). Determined
    empirically (not assumed) — see the module docstring.
    """
    gid = normalize_stats_game_id(game_id)
    return len(gid) >= 3 and gid.startswith("005")


def pair_play_in_games(
    df,
    season: str,
    team_map: dict[str, int],
    *,
    force_skip_ot: bool | None = None,
) -> list[tuple]:
    """Reuse fetch_schedule's pairing, gated to 005 IDs and forced to game_type='play_in'."""
    return _pair_games_dataframe(
        df,
        team_map,
        lambda _home: season,
        force_skip_ot=force_skip_ot,
        id_filter=is_play_in_game_id,
        id_filter_label="005",
        game_type_override=PLAY_IN_GAME_TYPE,
    )


def play_in_seasons() -> list[str]:
    """In-scope play-in seasons: 2020-21 … current (subset of fetch_schedule.SEASONS)."""
    return [s for s in SEASONS if int(s[:4]) >= PLAY_IN_FIRST_START_YEAR]


def resolve_seasons(requested: str | None) -> list[str]:
    seasons = play_in_seasons()
    if requested is None:
        return seasons
    if requested not in seasons:
        in_range = f"{seasons[0]} … {seasons[-1]}" if seasons else "(none)"
        sys.exit(
            f"ERROR: season '{requested}' is not an in-scope play-in season. "
            f"Expected one of the play-in-era labels ({in_range})."
        )
    return [requested]


def audit_existing_mislabeled(conn) -> None:
    """STEP 2 — report any 005 rows already in the DB tagged something other than play_in.

    These are live pollution (esp. game_type='regular', which would leak into the
    regular-season product since play-in dates fall inside the Oct 1–Apr 30 guard). The
    upsert below re-tags them to 'play_in' via ON CONFLICT DO UPDATE.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT season, game_type, count(*) FROM games
            WHERE external_id LIKE %s AND game_type <> %s
            GROUP BY season, game_type ORDER BY season, game_type
            """,
            ("005%", PLAY_IN_GAME_TYPE),
        )
        rows = cur.fetchall()
    print("── Pre-ingest audit: existing 005 rows NOT tagged 'play_in' ──")
    if not rows:
        print("  none — no pre-existing play-in pollution.\n")
        return
    total = sum(c for _, _, c in rows)
    print(f"  {total} mislabeled play-in row(s) found (will be re-tagged to 'play_in'):")
    for season, gt, c in rows:
        print(f"    {season}: {c} row(s) tagged '{gt}'")
    print("")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest NBA play-in tournament games (005-prefixed) tagged game_type='play_in'."
    )
    parser.add_argument(
        "--season",
        metavar="YYYY-YY",
        help="Process a single in-scope play-in season (e.g. 2023-24). Default: all.",
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
            f"Mode: {'DRY-RUN (no writes)' if dry_run else 'WRITE (upsert 005 rows)'} | "
            f"season type: {PLAY_IN_SEASON_TYPE} | seasons: {len(seasons)}\n"
        )

        audit_existing_mislabeled(conn)

        total_play_in = 0
        total_upserts = 0
        processed: list[str] = []
        per_season: dict[str, int] = {}

        for season in seasons:
            print(f"── Season {season} (PlayIn) ──────────────────────")

            df = fetch_games_df(season, PLAY_IN_SEASON_TYPE)
            time.sleep(API_DELAY_SECONDS)

            # Dry-run forces OT skip (no per-game BoxScore network calls); a real run
            # respects NBA_SEED_SKIP_OT (read inside _pair_games_dataframe).
            records = pair_play_in_games(
                df, season, team_map, force_skip_ot=True if dry_run else None
            )

            # Belt-and-suspenders: every paired row MUST be a 005 row tagged play_in.
            # Guarantees we never touch a regular (002) or playoff (004) row.
            bad = [
                r for r in records
                if not is_play_in_game_id(r[0]) or r[9] != PLAY_IN_GAME_TYPE
            ]
            if bad:
                sys.exit(
                    f"FATAL: {len(bad)} non-play-in row(s) slipped through the gate for "
                    f"{season}; refusing to write. First: {bad[0][0]} (type={bad[0][9]})"
                )

            per_season[season] = len(records)
            total_play_in += len(records)
            processed.append(season)
            print(f"  Paired {len(records)} play-in game(s).")

            if dry_run:
                print("  DRY-RUN: skipping database write.\n")
            else:
                with conn:
                    n = upsert_game_records(conn, records)
                total_upserts += n
                print(f"  Upserted {n} play-in game row(s) (insert or update).\n")

        # ── Coverage report ────────────────────────────────────────────
        print("══ Coverage report ══════════════════════════════════════")
        print(f"  Seasons processed : {len(processed)}")
        if processed:
            print(f"  Season range      : {processed[0]} … {processed[-1]}")
        print(f"  Play-in games     : {total_play_in}")
        if not dry_run:
            print(f"  Rows upserted     : {total_upserts}")
        print("  Per-season play-in counts:")
        for s in processed:
            print(f"    {s}: {per_season[s]}")
        if dry_run:
            print("  (DRY-RUN — no rows were written.)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
