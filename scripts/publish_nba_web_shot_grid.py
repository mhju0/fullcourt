"""Stage an independently validated NBA.com raw shot grid without database access."""
from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
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
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

from collection_failure import EmptyResponse, InvalidResponse, ValidationFailure, failure_reason, write_failure_reason
from publish_current_shot_grid import valid_season
from season_window import current_season_start_year

logger = logging.getLogger("publish_nba_web_shot_grid")
ORIGIN = "https://www.nba.com"
MAX_PAGE_BYTES = 4 * 1024 * 1024
EASTERN = ZoneInfo("America/New_York")
BOX_FIELDS = ("fieldGoalsAttempted", "fieldGoalsMade", "threePointersAttempted", "threePointersMade")


class Budget:
    def __init__(self, seconds=840, timeout=8):
        self.deadline = time.monotonic() + seconds
        self.timeout = min(timeout, 8)

    def remaining(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        return remaining

    def check(self):
        self.remaining()


def require(condition):
    if not condition:
        raise ValidationFailure()


def instant(value):
    require(isinstance(value, str))
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationFailure() from error
    require(parsed.utcoffset() is not None)
    return parsed


class NextDataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.parts = []
        self.count = 0

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("id") == "__NEXT_DATA__":
            self.active = True
            self.count += 1

    def handle_endtag(self, tag):
        if tag == "script":
            self.active = False

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)


def parse_page(body):
    if not body.strip():
        raise EmptyResponse()
    try:
        parser = NextDataParser()
        parser.feed(body.decode("utf-8"))
        require(parser.count == 1)
        payload = json.loads("".join(parser.parts))
        props = payload["props"]["pageProps"]
        require(isinstance(props, dict))
        return props
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InvalidResponse() from error
    except (KeyError, TypeError) as error:
        raise ValidationFailure() from error


def public_url(url):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.netloc == "www.nba.com")


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        public_url(newurl)
        return super().redirect_request(request, fp, code, message, headers, newurl)


def fetch_page_once(url, budget):
    public_url(url)
    budget.check()
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    opener = urllib.request.build_opener(PublicRedirect())
    with opener.open(request, timeout=min(budget.timeout, budget.remaining())) as response:
        public_url(response.geturl())
        chunks, length = [], 0
        while True:
            budget.check()
            chunk = response.read1(min(65536, MAX_PAGE_BYTES + 1 - length))
            budget.check()
            if not chunk:
                break
            chunks.append(chunk)
            length += len(chunk)
            require(length <= MAX_PAGE_BYTES)
    return parse_page(b"".join(chunks))


def retry_delay(error):
    header = error.headers.get("Retry-After") if isinstance(error, HTTPError) and error.headers else None
    if header is None:
        return 1
    value = header.strip()
    if re.fullmatch(r"[0-9]+", value):
        try:
            return int(value)
        except ValueError as invalid:
            raise InvalidResponse() from invalid
    try:
        retry_at = parsedate_to_datetime(value)
        if retry_at.utcoffset() is None:
            raise ValueError()
        return max(0, (retry_at - datetime.now(timezone.utc)).total_seconds())
    except (ValueError, TypeError, OverflowError) as invalid:
        raise InvalidResponse() from invalid


def fetch_page(url, budget):
    for attempt in range(2):
        try:
            return fetch_page_once(url, budget)
        except (HTTPError, URLError, TimeoutError) as error:
            if isinstance(error, HTTPError):
                eligible = error.code == 429 or 500 <= error.code <= 599
                code = error.code
                error.close()
            else:
                eligible = isinstance(error, TimeoutError) or isinstance(error.reason, TimeoutError)
                code = failure_reason(error)
            if attempt or not eligible:
                raise
            delay = retry_delay(error)
            if delay >= budget.remaining():
                raise TimeoutError() from error
            logger.warning("Shot HTTP request failed (%s); retrying once", code)
            time.sleep(delay)
            budget.check()


