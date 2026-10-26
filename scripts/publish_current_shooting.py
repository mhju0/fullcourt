"""Publish an observed ESPN player-box snapshot; never write the application DB.

Uses scored canonical DB finals as the coverage denominator. Every source event is
matched by Eastern date, home/away franchises and final scores, never by player
name or by treating ESPN athlete IDs as NBA person IDs. A missing or ambiguous
fixture/box score holds publication and preserves the previous snapshot.

Usage: python scripts/publish_current_shooting.py --season 2026-27 --output PATH
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import urllib.request
from zoneinfo import ZoneInfo

from player_appearance_history import annotate_outcomes, prove_history_windows

BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
ET = ZoneInfo("America/New_York")
ABBR = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}


class ShootingUnavailable(ValueError):
    pass


def get_json(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "FullCourt/1.0"}), timeout=30) as response:
        return json.load(response)


def eastern_day(value: str) -> date:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(ET).date()


def identity(competition: dict) -> tuple:
    sides = {row["homeAway"]: row for row in competition["competitors"]}
    if set(sides) != {"home", "away"} or len(competition["competitors"]) != 2:
        raise ValueError("Expected exactly one home and away competitor")
    return (eastern_day(competition["date"]),
            *(ABBR.get(sides[side]["team"]["abbreviation"], sides[side]["team"]["abbreviation"]) for side in ("home", "away")),
            *(int(sides[side]["score"]) for side in ("home", "away")))


def fixture_key(fixture: dict) -> tuple:
    return (fixture["date"], fixture["home"], fixture["away"], fixture["homeScore"], fixture["awayScore"])


def match_event(fixture: dict, scoreboard: dict, end_year: int) -> str:
    matches = []
    for event in scoreboard.get("events", []):
        if event.get("season", {}).get("year") != end_year or event.get("season", {}).get("type") not in ({2} if fixture.get("gameType", "regular") == "regular" else {2, 3}):
            continue
        for competition in event.get("competitions", []):
            if competition.get("status", {}).get("type", {}).get("completed") is not True:
                continue
            if identity(competition) == fixture_key(fixture):
                matches.append(str(event["id"]))
    if len(matches) != 1:
        raise ValueError(f"Expected one verified ESPN fixture for {fixture['gid']}; found {len(matches)}")
    return matches[0]


def pair(value: str) -> tuple[int, int]:
    if not re.fullmatch(r"\d+-\d+", value):
        raise ValueError("Invalid ESPN made-attempted shooting line")
    made, attempts = map(int, value.split("-"))
    if not 0 <= made <= attempts:
        raise ValueError("Impossible ESPN shooting line")
    return made, attempts


def parse_summary(summary: dict, fixture: dict, event_id: str, end_year: int) -> tuple[list[dict], list[dict]]:
    header = summary["header"]
    competitions = header["competitions"]
    if (str(header["id"]) != event_id or header["season"]["year"] != end_year or
            header["season"]["type"] not in ({2} if fixture.get("gameType", "regular") == "regular" else {2, 3}) or len(competitions) != 1 or
            competitions[0]["status"]["type"].get("completed") is not True or
            identity(competitions[0]) != fixture_key(fixture)):
        raise ValueError("Summary does not match the verified scored regular final")
    groups = summary["boxscore"]["players"]
    if len(groups) != 2:
        raise ValueError("Missing ESPN team box score")
    outcomes, history, seen = [], [], set()
    observed_teams = set()
    for group in groups:
        raw_team = group["team"]["abbreviation"]
        team = ABBR.get(raw_team, raw_team)
        if team in observed_teams or team not in (fixture["home"], fixture["away"]):
            raise ValueError("Duplicate or unexpected boxscore franchise")
        observed_teams.add(team)
        blocks = group["statistics"]
        if len(blocks) != 1:
            raise ValueError("Ambiguous ESPN statistics blocks")
        block = blocks[0]
        labels = block["labels"]
        if len(set(labels)) != len(labels) or not {"MIN", "PTS", "FG", "3PT", "FT"}.issubset(labels):
            raise ValueError("Missing ESPN shooting columns")
        points, played_count = 0, 0
        for entry in block["athletes"]:
            athlete = entry["athlete"]
            pid = "espn:" + str(athlete["id"])
            if pid in seen:
                raise ValueError("Duplicate athlete in one ESPN fixture")
            seen.add(pid)
            if entry.get("didNotPlay") is True:
                if entry.get("stats"):
                    raise ValueError("DNP entry unexpectedly has observed statistics")
                continue
            if len(entry.get("stats", [])) != len(labels):
                raise ValueError("Incomplete ESPN athlete statistics")
            stats = dict(zip(labels, entry["stats"]))
            fgm, fga = pair(stats["FG"])
            fg3m, fg3a = pair(stats["3PT"])
            ftm, fta = pair(stats["FT"])
            pts = int(stats["PTS"])
            if not (fg3m <= fgm and fg3a <= fga and pts == 2 * fgm + fg3m + ftm):
                raise ValueError("Inconsistent ESPN athlete scoring totals")
            minutes = stats["MIN"]
            if minutes == "--":
                minute_value = None
            else:
                if not isinstance(minutes, str) or not re.fullmatch(r"\d+(?::\d{1,2})?", minutes):
                    raise ValueError("Unknown ESPN participation minutes")
                minute_value = sum(float(part) / (60 ** i) for i, part in enumerate(minutes.split(":")))
                if ":" in minutes and int(minutes.split(":")[1]) >= 60:
                    raise ValueError("Invalid ESPN elapsed minutes")
            state = "played" if (minute_value is not None and minute_value > 0) or fga > 0 or fta > 0 else "unknown"
            history.append({"pid": pid, "gid": fixture["gid"], "date": fixture["date"], "state": state, "min": minute_value})
            points += pts
            played_count += state == "played"
            if fga:
                outcomes.append({"pid": pid, "name": athlete["displayName"], "gid": fixture["gid"],
                                 "date": fixture["date"], "team": team,
                                 "pos": athlete.get("position", {}).get("abbreviation", ""),
                                 "fgm": fgm, "fga": fga, "fg3m": fg3m})
        expected = fixture["homeScore"] if team == fixture["home"] else fixture["awayScore"]
        if points != expected or not 5 <= played_count <= 25:
            raise ValueError("Incomplete ESPN team scoring/participation coverage")
    return outcomes, history


def build_snapshot(fixtures: list[dict], summaries: dict[str, dict], event_ids: dict[str, str], season: str) -> dict:
    year = int(season[:4])
    if not re.fullmatch(r"\d{4}-\d{2}", season) or season != f"{year}-{str(year + 1)[-2:]}":
        raise ValueError("Invalid season label")
    if len({fixture['gid'] for fixture in fixtures}) != len(fixtures) or len({fixture_key(fixture) for fixture in fixtures}) != len(fixtures):
        raise ValueError("Duplicate canonical fixture identity")
    missing = sorted({row["gid"] for row in fixtures} - summaries.keys())
    if missing:
        raise ValueError(f"Missing current-season Shooting games: {missing}")
    regular_fixtures = [row for row in fixtures if row.get("gameType", "regular") == "regular"]
    if regular_fixtures and min(row["date"] for row in regular_fixtures) - timedelta(days=30) < date(year, 7, 1):
        raise ValueError("Current-only history does not cover the first outcome's complete 30-day window")
    outcomes, history = [], []
    for fixture in sorted(fixtures, key=lambda row: (row["date"], row["gid"])):
        if fixture["homeScore"] < 0 or fixture["awayScore"] < 0 or fixture["homeScore"] == fixture["awayScore"] or fixture["home"] == fixture["away"]:
            raise ValueError("Invalid canonical final")
        if fixture["date"] < date(year, 7, 1) or fixture["date"] >= date(year + 1, 7, 1):
            raise ValueError("Fixture is outside its season")
        rows, appearances = parse_summary(summaries[fixture["gid"]], fixture, event_ids[fixture["gid"]], year + 1)
        if fixture.get("gameType", "regular") == "regular":
            outcomes.extend(rows)
        history.extend(appearances)
    dates = {row["gid"]: row["date"] for row in fixtures}
    regular = [row for row in fixtures if row.get("gameType", "regular") == "regular"]
    if not regular:
        raise ShootingUnavailable("No completed regular finals; retain the previous snapshot")
    prove_history_windows(outcomes, dates, set(summaries))
    annotated, audit = annotate_outcomes(outcomes, history, {})
    by_pid = defaultdict(list)
    for row in annotated:
        by_pid[row["pid"]].append(row)
    names, ids, teams, positions, seasons = [], [], [], [], []
    for pid, rows in sorted(by_pid.items()):
        index = len(names)
        names.append(rows[-1]["name"])
        ids.append(pid)
        counts = Counter(row["team"] for row in rows)
        label = "/".join(sorted(counts, key=lambda team: (-counts[team], team))[:2]) + ("+" if len(counts) > 2 else "")
        if label not in teams:
            teams.append(label)
        positions.append(rows[-1]["pos"] if rows[-1]["pos"] in {"G", "F", "C"} else "")
        arms = [rows, [r for r in rows if r["rest"] == 1], [r for r in rows if r["rest"] is not None and 3 <= r["rest"] <= 30]]
        values = []
        for arm in arms:
            attempts = sum(row["fga"] for row in arm)
            numerator = sum(2 * row["fgm"] + row["fg3m"] for row in arm)
            second = sum(4 * row["fgm"] + 5 * row["fg3m"] for row in arm)
            values.append((attempts, 50 * numerator / attempts if attempts else 0, numerator, second))
        whole, tired, rested = values
        seasons.append([index, year, teams.index(label), 0, len(rows), whole[0], whole[1], tired[0], tired[1], rested[0], rested[1],
                        whole[2], tired[2], rested[2], whole[3], tired[3], rested[3]])
    generated = datetime.now(timezone.utc).isoformat()
    return {"version": "current-shooting-1", "generated": generated, "names": names, "playerIds": ids,
            "teams": teams, "pos": positions, "seasons": seasons, "shrunk": [],
            "publication": {"season": season, "source": "ESPN event summaries", "generatedAt": generated,
                            "through": max(row["date"] for row in regular).isoformat() if regular else None,
                            "expectedGames": len(regular), "observedGames": len(regular), "historyGames": len(fixtures), "missingGameIds": [],
                            "emptyArms": sum(r[7] == 0 or r[9] == 0 for r in seasons),
                            "restUncertainOutcomes": audit["counts"].get("restUncertain", 0),
                            "historyScope": "All canonical competitive finals in the season; a first observed appearance has no inferred prior-season rest.",
                            "fixtureIds": sorted(dates),
                            "fixtureIdentitySha256": hashlib.sha256(json.dumps([{**r, "date": r["date"].isoformat()} for r in sorted(fixtures, key=lambda r: r['gid'])], sort_keys=True).encode()).hexdigest()}}


def collect(conn, season: str) -> dict:
    with conn.cursor() as cursor:
        cursor.execute("""SELECT g.external_id, g.date, h.abbreviation, a.abbreviation, g.home_score, g.away_score, g.game_type
            FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id
            WHERE g.season=%s AND g.game_type IN ('regular','playoffs','finals','play_in','cup_final') AND g.status='final' ORDER BY g.date, g.external_id""", (season,))
        fixtures = [dict(zip(("gid", "date", "home", "away", "homeScore", "awayScore", "gameType"), row)) for row in cursor.fetchall()]
    boards, summaries, ids = {}, {}, {}
    for fixture in fixtures:
        day = fixture["date"]
        if day not in boards:
            boards[day] = get_json(f"{BASE}/scoreboard?dates={day:%Y%m%d}&limit=1000")
        event_id = match_event(fixture, boards[day], int(season[:4]) + 1)
        ids[fixture["gid"]] = event_id
        summaries[fixture["gid"]] = get_json(f"{BASE}/summary?event={event_id}")
    return build_snapshot(fixtures, summaries, ids, season)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    import psycopg2
    from export_player_rest import atomic_write_payload
    try:
        with psycopg2.connect(os.environ["DATABASE_URL"]) as conn:
            conn.set_session(readonly=True, autocommit=True)
            payload = collect(conn, args.season)
        atomic_write_payload(args.output, payload)
    except ShootingUnavailable as error:
        logging.info("Shooting source unavailable; last good snapshot retained: %s", error)
        return 3
    except Exception as error:
        logging.error("Shooting publication held; last good snapshot retained: %s", error)
        return 1
    logging.info("Published %s observed player-seasons", len(payload["seasons"]))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    raise SystemExit(main())
