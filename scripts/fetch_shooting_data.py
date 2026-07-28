"""[Shooting by Rest] Download per-game shooting + rosters to the local cache.

Fetches three hoopR datasets from the sportsdataverse GitHub release CDN into
``ml/data/shooting/``. Nothing is written to the database.

  player_boxscores_{year}.csv  one row per player per game: minutes, FG/3P/FT, and a
                               `comment` column carrying the DNP reason when they sat
  rosters_{year}.csv           per player-season bio: birth_date, age, exp, position
  team_boxscores_{year}.csv    team totals, kept for league baselines

Source choice and its evidence: ``docs/adr/0002-shooting-source-hoopr.md``. The short
version — stats.nba.com does not answer from here (HTTP 000 after 18s), and
Basketball-Reference's terms make an automated backfill the wrong call. hoopR is MIT
licensed, static, unauthenticated, and its ``game_id`` IS our ``games.external_id``.

File year is the season START for the nba_stats_* family: 1996 -> 1996-97. The
espn_nba_* family uses season END, which is a trap if the two are ever mixed. We only
touch nba_stats_*.

Usage:
    python scripts/fetch_shooting_data.py                 # everything, skip cached
    python scripts/fetch_shooting_data.py --force
    python scripts/fetch_shooting_data.py --only players
"""

from __future__ import annotations

import argparse
import csv
import sys
import urllib.error
import urllib.request
from pathlib import Path

FIRST_SEASON_YEAR = 1996
LAST_SEASON_YEAR = 2025

BASE = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
DATASETS = {
    "players": ("nba_stats_player_boxscores", "player_boxscores"),
    "rosters": ("nba_stats_rosters", "rosters"),
    "teams": ("nba_stats_team_boxscores", "team_boxscores"),
}

CACHE = Path(__file__).resolve().parent.parent / "ml" / "data" / "shooting"

# A regular-season stats GAME_ID starts 002. 004 is playoffs, 005 play-in.
REGULAR_PREFIX = "002"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"


def season_label(year: int) -> str:
    """1996 -> '1996-97'. Matches the `season` column in `games`."""
    return f"{year}-{str(year + 1)[-2:]}"


def fetch(url: str, timeout: int = 180) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def count_rows(path: Path, regular_only: bool) -> int:
    with path.open(newline="", encoding="utf-8") as fh:
        rdr = csv.DictReader(fh)
        if not regular_only or "game_id" not in (rdr.fieldnames or []):
            return sum(1 for _ in rdr)
        return sum(1 for r in rdr if r["game_id"].startswith(REGULAR_PREFIX))


def download(kind: str, year: int, force: bool) -> tuple[int, bool]:
    tag, stem = DATASETS[kind]
    dest = CACHE / f"{stem}_{year}.csv"
    regular_only = kind != "rosters"
    if dest.exists() and not force:
        return count_rows(dest, regular_only), False
    CACHE.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(fetch(f"{BASE}/{tag}/{stem}_{year}.csv"))
    return count_rows(dest, regular_only), True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="re-download cached files")
    ap.add_argument("--only", choices=sorted(DATASETS), help="fetch one dataset only")
    args = ap.parse_args()

    kinds = [args.only] if args.only else list(DATASETS)
    failures: list[tuple[str, int]] = []

    for kind in kinds:
        total = fresh = 0
        for year in range(FIRST_SEASON_YEAR, LAST_SEASON_YEAR + 1):
            try:
                n, got = download(kind, year, args.force)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
                print(f"  {season_label(year)} {kind}: FAILED {exc}", file=sys.stderr)
                failures.append((kind, year))
                continue
            total += n
            fresh += got
        print(f"{kind:>8}: {total:>7,} rows across "
              f"{LAST_SEASON_YEAR - FIRST_SEASON_YEAR + 1} seasons ({fresh} newly downloaded)")

    if failures:
        print(f"FAILED: {failures}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
