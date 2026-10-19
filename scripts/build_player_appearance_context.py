"""Build the bounded participation supplement from captured official NBA boxscores."""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from player_appearance_history import CONTEXT_PATH, participation

log = logging.getLogger(__name__)


def normalize_game(path: Path, player_ids: set[str] | None = None) -> tuple[dict, dict]:
    raw = path.read_bytes()
    game = json.loads(raw)["props"]["pageProps"]["game"]
    if game["gameStatus"] != 3:
        raise ValueError("Participation evidence must describe a final game")
    game_id = game["gameId"]
    eastern = datetime.fromisoformat(game["gameTimeUTC"].replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York"))
    url = f"https://www.nba.com/game/{game['awayTeam']['teamTricode'].lower()}-vs-{game['homeTeam']['teamTricode'].lower()}-{game_id}/box-score"
    players = []
    seen = set()
    for side in ("awayTeam", "homeTeam"):
        for row in game[side]["players"]:
            pid = str(row["personId"])
            if player_ids is not None and pid not in player_ids:
                continue
            if pid in seen:
                raise ValueError("Duplicate NBA person ID in official boxscore")
            seen.add(pid)
            stats = row["statistics"]
            minutes = str(stats.get("minutes") or "")
            comment = row.get("comment") or ""
            state, _ = participation({"minutes": minutes, "comment": comment,
                                      "field_goals_attempted": stats.get("fieldGoalsAttempted"),
                                      "free_throws_attempted": stats.get("freeThrowsAttempted")})
            players.append({"personId": pid, "name": f"{row['firstName']} {row['familyName']}".strip(),
                            "minutes": minutes, "comment": comment, "state": state})
    if player_ids is not None and seen != player_ids:
        raise ValueError(f"Requested NBA person ID missing from official boxscore {game_id}")
    return {"gameId": game_id, "date": eastern.date().isoformat(), "players": players}, {
        "gameId": game_id, "url": url, "rawPath": str(path), "sha256": hashlib.sha256(raw).hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("docs/audit/player-appearance-sources"))
    parser.add_argument("--output", type=Path, default=CONTEXT_PATH)
    parser.add_argument("--request-dir", type=Path, default=Path("docs/audit/player-rest-appearance"))
    args = parser.parse_args()
    games, sources = [], []
    for path in sorted(args.source_dir.glob("006*-official-next-data.json")):
        game, source = normalize_game(path)
        if any(row["state"] == "unknown" for row in game["players"]):
            raise ValueError("Cup supplement contains unresolved participation")
        games.append(game)
        sources.append(source)
    if len(games) != 3:
        raise ValueError("Expected the three reviewed Cup finals")
    aliases = []
    requests_path = args.request_dir / "history-alias-requests.json"
    if requests_path.exists():
        for request in json.loads(requests_path.read_text()):
            candidates = list(args.source_dir.rglob(f"{request['gameId']}*-next-data.json"))
            if len(candidates) != 1:
                raise ValueError("History alias requires one captured official NBA source")
            path = candidates[0]
            game, source = normalize_game(path)
            raw_game = json.loads(path.read_text())["props"]["pageProps"]["game"]
            home, away = raw_game["homeTeam"], raw_game["awayTeam"]
            if (game["gameId"], game["date"], home["teamTricode"], away["teamTricode"], home["score"], away["score"]) != (
                request["gameId"], request["date"], request["home"], request["away"], request["homeScore"], request["awayScore"]
            ):
                raise ValueError("Official history alias identity/date/teams/results differ")
            aliases.append({"gameId": game["gameId"], "canonicalId": request["canonicalId"], "date": game["date"],
                            "homeAbbr": home["teamTricode"], "awayAbbr": away["teamTricode"],
                            "homeTeamId": home["teamId"], "awayTeamId": away["teamId"],
                            "homePlayerIds": sorted(str(row["personId"]) for row in home["players"]),
                            "awayPlayerIds": sorted(str(row["personId"]) for row in away["players"]),
                            "sourceUrl": source["url"], "sourceSha256": source["sha256"]})
            sources.append(source)
    resolutions = []
    resolution_path = args.source_dir / "zero-clock-resolution/resolution-rows.json"
    if resolution_path.exists():
        requests = json.loads((args.request_dir / "zero-clock-requests.json").read_text())["resolutionRequests"]
        requests += json.loads((args.request_dir / "positive-minute-dnp-conflicts.json").read_text())
        by_pair = {(row["pid"], row["gid"]): row for row in requests}
        for row in json.loads(resolution_path.read_text()):
            if row["state"] == "unknown":
                continue
            raw = by_pair[(row["pid"], row["gid"])]
            resolutions.append({**row, "state": "did_not_play" if row["state"] == "not_played" else row["state"],
                                "rawMinutes": raw["rawMinutes"], "rawComment": raw["rawComment"]})
    payload = {"dataVersion": "1.0.4", "generatedBy": "scripts/build_player_appearance_context.py",
               "minutesAuthority": "Official NBA embedded boxscore displayed minutes; scorer PDF corroborates participant/FGA sets, with up to two seconds of display variance.",
               "games": games, "sources": sources, "historyAliases": aliases, "resolutions": resolutions}
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    log.info("wrote %d supplemental games to %s", len(games), args.output)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    main()
