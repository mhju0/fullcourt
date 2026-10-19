"""Validated regular-season inputs and uncertainty guards for Availability producers."""
from __future__ import annotations

import hashlib
import json
import sys
from decimal import Decimal
from collections import Counter, defaultdict, deque
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.player_appearance_history import minutes_value, participation  # noqa: E402

CONTEXT = ROOT / "src/data/player-appearance-context.json"


def apply_team_identity_overrides(box: pd.DataFrame, sides: pd.DataFrame, overrides: list[dict]) -> pd.DataFrame:
    reviewed = ("36", "0029600070")
    present = (box.person_id.astype(str) == reviewed[0]) & (box.game_id.astype(str).str.zfill(10) == reviewed[1])
    if present.any() and not overrides:
        raise ValueError("Missing accepted Availability team identity correction")
    if len(overrides) > 1:
        raise ValueError("Only one reviewed Availability team identity override is accepted")
    box = box.copy()
    for correction in overrides:
        if (correction["personId"], correction["gameId"]) != reviewed:
            raise ValueError("Unreviewed Availability team identity override")
        match = (box.person_id.astype(str) == correction["personId"]) & (box.game_id.astype(str).str.zfill(10) == correction["gameId"])
        if int(match.sum()) != 1:
            raise ValueError("Availability team identity correction requires exactly one cache row")
        row = box.loc[match].iloc[0]
        columns = {"team_id", "team_tricode", "side"}
        if set(correction["before"]) != columns or set(correction["after"]) != columns:
            raise ValueError("Availability identity correction may change only three identity fields")
        if any(str(row[col]) != value for col, value in correction["before"].items()):
            raise ValueError("Availability identity correction before-value drift")
        expected_stats = correction["expectedStats"]
        required = {"minutes", "points", "field_goals_made", "field_goals_attempted", "three_pointers_made", "three_pointers_attempted", "free_throws_made", "free_throws_attempted"}
        if set(expected_stats) != required:
            raise ValueError("Availability identity correction requires every reviewed stat assertion")
        for col, value in expected_stats.items():
            equal = str(row[col]) == value if col == "minutes" else Decimal(str(row[col])) == Decimal(value)
            if not equal:
                raise ValueError("Availability identity correction shooting/minute input drift")
        fixture = sides[sides.external_id == correction["gameId"]]
        if len(fixture) != 2 or set(fixture.date) != {correction["date"]}:
            raise ValueError("Availability identity correction fixture/date mismatch")
        for identity in [correction["before"], correction["after"]]:
            side = fixture[fixture.side == identity["side"]]
            if len(side) != 1 or side.iloc[0].team_abbr != identity["team_tricode"]:
                raise ValueError("Availability identity correction canonical team/side mismatch")
        untouched = row.drop(labels=list(columns))
        for col, value in correction["after"].items():
            box.loc[match, col] = value
        if not box.loc[match].iloc[0].drop(labels=list(columns)).equals(untouched):
            raise ValueError("Availability identity correction changed player/game/stat fields")
        game_rows = box[box.game_id.astype(str).str.zfill(10) == correction["gameId"]]
        for canonical in fixture.itertuples():
            if float(game_rows[game_rows.side == canonical.side].points.sum()) != float(canonical.team_score):
                raise ValueError("Availability corrected team scoring totals disagree with canonical fixture")
    return box


def apply_aliases(box: pd.DataFrame, sides: pd.DataFrame, aliases: list[dict]) -> pd.DataFrame:
    if len({a["gameId"] for a in aliases}) != len(aliases) or len({a["canonicalId"] for a in aliases}) != len(aliases):
        raise ValueError("Availability history aliases must be bijective")
    box = box.copy()
    for a in aliases:
        target = sides[sides.external_id == a["canonicalId"]]
        if len(target) != 2 or set(target.side) != {"home", "away"} or set(target.date) != {a["date"]}:
            raise ValueError("Availability alias canonical fixture/date mismatch")
        if a["gameId"] in set(sides.external_id):
            raise ValueError("Availability alias duplicates a canonical NBA fixture")
        source = box[box.external_id == a["gameId"]]
        if source.empty or set(source.side) != {"home", "away"}:
            raise ValueError("Availability alias requires both cached team sides")
        for side in ["home", "away"]:
            team = source[source.side == side]
            canonical = target[target.side == side].iloc[0]
            if canonical.team_abbr != a[side + "Abbr"] or set(team.team_id.astype(int)) != {a[side + "TeamId"]}:
                raise ValueError("Availability alias team/side mismatch")
            official_roster = {str(pid) for pid in a[side + "PlayerIds"]}
            if set(team.person_id) != official_roster or not 5 <= len(team) <= 25:
                raise ValueError("Availability alias roster mismatch")
            for made, attempted in [("field_goals_made", "field_goals_attempted"), ("three_pointers_made", "three_pointers_attempted"), ("free_throws_made", "free_throws_attempted")]:
                if team[[made, attempted]].isna().any().any() or (team[made] < 0).any() or (team[made] > team[attempted]).any():
                    raise ValueError("Availability alias impossible shooting line")
            if (team.three_pointers_attempted > team.field_goals_attempted).any() or not np.allclose(2 * team.field_goals_made + team.three_pointers_made + team.free_throws_made, team.points):
                raise ValueError("Availability alias inconsistent scoring line")
            if float(team.points.sum()) != float(canonical.team_score):
                raise ValueError("Availability alias incomplete team scoring total")
        box.loc[box.external_id == a["gameId"], "external_id"] = a["canonicalId"]
    return box