def team(row):
    require(isinstance(row, dict))
    identifier, tricode, score = row.get("teamId"), row.get("teamTricode"), row.get("score")
    require(type(identifier) is int and identifier > 0)
    require(isinstance(tricode, str) and re.fullmatch(r"[A-Z]{3}", tricode))
    require(type(score) is int and score >= 0)
    return {"id": identifier, "tricode": tricode, "score": score}


def parse_slate(props, day, season, expected_count):
    require(props.get("selectedDate") == day and props.get("hasError") is False)
    feed = props.get("gameCardFeed")
    require(isinstance(feed, dict) and feed.get("nextPageToken") is None and feed.get("previousPageToken") is None)
    modules = feed.get("modules")
    require(isinstance(modules, list))
    cards = []
    for module in modules:
        require(isinstance(module, dict) and isinstance(module.get("cards"), list))
        cards.extend(module["cards"])
    require(expected_count is None or len(cards) == expected_count)
    output, seen = [], set()
    for card in cards:
        require(isinstance(card, dict) and isinstance(card.get("cardData"), dict))
        row = card["cardData"]
        identifier = row.get("gameId")
        require(isinstance(identifier, str) and re.fullmatch(r"\d{10}", identifier) and identifier not in seen)
        seen.add(identifier)
        require(row.get("leagueId") == "00" and row.get("seasonYear") == season)
        require(instant(row.get("gameTimeUtc")).astimezone(EASTERN).date().isoformat() == day)
        require(type(row.get("gameStatus")) is int and row["gameStatus"] in (1, 2, 3))
        if row.get("seasonType") == "Preseason":
            require(re.fullmatch(r"001" + season[2:4] + r"\d{5}", identifier))
            continue
        require(row.get("seasonType") == "Regular Season" and re.fullmatch(r"002" + season[2:4] + r"\d{5}", identifier))
        home, away = team(row.get("homeTeam")), team(row.get("awayTeam"))
        require(home["id"] != away["id"])
        output.append({"id": identifier, "date": day, "tip": instant(row["gameTimeUtc"]),
                       "status": row["gameStatus"], "home": home, "away": away})
    require(expected_count is not None or not output)
    return output


def box_counts(row):
    require(isinstance(row, dict))
    counts = [row.get(key) for key in BOX_FIELDS]
    require(all(type(value) is int and value >= 0 for value in counts))
    fga, fgm, three_a, three_m = counts
    require(fgm <= fga and three_a <= fga and three_m <= three_a and three_m <= fgm)
    return counts


def ngss_geometry(action):
    values = [action.get(key) for key in ("x", "y", "xLegacy", "yLegacy")]
    require(all(type(value) in (int, float) and math.isfinite(value) for value in values))
    x, y, legacy_x, legacy_y = values
    require(0 <= x <= 100 and 0 <= y <= 100 and action.get("side") in ("left", "right"))
    if action["side"] == "left":
        expected_x, expected_y = (25 - y * .5) * 10, (x * .94 - 5.25) * 10
    else:
        expected_x, expected_y = (y * .5 - 25) * 10, (88.75 - x * .94) * 10
    require(abs(legacy_x - expected_x) <= .5 + 1e-7 and abs(legacy_y - expected_y) <= .5 + 1e-7)


