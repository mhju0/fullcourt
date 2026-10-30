"""Publish a validated NBA Stats raw league shot grid to disk, without database access.

The daily publication job commits only this compact artifact. Model inference/training
is deliberately absent; historical database surfaces remain a separate publication.
Exit 3 means the provider has not published any shots; errors leave the prior file intact.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
import logging
import math
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from season_window import current_season_start_year
from collection_failure import EmptyResponse, InvalidResponse, ValidationFailure, failure_reason, write_failure_reason

logger = logging.getLogger("publish_current_shot_grid")
ENDPOINT = "https://stats.nba.com/stats/shotchartdetail"
REQUIRED_COLUMNS = {
    "GAME_ID", "GAME_EVENT_ID", "GAME_DATE", "LOC_X", "LOC_Y", "SHOT_TYPE",
    "SHOT_ATTEMPTED_FLAG", "SHOT_MADE_FLAG", "SHOT_ZONE_BASIC", "SHOT_ZONE_RANGE", "SHOT_ZONE_AREA",
}
ZONE_COLUMNS = ("SHOT_ZONE_BASIC", "SHOT_ZONE_RANGE", "SHOT_ZONE_AREA")


def source_url(season: str) -> str:
    params = {"ContextMeasure": "FGA", "LastNGames": 0, "LeagueID": "00", "Month": 0,
              "OpponentTeamID": 0, "Period": 0, "PlayerID": 0, "Season": season,
              "SeasonType": "Regular Season", "TeamID": 0}
    params.update({key: "" for key in (
        "AheadBehind", "ClutchTime", "ContextFilter", "DateFrom", "DateTo", "EndPeriod", "EndRange",
        "GameID", "GameSegment", "Location", "Outcome", "PlayerPosition", "PointDiff", "Position",
        "RangeType", "RookieYear", "SeasonSegment", "StartPeriod", "StartRange", "VsConference", "VsDivision")})
    return ENDPOINT + "?" + urllib.parse.urlencode(params)


def fetch_payload(url: str, timeout: float) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.nba.com/", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
    if not body.strip():
        raise EmptyResponse()
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise InvalidResponse() from error
    if not isinstance(payload, dict):
        raise ValidationFailure()
    return payload


def shot_rows(payload: dict) -> list[dict]:
    sets = payload.get("resultSets")
    if not isinstance(sets, list):
        raise ValueError("Missing NBA Stats resultSets")
    matching = [s for s in sets if s.get("name") == "Shot_Chart_Detail"]
    if len(matching) != 1:
        raise ValueError("Expected exactly one Shot_Chart_Detail dataset")
    headers, rows = matching[0].get("headers"), matching[0].get("rowSet")
    if not isinstance(headers, list) or len(headers) != len(set(headers)) or not REQUIRED_COLUMNS.issubset(headers):
        raise ValueError("ShotChartDetail required columns changed")
    if not isinstance(rows, list) or any(not isinstance(row, list) or len(row) != len(headers) for row in rows):
        raise ValueError("Malformed ShotChartDetail rows")
    return [dict(zip(headers, row)) for row in rows]


def valid_season(season: str) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}", season)) and int(season[-2:]) == (int(season[:4]) + 1) % 100


def build_snapshot(payload: dict, season: str, fetched_at: str, generated_at: str | None = None) -> dict | None:
    if not valid_season(season):
        raise ValueError("Invalid season")
    generated_at = generated_at or datetime.now(timezone.utc).isoformat()
    fetched = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    generated = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    if fetched.utcoffset() is None or generated.utcoffset() is None:
        raise ValueError("Snapshot timestamps must include a timezone")
    if fetched > generated or generated > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("Snapshot timestamp order or future clock is invalid")
    fetched_date_et = fetched.astimezone(ZoneInfo("America/New_York")).date()
    rows = shot_rows(payload)
    if not rows:
        return None
    cells = defaultdict(lambda: {"fga": 0, "fgm": 0, "fg3a": 0, "fg3m": 0, "zones": [Counter(), Counter(), Counter()]})
    game_ids, dates, event_ids = set(), [], set()
    no_location = outside = 0
    for row in rows:
        game_id = str(row["GAME_ID"])
        if not re.fullmatch(r"002" + season[2:4] + r"\d{5}", game_id):
            raise ValueError("Shot rows do not match requested regular season")
        event = (game_id, str(row["GAME_EVENT_ID"]))
        if event in event_ids:
            raise ValueError("Duplicate shot event")
        event_ids.add(event)
        raw_date = str(row["GAME_DATE"])
        if not re.fullmatch(r"\d{8}", raw_date):
            raise ValueError("Shot game date must use YYYYMMDD")
        date = datetime.strptime(raw_date, "%Y%m%d").date()
        if date > fetched_date_et:
            raise ValueError("Shot game date is later than the Eastern collection date")
        if not (datetime(int(season[:4]), 10, 1).date() <= date < datetime(int(season[:4]) + 1, 10, 1).date()):
            raise ValueError("Shot date outside requested season")
        if row["SHOT_ATTEMPTED_FLAG"] != 1 or row["SHOT_MADE_FLAG"] not in (0, 1):
            raise ValueError("Invalid shot attempt/make flags")
        if row["SHOT_TYPE"] not in ("2PT Field Goal", "3PT Field Goal"):
            raise ValueError("Unexpected field goal type")
        game_ids.add(game_id)
        dates.append(date.isoformat())
        try:
            x, y = float(row["LOC_X"]), float(row["LOC_Y"])
        except (TypeError, ValueError):
            no_location += 1
            continue
        if not math.isfinite(x) or not math.isfinite(y):
            no_location += 1
            continue
        if abs(x) > 400:
            raise ValueError("Shot coordinate units changed")
        if not (-250 <= x < 250 and -50 <= y < 420):
            outside += 1
            continue
        cell = cells[math.floor(x / 10), math.floor(y / 10)]
        made, three = row["SHOT_MADE_FLAG"], int(row["SHOT_TYPE"] == "3PT Field Goal")
        cell["fga"] += 1
        cell["fgm"] += made
        cell["fg3a"] += three
        cell["fg3m"] += made * three
        for counter, column in zip(cell["zones"], ZONE_COLUMNS):
            label = row[column]
            if label is not None:
                if not isinstance(label, str):
                    raise ValueError("Invalid shot zone label")
                counter[label] += 1
    if not cells or (no_location + outside) / len(rows) > 0.02:
        raise ValueError("Too many shot rows lack usable half-court coordinates")
    output_cells = []
    for (x, y), counts in sorted(cells.items()):
        zones = [sorted(counter, key=lambda label: (-counter[label], label))[0] if counter else None for counter in counts.pop("zones")]
        output_cells.append({"cellX": x, "cellY": y, "zoneBasic": zones[0], "zoneRange": zones[1], "zoneArea": zones[2], **counts, "gbm": None, "baseline": None})
    return {"season": season, "generatedAt": generated_at, "source": {
        "provider": "NBA Stats ShotChartDetail", "url": source_url(season), "fetchedAt": fetched_at,
        "firstGameDate": min(dates), "lastGameDate": max(dates), "gameIds": sorted(game_ids),
        "shotCount": len(rows), "droppedNoLocation": no_location, "droppedOutsideHalfCourt": outside,
    }, "cells": output_cells}


def publish(snapshot: dict, output: Path, expected_game_ids: list[str] | None = None) -> bool:
    if expected_game_ids is not None and not set(expected_game_ids).issubset(snapshot["source"]["gameIds"]):
        raise ValidationFailure("Provider shot coverage is missing expected completed games")
    if output.exists():
        previous = json.loads(output.read_text()).get("snapshot")
        if previous and previous["season"] == snapshot["season"]:
            if not set(previous["source"]["gameIds"]).issubset(snapshot["source"]["gameIds"]) or previous["source"]["shotCount"] > snapshot["source"]["shotCount"]:
                raise ValidationFailure("Provider response regressed; preserving prior snapshot")
            if previous["source"]["shotCount"] == snapshot["source"]["shotCount"] and previous["cells"] == snapshot["cells"] and previous["source"]["gameIds"] == snapshot["source"]["gameIds"]:
                return False
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=output.parent, delete=False) as handle:
        temp_path = Path(handle.name)
        try:
            json.dump({"schemaVersion": 1, "snapshot": snapshot}, handle, separators=(",", ":"), allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise
    os.replace(temp_path, output)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    year = current_season_start_year()
    parser.add_argument("--season", default=f"{year}-{str(year + 1)[-2:]}")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "src/data/shot-quality-current.json")
    parser.add_argument("--expected-game-ids", type=Path, help="Optional JSON array of NBA regular-season game IDs that must be covered")
    parser.add_argument("--timeout", type=float, default=20)
    args = parser.parse_args()
    if not valid_season(args.season) or args.timeout <= 0:
        parser.error("Valid season and positive timeout required")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        for attempt in range(2):
            try:
                payload = fetch_payload(source_url(args.season), args.timeout)
                try:
                    snapshot = build_snapshot(payload, args.season, datetime.now(timezone.utc).isoformat())
                except (ValueError, TypeError, KeyError, AttributeError) as error:
                    raise ValidationFailure() from error
                if snapshot is not None:
                    break
            except Exception as error:
                if attempt == 1:
                    raise
                logger.warning("Shot fetch failed (%s); retrying once", failure_reason(error))
            if attempt == 0:
                time.sleep(1)
        if snapshot is None:
            logger.info("Provider response contains no shots for %s; prior artifact preserved", args.season)
            return 3
        expected = json.loads(args.expected_game_ids.read_text()) if args.expected_game_ids else None
        if expected is not None and (not isinstance(expected, list) or any(not isinstance(value, str) for value in expected)):
            raise ValueError("Expected game IDs must be a JSON string array")
        changed = publish(snapshot, args.output, expected)
        logger.info("%s %s: %d games, %d shots, %d cells", "Published" if changed else "Unchanged", args.season, len(snapshot["source"]["gameIds"]), snapshot["source"]["shotCount"], len(snapshot["cells"]))
        return 0
    except Exception as error:
        write_failure_reason(error)
        logger.error("Shot publication failed (%s); prior artifact preserved", failure_reason(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