def join_regular_inputs(box: pd.DataFrame, features: pd.DataFrame, context: dict, adjudicate: bool = True) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    box = box.copy()
    box["external_id"] = box.game_id.astype(str).str.zfill(10)
    box["person_id"] = box.person_id.astype(str)
    if box.duplicated(["external_id", "person_id"]).any():
        raise ValueError("Duplicate Availability player/game cache identity")
    years = set(box.season.astype(str))
    sides = features[(features.status == "final") & (features.game_type == "regular") & features.season.str[:4].isin(years)].copy()
    sides["external_id"] = sides.external_id.astype(str).str.zfill(10)
    sides["side"] = np.where(sides.is_home == 1, "home", "away")
    if sides.duplicated(["external_id", "side"]).any() or sides.duplicated(["game_id", "team_id"]).any():
        raise ValueError("Duplicate canonical Availability fixture side")
    if any(set(g.side) != {"home", "away"} for _, g in sides.groupby("game_id")):
        raise ValueError("Incomplete canonical Availability fixture")
    if context.get("dataVersion") != "1.0.4":
        raise ValueError("Unexpected Availability player context revision")
    if adjudicate:
        box = apply_team_identity_overrides(box, sides, context.get("teamIdentityOverrides", []))
    box = apply_aliases(box, sides, context.get("historyAliases", []))
    seen = set(zip(box.external_id, box.side))
    missing = [(r.external_id, r.side) for r in sides.itertuples() if (r.external_id, r.side) not in seen]
    if missing:
        raise ValueError(f"Missing canonical regular fixtures before Availability windows: {missing[:5]} ({len(missing)} sides)")
    states, mins = [], []
    for raw in box[["minutes", "comment", "field_goals_attempted", "free_throws_attempted"]].fillna("").to_dict("records"):
        if adjudicate:
            state, minute = participation(raw)
            if state == "did_not_play":
                minute = 0.0
        else:
            minute = minutes_value(raw["minutes"]) or 0.0
            state = "played" if minute > 0 else "did_not_play"
        states.append(state)
        mins.append(minute)
    box["participation"] = states
    box["min"] = mins
    if adjudicate:
        index = {(str(pid), str(gid).zfill(10)): i for i, (pid, gid) in enumerate(zip(box.person_id, box.game_id))}
        for resolution in context.get("resolutions", []):
            key = (str(resolution["pid"]), resolution["gid"])
            if key not in index:
                raise ValueError("Availability source resolution has no cached player/game")
            i = index[key]
            raw_minutes = "" if pd.isna(box.at[i, "minutes"]) else box.at[i, "minutes"]
            raw_comment = "" if pd.isna(box.at[i, "comment"]) else box.at[i, "comment"]
            if (raw_minutes, raw_comment) != (resolution["rawMinutes"], resolution["rawComment"]):
                raise ValueError("Availability source resolution raw cache drift")
            if resolution["state"] not in {"played", "did_not_play"}:
                raise ValueError("Availability accepts only conclusive source overrides")
            box.at[i, "participation"] = resolution["state"]
            box.at[i, "min"] = 0.0 if resolution["state"] == "did_not_play" else minutes_value(resolution["minutes"])
    box["qualifying_min"] = box["min"]
    recorded_minutes = box.minutes.map(minutes_value)
    box.loc[box["qualifying_min"].isna() & (recorded_minutes == 0), "qualifying_min"] = 0.0
    play = box.drop(columns=["team_id", "game_id", "season"], errors="ignore").merge(
        sides[["game_id", "external_id", "date", "season", "team_id", "side"]],
        on=["external_id", "side"], how="inner", validate="many_to_one",
    )
    if play.duplicated(["game_id", "person_id"]).any():
        raise ValueError("Duplicate Availability player/game after canonical join")
    play["person_id"] = play.person_id.astype("int64")
    coverage = {"dataVersion": context["dataVersion"], "adjudicated": adjudicate,
                "canonicalRegularSides": len(sides), "matchedCanonicalRegularSides": len(seen.intersection(set(zip(sides.external_id, sides.side)))),
                "missingCanonicalSides": 0, "firstCacheSeason": min(sides.season), "lastCacheSeason": max(sides.season),
                "teamIdentityOverrides": len(context.get("teamIdentityOverrides", [])) if adjudicate else 0,
                "historyAliases": len(context.get("historyAliases", [])), "sourceResolutions": len(context.get("resolutions", [])) if adjudicate else 0,
                "qualifyingAppearanceRule": "recorded positive minutes; confirmed participation is separate",
                "playerParticipation": dict(Counter(play.participation)), "playedUnknownMinutes": int(((play.participation == "played") & play["min"].isna()).sum()),
                "rotationWindowHoldouts": 0, "currentRotationHoldouts": 0, "qualityWindowHoldouts": 0}
    return play, sides, coverage