def parse_game(props, expected):
    game, pbp = props.get("game"), props.get("playByPlay")
    require(isinstance(game, dict) and isinstance(pbp, dict))
    require(game.get("gameId") == expected["id"] and game.get("gameStatus") == 3)
    require(instant(game.get("gameTimeUTC")) == expected["tip"])
    require(instant(game["gameTimeUTC"]).astimezone(EASTERN).date().isoformat() == expected["date"])
    source = pbp.get("source")
    require(pbp.get("gameId") == expected["id"] and source in ("hanaV3", "ngss"))
    actions = pbp.get("actions")
    require(isinstance(actions, list) and all(isinstance(row, dict) for row in actions))
    team_boxes, player_boxes, player_teams = {}, {}, {}
    for side in ("home", "away"):
        row = game.get(side + "Team")
        require(team(row) == expected[side] and game.get(side + "TeamId") == expected[side]["id"])
        team_id = row["teamId"]
        team_boxes[team_id] = box_counts(row.get("statistics"))
        players = row.get("players")
        require(isinstance(players, list) and players)
        for player in players:
            require(isinstance(player, dict))
            person = player.get("personId")
            require(type(person) is int and person > 0 and person not in player_boxes)
            player_boxes[person] = box_counts(player.get("statistics"))
            player_teams[person] = team_id
    team_totals = {key: [0, 0, 0, 0] for key in team_boxes}
    player_totals = {key: [0, 0, 0, 0] for key in player_boxes}
    seen, shots, heaves = set(), [], 0
    for action in actions:
        qualifiers = action.get("qualifiers")
        if source == "hanaV3":
            special = action.get("actionType") == "Heave" and action.get("subType") == "Team Field Goal Attempt"
        else:
            special = (action.get("actionType") == "heave" and action.get("subType") == "jumpshot"
                       and isinstance(qualifiers, list) and "heave" in qualifiers)
        suspicious = any("heave" in str(action.get(key, "")).lower()
                         for key in ("actionType", "subType", "description", "qualifiers"))
        suspicious = suspicious or "team field goal" in str(action.get("subType", "")).lower()
        require(not suspicious or special)
        if action.get("isFieldGoal") != 1 and not special:
            continue
        number = action.get("actionNumber")
        require(type(number) is int and number > 0 and number not in seen)
        seen.add(number)
        if special:
            require(type(action.get("isFieldGoal")) is int and action["isFieldGoal"] == 0)
            if source == "hanaV3":
                require(action.get("location") in ("h", "v"))
                require(all(action.get(key) == 0 for key in ("teamId", "personId", "shotValue", "xLegacy", "yLegacy")))
                require(action.get("shotResult") == "")
            else:
                person, team_id = action.get("personId"), action.get("teamId")
                require(team_id in team_boxes and type(person) is int and person >= 0)
                require(person == 0 or person in player_teams and player_teams[person] == team_id)
                require(all(key in action and action[key] is None for key in ("xLegacy", "yLegacy", "x", "y")))
                require(action.get("shotResult") is None and action.get("shotValue") is None)
            heaves += 1
            continue
        person, team_id = action.get("personId"), action.get("teamId")
        require(person in player_teams and player_teams[person] == team_id and team_id in team_boxes)
        require(type(action.get("isFieldGoal")) is int and action.get("shotResult") in ("Made", "Missed"))
        if source == "hanaV3":
            value = action.get("shotValue")
            require(value in (2, 3))
        else:
            require(action.get("actionType") in ("2pt", "3pt") and action.get("shotValue") is None)
            value = 2 if action["actionType"] == "2pt" else 3
            ngss_geometry(action)
        made, three = int(action["shotResult"] == "Made"), int(value == 3)
        increments = (1, made, three, made * three)
        for total in (team_totals[team_id], player_totals[person]):
            for index, value in enumerate(increments):
                total[index] += value
        shots.append({"actionNumber": number, "x": action.get("xLegacy"), "y": action.get("yLegacy"),
                      "made": made, "three": three})
    require(team_boxes == team_totals and player_boxes == player_totals)
    require(shots)
    return {"gameId": expected["id"], "date": expected["date"], "format": source,
            "shots": shots, "teamFieldGoalAttempts": heaves}


