"""Season gate for the daily pipeline.

Decides whether *today* (America/New_York) falls inside the current NBA regular
season, so `daily_update.py` can skip cleanly during the offseason instead of
erroring on an empty schedule window.

Primary signal: the live NBA CDN schedule — the same endpoint and regular-season
``002`` gameId filter that ``fetch_nba_schedule_cdn.py`` uses. We deliberately
re-fetch and parse here with **stdlib only** (no DB, no secrets, no
``fetch_schedule`` import) so the gate can run *before* ``daily_update.py`` ever
touches ``DATABASE_URL``. Importing ``fetch_nba_schedule_cdn`` would transitively
import ``fetch_schedule``, which ``sys.exit``s at import time when
``DATABASE_URL`` is unset — exactly the dependency we want the offseason path to
avoid.

Fallback: on any CDN fetch/parse failure, OR if the payload contains no
regular-season dates, we use a coarse Oct 1 – Apr 30 calendar check (mirrors
``regularSeasonDateBounds`` in ``src/lib/nba-season.ts``) so a CDN outage can
never crash the gate.

A ±``SEASON_BUFFER_DAYS`` buffer around the schedule window absorbs the known
UTC-vs-ET date fuzz at the season boundary, so the gate can't be off by a day.
"""

from __future__ import annotations

import json
import urllib.request
from datetime import date, datetime, timezone, timedelta
from zoneinfo import ZoneInfo

# Same endpoint as fetch_nba_schedule_cdn.py (kept local to avoid a DB-coupled import).
CDN_SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"

# Slack on each side of the known schedule window (absorbs UTC-vs-ET boundary fuzz).
SEASON_BUFFER_DAYS = 3

ET = ZoneInfo("America/New_York")


def today_et() -> date:
    """Today's calendar date in America/New_York (the pipeline's time base)."""
    return datetime.now(ET).date()


def _fetch_regular_season_dates() -> list[date]:
    """Regular-season (``002`` gameId) tip-off dates from the live CDN schedule.

    Each date is the UTC calendar date of ``gameDateTimeUTC``. Note:
    ``fetch_nba_schedule_cdn.py`` stores ``games.date`` as the **ET** calendar
    date; the gate deliberately keeps the cheaper UTC read because the
    ±``SEASON_BUFFER_DAYS`` buffer already absorbs the one-day boundary fuzz.
    Raises on any network / JSON error; the caller wraps this in try/except.
    """
    req = urllib.request.Request(CDN_SCHEDULE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    league = data.get("leagueSchedule") or {}
    dates: list[date] = []
    for game_date_entry in league.get("gameDates") or []:
        for game in game_date_entry.get("games") or []:
            gid = str(game.get("gameId", "")).strip()
            if len(gid) < 3 or not gid.startswith("002"):
                continue
            raw = (game.get("gameDateTimeUTC") or game.get("gameDateUTC") or "").strip()
            if not raw:
                continue
            if raw.endswith("Z"):
                raw = raw[:-1] + "+00:00"
            try:
                dt = datetime.fromisoformat(raw)
            except ValueError:
                continue
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            dates.append(dt.date())
    return dates


def _coarse_in_season(today: date) -> bool:
    """Fallback calendar check: regular season runs roughly Oct 1 – Apr 30.

    Mirrors ``regularSeasonDateBounds`` in ``src/lib/nba-season.ts``.
    """
    return today.month >= 10 or today.month <= 4


def is_in_season(today: date | None = None) -> bool:
    """Return True when ``today`` (ET) is within the active NBA regular season.

    CDN-driven when reachable; coarse calendar fallback on any failure or empty
    schedule. Logs the decision either way.
    """
    if today is None:
        today = today_et()

    try:
        dates = _fetch_regular_season_dates()
    except Exception as exc:  # noqa: BLE001 — network/JSON/parse: degrade, never crash the gate
        print(f"[season-gate] CDN schedule fetch failed ({exc}); using calendar fallback.")
        return _coarse_in_season(today)

    if not dates:
        print("[season-gate] CDN returned no regular-season dates; using calendar fallback.")
        return _coarse_in_season(today)

    start = min(dates) - timedelta(days=SEASON_BUFFER_DAYS)
    end = max(dates) + timedelta(days=SEASON_BUFFER_DAYS)
    in_window = start <= today <= end
    print(
        f"[season-gate] regular-season window {start.isoformat()}..{end.isoformat()} "
        f"(today={today.isoformat()} ET) -> {'in season' if in_window else 'offseason'}"
    )
    return in_window


if __name__ == "__main__":
    _today = today_et()
    _in_season = is_in_season(_today)
    print(f"today (ET) = {_today.isoformat()}")
    print(f"is_in_season = {_in_season}")
    print(f"would exit {0 if not _in_season else '(continue to pipeline)'}")
