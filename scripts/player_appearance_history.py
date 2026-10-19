"""Confirmed competitive NBA appearances, separate from shooting outcome eligibility."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import re
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTEXT_PATH = ROOT / "src/data/player-appearance-context.json"
COMPETITIVE_PREFIXES = {"002", "004", "005", "006"}
NOT_PLAYED = re.compile(r"^(?:DNP|DND|NWT|INACTIVE|DID NOT PLAY|DID NOT DRESS|NOT WITH TEAM)\b", re.I)


def minutes_value(raw: str) -> float | None:
    text = "" if raw is None else str(raw).strip()
    if not text:
        return None
    try:
        if ":" in text:
            if not re.fullmatch(r"[0-9]+:[0-9]+(?:\.[0-9]+)?", text):
                return None
            minutes, seconds = text.split(":")
            # The archive rounds some elapsed durations to mm:60; retain that carry.
            if not 0 <= float(seconds) <= 60:
                return None
            value = float(minutes) + float(seconds) / 60
        else:
            if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", text):
                return None
            value = float(text)
        return value if math.isfinite(value) and value >= 0 else None
    except (ValueError, TypeError):
        return None


def participation(raw: dict) -> tuple[str, float | None]:
    minutes = minutes_value(raw.get("minutes", ""))
    comment = (raw.get("comment") or "").strip()
    if len(comment) >= 2 and comment[0] == comment[-1] and comment[0] in {"'", '"'}:
        comment = comment[1:-1].strip()
    comment = comment.replace("_", " ")
    attempted = int(raw.get("field_goals_attempted") or 0)
    free_throws = int(raw.get("free_throws_attempted") or 0)
    if NOT_PLAYED.match(comment):
        if (minutes is not None and minutes > 0) or attempted or free_throws:
            return "unknown", minutes
        return "did_not_play", None
    if (minutes is not None and minutes > 0) or attempted or free_throws:
        return "played", minutes
    return "unknown", minutes


def load_game_context(conn, context_path: Path = CONTEXT_PATH) -> dict[str, date]:
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT g.external_id, g.date, h.abbreviation, a.abbreviation FROM games g
            JOIN teams h ON h.id = g.home_team_id JOIN teams a ON a.id = g.away_team_id
            WHERE g.status = 'final'
              AND g.game_type IN ('regular', 'playoffs', 'finals', 'play_in', 'cup_final')
        """)
        fixtures = {gid: (day, home, away) for gid, day, home, away in cursor.fetchall()}
    for alias in json.loads(context_path.read_text()).get("historyAliases", []):
        expected = (date.fromisoformat(alias["date"]), alias["homeAbbr"], alias["awayAbbr"])
        if fixtures.get(alias["canonicalId"]) != expected:
            raise ValueError("History alias no longer matches the canonical date and teams")
    return {gid: fixture[0] for gid, fixture in fixtures.items()}


def load_history(cache: Path, dates: dict[str, date], context_path: Path = CONTEXT_PATH) -> tuple[list[dict], dict]:
    records = {}
    counts = Counter()
    context = json.loads(context_path.read_text())
    dates = dict(dates)
    aliases = {row["gameId"]: row for row in context.get("historyAliases", [])}
    if len({row["canonicalId"] for row in aliases.values()}) != len(aliases):
        raise ValueError("History aliases must be bijective")
    for gid, alias in aliases.items():
        if gid in dates or dates.get(alias["canonicalId"]) != date.fromisoformat(alias["date"]):
            raise ValueError("History alias requires one distinct canonical fixture")
        dates[gid] = dates[alias["canonicalId"]]
    for path in sorted(cache.glob("player_boxscores_*.csv")):
        with path.open(newline="", encoding="utf-8") as stream:
            for raw in csv.DictReader(stream):
                gid, pid = raw["game_id"], raw["person_id"]
                if gid[:3] not in COMPETITIVE_PREFIXES or gid not in dates:
                    continue
                if gid in aliases:
                    expected_team = aliases[gid]["homeTeamId" if raw["side"] == "home" else "awayTeamId"]
                    if int(raw["team_id"]) != expected_team:
                        raise ValueError("History alias NBA team ID mismatch")
                key = (pid, gid)
                if key in records:
                    raise ValueError(f"Duplicate appearance identity {key}")
                state, minutes = participation(raw)
                records[key] = {"pid": pid, "gid": gid, "date": dates[gid], "state": state,
                                "min": minutes, "rawMinutes": raw["minutes"], "rawComment": raw["comment"]}
                counts[state] += 1
                if ":" in raw["minutes"] and raw["minutes"].split(":")[-1] == "60":
                    counts["normalizedMinuteCarries"] += 1
    if context["dataVersion"] != "1.0.4":
        raise ValueError("Unexpected player appearance context version")
    for game in context["games"]:
        gid = game["gameId"]
        if gid not in dates or dates[gid].isoformat() != game["date"]:
            raise ValueError(f"Supplemental game date differs from canonical ET date: {gid}")
        for player in game["players"]:
            pid = str(player["personId"])
            key = (pid, gid)
            existing = records.get(key)
            if existing and existing["state"] != "unknown":
                raise ValueError(f"Supplement must not replace a resolved cache appearance: {key}")
            state = player["state"]
            if state not in {"played", "did_not_play", "unknown"}:
                raise ValueError("Invalid supplemental participation state")
            minutes = minutes_value(player["minutes"])
            if state == "played" and minutes is None:
                raise ValueError("Confirmed supplemental appearance needs observed minutes")
            records[key] = {"pid": pid, "gid": gid, "date": dates[gid], "state": state,
                            "min": minutes, "rawMinutes": player["minutes"], "rawComment": player.get("comment", "")}
    for row in context.get("resolutions", []):
        key = (row["pid"], row["gid"])
        existing = records.get(key)
        if not existing or existing["state"] not in {"unknown", row["state"]}:
            raise ValueError(f"Resolution conflicts with a resolved cache record: {key}")
        if existing["rawMinutes"] != row["rawMinutes"] or existing["rawComment"] != row["rawComment"]:
            raise ValueError(f"Resolution cache input changed: {key}")
        if row["state"] not in {"played", "did_not_play"}:
            raise ValueError("Only conclusive source resolutions may override unknown records")
        resolved_minutes = minutes_value(row["minutes"])
        if existing["state"] == "unknown" or existing["min"] is None:
            existing.update(state=row["state"], min=resolved_minutes)
    covered = {row["gid"] for row in records.values()}
    covered.update(alias["canonicalId"] for gid, alias in aliases.items() if gid in covered)
    return [row for row in records.values() if row["state"] != "did_not_play"], {
        "dataVersion": context["dataVersion"], "cachedParticipation": dict(counts),
        "supplementalGames": len(context["games"]), "contextSources": context["sources"],
        "coveredGameIds": sorted(covered), "historyAliases": len(aliases),
        "conclusiveResolutions": len(context.get("resolutions", [])),
    }