def build_snapshot(results, season, started_at, fetched_at):
    require(valid_season(season) and results)
    started, fetched = instant(started_at), instant(fetched_at)
    require(started <= fetched)
    cells = defaultdict(lambda: {"fga": 0, "fgm": 0, "fg3a": 0, "fg3m": 0})
    no_location = outside = total = heaves = 0
    formats = {"hanaV3": 0, "ngss": 0}
    game_ids, dates = [], []
    for result in results:
        require(result["gameId"] not in game_ids)
        game_ids.append(result["gameId"])
        require(result["format"] in formats)
        formats[result["format"]] += 1
        dates.append(result["date"])
        heaves += result["teamFieldGoalAttempts"]
        no_location += result["teamFieldGoalAttempts"]
        total += len(result["shots"]) + result["teamFieldGoalAttempts"]
        for shot in result["shots"]:
            try:
                x, y = float(shot["x"]), float(shot["y"])
            except (ValueError, TypeError):
                no_location += 1
                continue
            if not math.isfinite(x) or not math.isfinite(y):
                no_location += 1
                continue
            require(abs(x) <= 400)
            if not (-250 <= x < 250 and -50 <= y < 420):
                outside += 1
                continue
            cell = cells[(math.floor(x / 10), math.floor(y / 10))]
            cell["fga"] += 1
            cell["fgm"] += shot["made"]
            cell["fg3a"] += shot["three"]
            cell["fg3m"] += shot["made"] * shot["three"]
    require(total > 0 and (no_location + outside) / total <= 0.02)
    output = [{"cellX": x, "cellY": y, "zoneBasic": None, "zoneRange": None, "zoneArea": None,
               **counts, "gbm": None, "baseline": None} for (x, y), counts in sorted(cells.items())]
    return {"season": season, "generatedAt": fetched_at, "source": {
        "provider": "NBA.com play-by-play", "url": ORIGIN + "/games", "collectionStartedAt": started_at,
        "formatGameCounts": formats,
        "fetchedAt": fetched_at, "firstGameDate": min(dates), "lastGameDate": max(dates),
        "gameIds": sorted(game_ids), "shotCount": total, "teamFieldGoalAttempts": heaves,
        "droppedNoLocation": no_location, "droppedOutsideHalfCourt": outside,
    }, "cells": output}


def calendar(props, days):
    years = props.get("allGamesInCurrentYear")
    require(isinstance(years, dict))
    for year, entries in years.items():
        require(isinstance(year, str) and re.fullmatch(r"\d{4}", year) and isinstance(entries, dict))
        for key, count in entries.items():
            require(isinstance(key, str) and re.fullmatch(year + r"-\d{2}-\d{2}", key))
            try:
                date.fromisoformat(key)
            except ValueError as error:
                raise ValidationFailure() from error
            require(type(count) is int and count >= 0)
    counts = {}
    for day in days:
        year = years.get(day[:4])
        require(isinstance(year, dict))
        counts[day] = year.get(day)
    return counts


def parallel(items, function, budget):
    executor = ThreadPoolExecutor(max_workers=3)
    futures = []
    try:
        for item in items:
            budget.check()
            futures.append(executor.submit(function, item))
        return [future.result() for future in as_completed(futures, timeout=budget.remaining())]
    finally:
        for future in futures:
            future.cancel()
        executor.shutdown(wait=True, cancel_futures=True)


def final_signature(rows):
    return sorted((row["id"], row["date"], row["tip"], tuple(row["home"].values()), tuple(row["away"].values()))
                  for row in rows if row["status"] == 3)