def load_regular_inputs(shooting: Path, features: Path, context_path: Path = CONTEXT, adjudicate: bool = True) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    paths = sorted(shooting.glob("player_boxscores_*.csv"))
    box = pd.concat([pd.read_csv(p, dtype={"game_id": str, "person_id": str, "team_id": str, "season": str}, low_memory=False) for p in paths], ignore_index=True)
    features_frame = pd.read_csv(features, usecols=["game_id", "external_id", "date", "season", "team_id", "team_abbr", "is_home", "status", "game_type", "team_score"], low_memory=False)
    play, sides, coverage = join_regular_inputs(box, features_frame, json.loads(context_path.read_text()), adjudicate)
    source_paths = [*paths, features, context_path, Path(__file__), ROOT / "scripts/player_appearance_history.py"]
    coverage["sourceHashes"] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}
    return play, sides, coverage


def roster_records(group: pd.DataFrame, quality: list[str] = ()) -> dict:
    columns = ["person_id", "min", "participation", "qualifying_min", *quality]
    return {row[0]: dict(zip(columns[1:], row[1:])) for row in group[columns].itertuples(index=False, name=None)}


def rotation_window_uncertain(window: deque, min_appearances: int, rotation_minutes: float = 15.0) -> bool:
    known, possible = defaultdict(list), defaultdict(list)
    for past in window:
        for pid, rec in past.items():
            minutes = rec.get("qualifying_min", rec["min"])
            if rec["participation"] == "unknown" or (rec["participation"] == "played" and pd.isna(minutes)):
                if pd.isna(minutes) or minutes > 0:
                    possible[pid].append(None if pd.isna(minutes) else minutes)
            elif rec["participation"] == "played" and minutes > 0:
                known[pid].append(minutes)
    for pid, options in possible.items():
        confirmed = known[pid]
        if len(confirmed) + len(options) < min_appearances:
            continue
        if any(value is None for value in options):
            return True
        # Known clock values bound every optional subset; blank clocks have no such bound.
        ordered = sorted(options, reverse=True)
        for count in range(len(options) + 1):
            appearances = len(confirmed) + count
            if appearances >= min_appearances and (sum(confirmed) + sum(ordered[:count])) / appearances >= rotation_minutes:
                return True
    return False


def available_now(current: dict, pid: str) -> bool | None:
    if pid not in current or current[pid]["participation"] == "did_not_play":
        return False
    if current[pid]["participation"] == "played":
        return True
    return None


def attach_prior_quality(play: pd.DataFrame, columns: dict[str, str], window: int, minimum: int) -> pd.DataFrame:
    play = play.sort_values(["person_id", "date", "game_id"]).copy()
    qualifying_minutes = play.get("qualifying_min", play["min"])
    ambiguous = ((play.participation == "unknown") & (qualifying_minutes.isna() | (qualifying_minutes > 0))) | ((play.participation == "played") & qualifying_minutes.isna())
    play["_unknown_count"] = ambiguous.astype(int).groupby(play.person_id).cumsum()
    appeared = play[(play.participation == "played") & (play["min"] > 0)].copy()
    for col, out in columns.items():
        appeared[out] = appeared.groupby("person_id")[col].transform(
            lambda values: values.shift(1).rolling(window, min_periods=minimum).mean()
        )
        play[out] = appeared[out]
    first_selected_unknown_count = appeared.groupby("person_id")["_unknown_count"].shift(window).fillna(0)
    optional_appearances = appeared["_unknown_count"] - first_selected_unknown_count
    prior_appearances = appeared.groupby("person_id").cumcount().clip(upper=window)
    play["q_uncertain"] = ((optional_appearances > 0) & (prior_appearances + optional_appearances >= minimum)).reindex(play.index, fill_value=False)
    return play.drop(columns="_unknown_count")


def write_coverage(path: Path, coverage: dict, producer: Path, table: Path, team_games: int, game_ids) -> dict:
    hashes = {**coverage["sourceHashes"], str(producer.relative_to(ROOT)): hashlib.sha256(producer.read_bytes()).hexdigest(),
              str(table.relative_to(ROOT)): hashlib.sha256(table.read_bytes()).hexdigest()}
    ids = sorted(int(gid) for gid in game_ids)
    public = {k: v for k, v in coverage.items() if k != "sourceHashes"}
    public.update(eligibleTeamGames=team_games, regressionGames=len(ids),
                  regressionCohortSha256=hashlib.sha256(json.dumps(ids, separators=(",", ":")).encode()).hexdigest(),
                  inputSha256=hashlib.sha256(json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()).hexdigest())
    path.write_text(json.dumps({**public, "sourceHashes": hashes, "regressionGameIds": ids}, indent=2) + "\n")
    return public
