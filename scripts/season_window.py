"""Season gate for the daily pipeline.

Decides whether *today* (America/New_York) falls inside the current NBA regular
season, so `daily_update.py` can skip cleanly during the offseason instead of
running an ingest that has nothing to do.

Primary signal: ESPN's published regular-season dates
(``sports.core.api.espn.com/.../seasons/{year}/types/2``). They follow the season
the league actually played, including 2019-20 (to August) and 2020-21 (December to
May). The gate fetches them with **stdlib only** (no DB, no secrets, no
``fetch_schedule`` import) so it can run *before* ``daily_update.py`` ever touches
``DATABASE_URL``. ``fetch_schedule`` ``sys.exit``s at import time when
``DATABASE_URL`` is unset, which is exactly the dependency the offseason path avoids.

Fallback: on any fetch or parse failure, or a payload that is not a regular season
with ordered dates, we use a coarse Oct 1 - Apr 30 calendar check (mirrors
``regularSeasonDateBounds`` in ``src/lib/nba-season.ts``) so an ESPN outage can
never crash the gate.

The window extends ``SEASON_BUFFER_DAYS`` past each end. The job runs at 17:17 ET,
before that night's games finish, so the last night's scores arrive on a later run.
"""

from __future__ import annotations

import json
import urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# ESPN labels a season by the year it ends: 2026-27 is 2027. Type 2 is the regular season.
ESPN_REGULAR_SEASON_URL = (
    "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/{year}/types/2"
)
# Not a browser UA: ESPN's edge blocks a browser UA sent without a browser's other headers.
USER_AGENT = "fullcourt-season-gate"

# ESPN's NBA day starts at 03:00 ET, so a season ends at 06:59Z (EDT) on the following date.
ESPN_DAY_START_HOUR_ET = 3

# Days the window stays open before the first and after the last regular-season night.
SEASON_BUFFER_DAYS = 3

ET = ZoneInfo("America/New_York")


def today_et() -> date:
    """Today's calendar date in America/New_York (the pipeline's time base)."""
    return datetime.now(ET).date()


def current_season_start_year(today: date | None = None) -> int:
    """First calendar year of the active NBA season for ``today`` (ET).

    Oct–Dec → this year; Jan–Sep → the previous year. Mirrors the season-label
    logic in ``src/lib/nba-season.ts`` (``m >= 10 ? y : y - 1``) so the Python
    pipeline and the TS app always agree on which season is "current". Seed and
    backfill scripts derive their latest season from this instead of hardcoding a
    year, so the season rollover needs no code edit.
    """
    d = today or today_et()
    return d.year if d.month >= 10 else d.year - 1


def _espn_day(raw: str) -> date:
    """The ET calendar day an ESPN boundary timestamp belongs to (days start at 03:00 ET)."""
    instant = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return (instant.astimezone(ET) - timedelta(hours=ESPN_DAY_START_HOUR_ET)).date()


def _fetch_regular_season_bounds(today: date) -> tuple[date, date]:
    """First and last ET day of the regular season ``today`` belongs to, from ESPN.

    Raises on any network, JSON or shape problem; the caller falls back to the calendar.
    """
    url = ESPN_REGULAR_SEASON_URL.format(year=current_season_start_year(today) + 1)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if str(data.get("type")) != "2":
        raise ValueError(f"season type {data.get('type')!r} is not the regular season")
    start, end = _espn_day(data["startDate"]), _espn_day(data["endDate"])
    if end < start:
        raise ValueError(f"regular season ends ({end}) before it starts ({start})")
    return start, end


def _coarse_in_season(today: date) -> bool:
    """Fallback calendar check: regular season runs roughly Oct 1 – Apr 30.

    Mirrors ``regularSeasonDateBounds`` in ``src/lib/nba-season.ts``.
    """
    return today.month >= 10 or today.month <= 4


def is_in_season(today: date | None = None) -> bool:
    """Return True when ``today`` (ET) is within the active NBA regular season.

    ESPN-driven when reachable; coarse calendar fallback on any failure. Logs the
    decision either way.
    """
    if today is None:
        today = today_et()

    try:
        first, last = _fetch_regular_season_bounds(today)
    except Exception as exc:  # noqa: BLE001 — network/JSON/shape: degrade, never crash the gate
        print(f"[season-gate] ESPN season dates unavailable ({exc}); using calendar fallback.")
        return _coarse_in_season(today)

    start = first - timedelta(days=SEASON_BUFFER_DAYS)
    end = last + timedelta(days=SEASON_BUFFER_DAYS)
    in_window = start <= today <= end
    print(
        f"[season-gate] ESPN regular season {first.isoformat()}..{last.isoformat()}, "
        f"window {start.isoformat()}..{end.isoformat()} (today={today.isoformat()} ET) -> {'in season' if in_window else 'offseason'}"
    )
    return in_window


if __name__ == "__main__":
    _today = today_et()
    _in_season = is_in_season(_today)
    print(f"today (ET) = {_today.isoformat()}")
    print(f"is_in_season = {_in_season}")
    print(f"would exit {0 if not _in_season else '(continue to pipeline)'}")