def collect(season, fetch=fetch_page, now=lambda: datetime.now(timezone.utc), budget=None):
    require(valid_season(season))
    budget = budget or Budget()
    started = now()
    today = started.astimezone(EASTERN).date()
    first = date(int(season[:4]), 10, 1)
    require(first <= today < date(int(season[:4]) + 1, 10, 1))
    days = [(first + timedelta(days=offset)).isoformat() for offset in range((today - first).days + 1)]
    current = fetch(ORIGIN + "/games?date=" + today.isoformat(), budget)
    counts = calendar(current, days)
    slates = {today.isoformat(): parse_slate(current, today.isoformat(), season, counts[today.isoformat()])}
    active = [day for day in days if counts[day] != 0 and day != today.isoformat()]
    def get_slate(day):
        budget.check()
        return day, parse_slate(fetch(ORIGIN + "/games?date=" + day, budget), day, season, counts[day])
    slates.update(parallel(active, get_slate, budget))
    rows = [row for slate in slates.values() for row in slate]
    require(len({row["id"] for row in rows}) == len(rows))
    finals = [row for row in rows if row["status"] == 3]
    def get_game(row):
        budget.check()
        url = ORIGIN + "/game/" + row["away"]["tricode"].lower() + "-vs-" + row["home"]["tricode"].lower() + "-" + row["id"] + "/box-score"
        return parse_game(fetch(url, budget), row)
    results = parallel(finals, get_game, budget)
    recheck = sorted({today.isoformat()} | {day for day in days if counts[day] is None}
                     | {row["date"] for row in rows if row["status"] != 3})
    def check_slate(day):
        budget.check()
        props = fetch(ORIGIN + "/games?date=" + day, budget)
        require(calendar(props, days) == counts)
        checked = parse_slate(props, day, season, counts[day])
        require(final_signature(checked) == final_signature(slates[day]))
    parallel(recheck, check_slate, budget)
    fetched = now()
    require(fetched.astimezone(EASTERN).date() == today)
    budget.check()
    return build_snapshot(results, season, started.isoformat(), fetched.isoformat()) if results else None


def publish(snapshot, output, budget=None, expected_game_ids=None):
    if budget:
        budget.check()
    if expected_game_ids is not None:
        require(set(expected_game_ids).issubset(snapshot["source"]["gameIds"]))
    if output.exists():
        document = json.loads(output.read_text())
        previous = document.get("snapshot")
        if previous and previous["season"] == snapshot["season"]:
            require(set(previous["source"]["gameIds"]).issubset(snapshot["source"]["gameIds"]))
            require(previous["source"]["shotCount"] <= snapshot["source"]["shotCount"])
            ignore = {"collectionStartedAt", "fetchedAt"}
            old_source = {key: value for key, value in previous["source"].items() if key not in ignore}
            new_source = {key: value for key, value in snapshot["source"].items() if key not in ignore}
            if document.get("schemaVersion") == 2 and old_source == new_source and previous["cells"] == snapshot["cells"]:
                return False
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=output.parent, delete=False) as handle:
            temp_path = Path(handle.name)
            json.dump({"schemaVersion": 2, "snapshot": snapshot}, handle, separators=(",", ":"), allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        if budget:
            budget.check()
        os.replace(temp_path, output)
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    year = current_season_start_year()
    parser.add_argument("--season", default=f"{year}-{str(year + 1)[-2:]}")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-game-ids", type=Path)
    parser.add_argument("--timeout", type=float, default=8)
    parser.add_argument("--budget-seconds", type=float, default=840)
    args = parser.parse_args()
    if not valid_season(args.season) or not 0 < args.timeout <= 8 or not 0 < args.budget_seconds <= 840:
        parser.error("Valid season, timeout up to 8s, and budget up to 840s required")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        budget = Budget(args.budget_seconds, args.timeout)
        expected = json.loads(args.expected_game_ids.read_text()) if args.expected_game_ids else None
        require(expected is None or isinstance(expected, list) and all(isinstance(value, str) for value in expected))
        snapshot = collect(args.season, budget=budget)
        if snapshot is None:
            require(not expected)
            logger.info("Provider response contains no completed regular-season games for %s; prior artifact preserved", args.season)
            return 3
        changed = publish(snapshot, args.output, budget, expected)
        logger.info("%s %s: %d games, %d shots, %d team attempts", "Published" if changed else "Unchanged", args.season,
                    len(snapshot["source"]["gameIds"]), snapshot["source"]["shotCount"], snapshot["source"]["teamFieldGoalAttempts"])
        return 0
    except Exception as error:
        write_failure_reason(error)
        logger.error("Shot publication failed (%s); prior artifact preserved", failure_reason(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
