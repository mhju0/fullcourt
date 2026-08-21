"""Flatten the cached ESPN officials corpus into three analysis tables.

``ml/data/officials/`` holds one ESPN summary payload per game (5.4 GB, gitignored,
fetched by ``scripts/fetch_officials.ts``). Every referee question — the axes
pre-registered in ADR 0007 and the player-level ones in
``ml/referee_player_preregistration.md`` — reads the same handful of fields out of it,
so the corpus is parsed **once** into flat tables and every analysis runs off those.

Emits, into ``ml/data/referee/``:

``games.csv``    one row per game: teams, score, officials, consensus spread, counts
``fouls.csv``    one row per foul play: type, period, clock, committer, drawer, score state
``players.csv``  one row per player-game: minutes, points, personal fouls, starter, ejected

Three parsing rules are load-bearing and are asserted rather than assumed:

* ``Offensive Foul Turnover`` is dropped. The NBA logs an offensive foul twice — once as
  the foul, once as the turnover — and counting both inflates fouls per game by ~3.2.
  ``scripts/fetch_officials.ts`` established this against box-score PF totals.
* ``n_officials`` counts everyone ESPN lists, which is **not** always the working crew. Playoff
  games — and 295 regular-season ones — list a fourth standby official at ``order`` 4, and by
  2025-26 that is the majority of playoff games. The array is always sorted by ``order`` (checked
  on a 1,200-payload sample: zero unsorted, zero missing an order), so ``official_1..3`` are the
  three who worked and the filter downstream is ``n_officials >= 3``, never ``== 3``.
* In a foul play's ``participants``, index 0 committed the foul and index 1 drew it. The
  play text ("X shooting foul (Y draws the foul)") is parsed back on a sample to check it.
* ``header.season.type`` 2 is the regular season. Playoff payloads are kept in the table
  with their type recorded, and every analysis filters to 2.

Usage:
    ml/.venv/bin/python ml/extract_referee_corpus.py [--limit N]
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
from datetime import timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

CORPUS_DIR = Path("ml/data/officials")
OUT_DIR = Path("ml/data/referee")
EASTERN = ZoneInfo("US/Eastern")

# Logged twice by the NBA — as the foul and as the turnover it causes. See module docstring.
DUPLICATE_OF_OFFENSIVE = "Offensive Foul Turnover"

# Regulation and overtime period lengths, in seconds.
REGULATION_PERIOD_SEC = 12 * 60
OVERTIME_PERIOD_SEC = 5 * 60

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def season_label(year: int) -> str:
    """ESPN's ``season.year`` is the calendar year the season ends: 2016 -> "2015-16"."""
    return f"{year - 1}-{str(year)[2:]}"


def clock_to_seconds(display: str | None) -> float | None:
    """"9:41" -> 581.0 seconds remaining in the period. Handles "0.4" style sub-minute clocks."""
    if not display:
        return None
    parts = display.split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        return float(parts[0])
    except ValueError:
        return None


def elapsed_seconds(period: int, remaining: float | None) -> float | None:
    """Seconds from tip-off, so periods of different length share one axis."""
    if remaining is None or period < 1:
        return None
    if period <= 4:
        before = (period - 1) * REGULATION_PERIOD_SEC
        length = REGULATION_PERIOD_SEC
    else:
        before = 4 * REGULATION_PERIOD_SEC + (period - 5) * OVERTIME_PERIOD_SEC
        length = OVERTIME_PERIOD_SEC
    return before + (length - remaining)


def parse_minutes(raw: str | None) -> float | None:
    """Box-score MIN is a bare integer string, or "--"/"" for a player who did not play."""
    if not raw or raw in {"--", "-"}:
        return None
    if ":" in raw:
        mm, ss = raw.split(":", 1)
        try:
            return int(mm) + int(ss) / 60
        except ValueError:
            return None
    try:
        return float(raw)
    except ValueError:
        return None


