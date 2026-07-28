"""[Shooting by Rest, Phase 1] Download per-game team shooting to the local cache.

Fetches ``nba_stats_team_boxscores`` season files from the sportsdataverse GitHub
release CDN into ``ml/data/shooting/``. Nothing is written to the database — see
``docs/superpowers/specs/2026-07-28-shooting-by-rest-design.md`` §2.

Source choice and its evidence live in ``docs/adr/0002-shooting-source-hoopr.md``.
The short version: stats.nba.com does not answer from here (HTTP 000 after 18s), and
Basketball-Reference's terms make an automated backfill the wrong call. hoopR is MIT
licensed, static, unauthenticated, and its ``game_id`` IS our ``games.external_id``.

Usage:
    python scripts/fetch_team_shooting.py               # 1996..2025, skip cached
    python scripts/fetch_team_shooting.py --force       # re-download everything

The ESPN cross-check lives in ``scripts/analyze_shooting_by_rest.py --verify``: these
files carry no game date, so recovering one means reading ``games``, and that script
already holds the connection. It matters more than it looks — hoopR, pbpstats and
shufinskiy are all proxies of stats.nba.com, so they agree with each other by
construction and would propagate an upstream error identically. ESPN observes
independently, so it is the only cheap way to notice the mirror has gone wrong.
"""

from __future__ import annotations

import argparse
import csv
import sys
import urllib.error
import urllib.request
from pathlib import Path

# File year is the season START for the nba_stats_* family: 1996 -> 1996-97,
# 2025 -> 2025-26. The espn_nba_* family uses season END, which is a trap if the
# two are ever mixed. We only touch nba_stats_*.
FIRST_SEASON_YEAR = 1996
LAST_SEASON_YEAR = 2025

RELEASE = (
    "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
    "/nba_stats_team_boxscores/team_boxscores_{year}.csv"
)
CACHE = Path(__file__).resolve().parent.parent / "ml" / "data" / "shooting"

# A regular-season stats GAME_ID starts 002. 004 is playoffs, 005 play-in.
REGULAR_PREFIX = "002"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"


def season_label(year: int) -> str:
    """1996 -> '1996-97'. Matches the `season` column in `games`."""
    return f"{year}-{str(year + 1)[-2:]}"


def fetch(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def count_regular_rows(path: Path) -> int:
    with path.open(newline="", encoding="utf-8") as fh:
        return sum(1 for row in csv.DictReader(fh) if row["game_id"].startswith(REGULAR_PREFIX))


def download_season(year: int, force: bool) -> tuple[Path, int, bool]:
    """Returns (path, regular-season row count, whether it was downloaded now)."""
    dest = CACHE / f"team_boxscores_{year}.csv"
    if dest.exists() and not force:
        return dest, count_regular_rows(dest), False

    body = fetch(RELEASE.format(year=year))
    CACHE.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    return dest, count_regular_rows(dest), True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="re-download cached seasons")
    args = ap.parse_args()

    total = 0
    downloaded = 0
    failures: list[int] = []

    for year in range(FIRST_SEASON_YEAR, LAST_SEASON_YEAR + 1):
        try:
            path, n, fresh = download_season(year, args.force)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            print(f"{season_label(year)}  FAILED  {exc}", file=sys.stderr)
            failures.append(year)
            continue
        total += n
        downloaded += fresh
        print(f"{season_label(year)}  {n:>5} regular team-games  {'downloaded' if fresh else 'cached'}")

    print(f"\n{total} regular-season team-games across "
          f"{LAST_SEASON_YEAR - FIRST_SEASON_YEAR + 1} seasons "
          f"({downloaded} newly downloaded)")

    if failures:
        print(f"FAILED seasons: {failures}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