def rest_arm(gap: int | None) -> str:
    return "no_rest" if gap == 1 else "rested" if gap is not None and 3 <= gap <= 30 else "excluded"


def prove_history_windows(outcomes: list[dict], dates: dict[str, date], covered: set[str]) -> dict:
    targets = sorted({row["date"] for row in outcomes})
    omitted = []
    for gid, day in dates.items():
        if gid in covered:
            continue
        index = bisect_left(targets, day)
        next_target = targets[index] if index < len(targets) else None
        if next_target is not None and next_target <= day + timedelta(days=30):
            raise ValueError(f"Unobserved competitive game can affect shooting history: {gid}")
        omitted.append({"gid": gid, "date": day.isoformat(),
                        "nextTarget": next_target.isoformat() if next_target else None,
                        "daysToNextTarget": (next_target - day).days if next_target else None})
    return {"lookbackDays": 30, "missingGamesOutsideAllTargetWindows": len(omitted),
            "missingGameIdentitySha256": hashlib.sha256(json.dumps(sorted(omitted, key=lambda row: row["gid"]), sort_keys=True).encode()).hexdigest(),
            "playInNonintersection": [row for row in omitted if row["gid"].startswith("005")]}


def annotate_outcomes(outcomes: list[dict], history: list[dict], birth: dict[str, date]) -> tuple[list[dict], dict]:
    by_player = defaultdict(list)
    for row in history:
        by_player[row["pid"]].append(row)
    indexed = {}
    for pid, rows in by_player.items():
        rows.sort(key=lambda row: (row["date"], row["gid"]))
        if len({row["gid"] for row in rows}) != len(rows):
            raise ValueError(f"Duplicate player/game in history for {pid}")
        known = [row for row in rows if row["state"] == "played"]
        unknown = [row for row in rows if row["state"] == "unknown"]
        indexed[pid] = (known, [row["date"] for row in known], unknown, [row["date"] for row in unknown])
    counts = Counter()
    held = []
    requests = {}
    for row in outcomes:
        pid, current = row["pid"], row["date"]
        known, days, unknown, uncertain_days = indexed.get(pid, ([], [], [], []))
        end = bisect_left(days, current)
        previous = days[end - 1] if end else None
        gap = (current - previous).days if previous else None
        first_unknown = bisect_right(uncertain_days, previous) if previous else 0
        last_unknown = bisect_left(uncertain_days, current)
        relevant = [item for item in unknown[first_unknown:last_unknown] if (current - item["date"]).days <= 30]
        possible_arms = {rest_arm(gap)} | {rest_arm((current - item["date"]).days) for item in relevant}
        rest_unknown = len(possible_arms) > 1
        window = current - timedelta(days=7)
        start = bisect_left(days, window, 0, end)
        uncertain_window = unknown[bisect_left(uncertain_days, window):last_unknown]
        load_unknown = bool(uncertain_window)
        minute_unknown = load_unknown or any(item["min"] is None for item in known[start:end])
        row["rest"] = None if rest_unknown else gap
        row["load7"] = None if load_unknown else end - start
        row["min7"] = None if minute_unknown else sum(item["min"] for item in known[start:end])
        row["restUncertain"] = rest_unknown
        row["restDaysExact"] = not bool(relevant)
        birthday = birth.get(pid)
        row["age"] = current.year - birthday.year - ((current.month, current.day) < (birthday.month, birthday.day)) if birthday else None
        counts["outcomes"] += 1
        counts["restUncertain"] += rest_unknown
        counts["load7Uncertain"] += load_unknown
        counts["min7Uncertain"] += minute_unknown
        if rest_unknown or load_unknown or minute_unknown:
            held.append({"pid": pid, "gid": row["gid"], "rest": rest_unknown, "load7": load_unknown, "min7": minute_unknown})
        for item in relevant if rest_unknown else []:
            requests.setdefault((pid, item["gid"]), {**item, "affectsRest": False, "affectsLoad": False})["affectsRest"] = True
        for item in uncertain_window:
            requests.setdefault((pid, item["gid"]), {**item, "affectsRest": False, "affectsLoad": False})["affectsLoad"] = True
    return outcomes, {"counts": dict(counts), "heldOutcomes": held,
                      "resolutionRequests": [{**row, "date": row["date"].isoformat()} for row in requests.values()]}