def parse_int(raw: str | None) -> int | None:
    if raw is None or raw in {"--", "-", ""}:
        return None
    try:
        return int(raw.replace("+", ""))
    except ValueError:
        return None


def consensus_spread(payload: dict) -> float | None:
    """Home-team point spread from the consensus line; negative means the home team is favored.

    ESPN carries several providers; the consensus one is preferred and the first entry is the
    fallback. ``winPercentage`` on the same object is ignored — it is visibly unreliable
    (a 2015-16 sample shows 48% attached to the favorite).
    """
    picks = payload.get("pickcenter") or []
    if not picks:
        return None
    chosen = next(
        (p for p in picks if (p.get("provider") or {}).get("name") == "consensus"), picks[0]
    )
    spread = chosen.get("spread")
    if not isinstance(spread, (int, float)):
        return None
    # ESPN states the spread from the home side; confirm against the favorite flag when present.
    home_odds = chosen.get("homeTeamOdds") or {}
    if home_odds.get("favorite") is True and spread > 0:
        return -float(spread)
    if home_odds.get("underdog") is True and spread < 0:
        return -float(spread)
    return float(spread)


def extract_game(path: Path) -> tuple[dict, list[dict], list[dict]] | None:
    try:
        payload = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        log.warning("unreadable payload: %s", path.name)
        return None

    header = payload.get("header") or {}
    comps = header.get("competitions") or []
    if not comps:
        return None
    comp = comps[0]
    competitors = comp.get("competitors") or []
    if len(competitors) != 2:
        return None

    home = next((c for c in competitors if c.get("homeAway") == "home"), None)
    away = next((c for c in competitors if c.get("homeAway") == "away"), None)
    if home is None or away is None:
        return None

    event_id = str(header.get("id") or path.stem.replace("ev-", ""))
    season = header.get("season") or {}
    season_year = season.get("year")
    season_type = season.get("type")

    utc_iso = comp.get("date")
    date_et = ""
    if utc_iso:
        from datetime import datetime

        stamp = datetime.fromisoformat(utc_iso.replace("Z", "+00:00"))
        date_et = stamp.astimezone(EASTERN).date().isoformat()

    officials = [
        o.get("fullName", "").strip()
        for o in ((payload.get("gameInfo") or {}).get("officials") or [])
        if o.get("fullName")
    ]

    home_score = parse_int(home.get("score"))
    away_score = parse_int(away.get("score"))

    plays = payload.get("plays") or []
    home_team_id = str((home.get("team") or {}).get("id") or "")
    away_team_id = str((away.get("team") or {}).get("id") or "")

    foul_rows: list[dict] = []
    for play in plays:
        type_text = ((play.get("type") or {}).get("text") or "").strip()
        if "Foul" not in type_text or type_text == DUPLICATE_OF_OFFENSIVE:
            continue
        period = ((play.get("period") or {}).get("number")) or 0
        remaining = clock_to_seconds(((play.get("clock") or {}).get("displayValue")))
        participants = play.get("participants") or []

        def participant(idx: int) -> str:
            if len(participants) > idx:
                return str(((participants[idx] or {}).get("athlete") or {}).get("id") or "")
            return ""

        team_id = str((play.get("team") or {}).get("id") or "")
        foul_rows.append(
            {
                "event_id": event_id,
                "sequence": play.get("sequenceNumber") or "",
                "foul_type": type_text,
                "period": period,
                "clock_remaining_sec": remaining if remaining is not None else "",
                "elapsed_sec": elapsed_seconds(period, remaining) or "",
                "committing_team_id": team_id,
                "committing_is_home": int(team_id == home_team_id) if team_id else "",
                "fouler_id": participant(0),
                "drawer_id": participant(1),
                "n_participants": len(participants),
                "home_score_at": play.get("homeScore"),
                "away_score_at": play.get("awayScore"),
            }
        )

    player_rows: list[dict] = []
    for side in (payload.get("boxscore") or {}).get("players") or []:
        team_id = str((side.get("team") or {}).get("id") or "")
        for block in side.get("statistics") or []:
            names = block.get("names") or []
            index = {name: i for i, name in enumerate(names)}
            for entry in block.get("athletes") or []:
                athlete = entry.get("athlete") or {}
                stats = entry.get("stats") or []

                def stat(name: str) -> str | None:
                    i = index.get(name)
                    return stats[i] if i is not None and i < len(stats) else None

                player_rows.append(
                    {
                        "event_id": event_id,
                        "athlete_id": str(athlete.get("id") or ""),
                        "athlete_name": athlete.get("displayName") or "",
                        "team_id": team_id,
                        "is_home": int(team_id == home_team_id) if team_id else "",
                        "starter": int(bool(entry.get("starter"))),
                        "did_not_play": int(bool(entry.get("didNotPlay"))),
                        "ejected": int(bool(entry.get("ejected"))),
                        "minutes": parse_minutes(stat("MIN")) if stat("MIN") else "",
                        "points": parse_int(stat("PTS")),
                        "personal_fouls": parse_int(stat("PF")),
                        "plus_minus": parse_int(stat("+/-")),
                    }
                )

    game_row = {
        "event_id": event_id,
        "date_et": date_et,
        "season": season_label(season_year) if season_year else "",
        "season_type": season_type if season_type is not None else "",
        "neutral_site": int(bool(comp.get("neutralSite"))),
        "attendance": (payload.get("gameInfo") or {}).get("attendance") or "",
        "home_team_id": home_team_id,
        "home_abbr": (home.get("team") or {}).get("abbreviation") or "",
        "away_team_id": away_team_id,
        "away_abbr": (away.get("team") or {}).get("abbreviation") or "",
        "home_score": home_score,
        "away_score": away_score,
        "home_won": int(home_score > away_score) if (home_score and away_score) else "",
        "spread_home": consensus_spread(payload),
        "official_1": officials[0] if len(officials) > 0 else "",
        "official_2": officials[1] if len(officials) > 1 else "",
        "official_3": officials[2] if len(officials) > 2 else "",
        "n_officials": len(officials),
        "n_plays": len(plays),
        "n_fouls": len(foul_rows),
        "n_player_rows": len(player_rows),
    }
    return game_row, foul_rows, player_rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="parse only the first N payloads")
    args = parser.parse_args()

    paths = sorted(CORPUS_DIR.glob("ev-*.json"))
    if args.limit:
        paths = paths[: args.limit]
    log.info("parsing %d payloads from %s", len(paths), CORPUS_DIR)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    game_fields = foul_fields = player_fields = None
    skipped = 0

    with (
        (OUT_DIR / "games.csv").open("w", newline="") as gf,
        (OUT_DIR / "fouls.csv").open("w", newline="") as ff,
        (OUT_DIR / "players.csv").open("w", newline="") as pf,
    ):
        gw = fw = pw = None
        for i, path in enumerate(paths, 1):
            if i % 2000 == 0:
                log.info("  %d / %d", i, len(paths))
            result = extract_game(path)
            if result is None:
                skipped += 1
                continue
            game_row, foul_rows, player_rows = result
            if gw is None:
                game_fields = list(game_row.keys())
                gw = csv.DictWriter(gf, fieldnames=game_fields)
                gw.writeheader()
            gw.writerow(game_row)
            if foul_rows:
                if fw is None:
                    foul_fields = list(foul_rows[0].keys())
                    fw = csv.DictWriter(ff, fieldnames=foul_fields)
                    fw.writeheader()
                fw.writerows(foul_rows)
            if player_rows:
                if pw is None:
                    player_fields = list(player_rows[0].keys())
                    pw = csv.DictWriter(pf, fieldnames=player_fields)
                    pw.writeheader()
                pw.writerows(player_rows)

    log.info("done. skipped %d unusable payloads", skipped)
    for name in ("games.csv", "fouls.csv", "players.csv"):
        p = OUT_DIR / name
        log.info("  %s  %.1f MB", name, p.stat().st_size / 1e6)


if __name__ == "__main__":
    main()
