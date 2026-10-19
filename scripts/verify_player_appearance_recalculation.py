"""Compare the repaired producer with the released shooting-outcome and inference protocol."""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

import psycopg2

import analyze_player_shooting as current
from player_appearance_history import rest_arm

ROOT = Path(__file__).resolve().parents[1]
log = logging.getLogger(__name__)


def eb_summary(rows, minimum):
    by_player = defaultdict(list)
    for row in rows:
        by_player[row["pid"]].append(row)
    raw = []
    for games in by_player.values():
        a = current._arm([row for row in games if row["rest"] == 1])
        b = current._arm([row for row in games if current.is_rested(row)])
        if a[1] < minimum or b[1] < minimum:
            continue
        delta = (current.efg(*b) - current.efg(*a)) * 100
        error = math.sqrt(current.efg_se(*a) ** 2 + current.efg_se(*b) ** 2)
        raw.append((delta, error))
    mean = sum(delta for delta, _ in raw) / len(raw)
    variance = sum((delta - mean) ** 2 for delta, _ in raw) / (len(raw) - 1)
    tau = math.sqrt(max(variance - sum(error * error for _, error in raw) / len(raw), 0))
    return {"eligiblePlayers": len(raw), "mean": mean, "tau": tau, "minimumArmFga": minimum}


def eligibility(rows, minimum, career=False):
    key = (lambda row: row["pid"]) if career else (lambda row: (row["pid"], row["season"]))
    return {row[0] for row in current.paired(rows, lambda row: row["rest"] == 1, current.is_rested, minimum, key=key)}


def main():
    url = os.environ.get("DATABASE_URL", "")
    target = urlparse(url)
    if target.hostname != "127.0.0.1" or target.port != 55434 or target.path != "/fullcourt_recalculation" or target.query:
        raise ValueError("Verification requires the explicit corrected local database")
    source = subprocess.check_output(["git", "show", "0f30d345:scripts/analyze_player_shooting.py"], text=True)
    namespace = {"__file__": str(ROOT / "scripts/analyze_player_shooting.py"), "__name__": "released_player_shooting"}
    exec(compile(source, "released_player_shooting.py", "exec"), namespace)
    connection = psycopg2.connect(url)
    connection.set_session(readonly=True)
    try:
        birthday = current.load_birthdays()
        before = namespace["annotate"](namespace["load_player_games"](), namespace["load_game_dates"](connection), birthday)
        after, coverage = current.load_annotated_player_games(connection, birthday)
    finally:
        connection.close()
    identity = lambda row: (row["pid"], row["gid"])
    old = {identity(row): row for row in before}
    new = {identity(row): row for row in after}
    assert len(old) == len(before) and len(new) == len(after)
    assert old.keys() == new.keys(), "Shooting outcome identity set changed"
    for key, row in new.items():
        assert all(row[field] == old[key][field] for field in ("date", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "pts", "season", "team")), key
    assignments = Counter()
    per_season = defaultdict(Counter)
    field_changes = Counter()
    for key, row in new.items():
        previous = old[key]
        a = rest_arm(previous["rest"])
        b = "uncertain" if row["restUncertain"] else rest_arm(row["rest"])
        assignments[f"{a}->{b}"] += 1
        if a != b:
            per_season[row["season"]]["restArmChanged"] += 1
        for field in ("rest", "load7", "min7"):
            field_changes[field] += previous[field] != row[field]
            if previous[field] != row[field]:
                per_season[row["season"]][field + "Changed"] += 1
    cohorts = {}
    for label, minimum, career in (("pairedPlayerSeason", 30, False), ("careerExport", 150, True), ("careerLeaderboard", 250, True)):
        a, b = eligibility(before, minimum, career), eligibility(after, minimum, career)
        cohorts[label] = {"minimumArmFga": minimum, "before": len(a), "after": len(b), "added": len(b - a), "removed": len(a - b)}
    before_eb, after_eb = eb_summary(before, 150), eb_summary(after, 150)
    public = json.loads((ROOT / "public/data/player-rest.json").read_text())
    old_public = json.loads(subprocess.check_output(["git", "show", "0f30d345:public/data/player-rest.json"], text=True))
    assert public["names"] == old_public["names"] and public["teams"] == old_public["teams"]
    assert [row[:7] for row in public["seasons"]] == [row[:7] for row in old_public["seasons"]], "Whole season counts/FGA/eFG changed"
    assert public["empiricalBayes"] == after_eb
    assert public["appearanceCoverage"] == coverage
    wade = ("1629731", "0022300846")
    assert old[wade]["rest"] == 3 and new[wade]["rest"] == 1
    keys = sorted(new)
    identity_bytes = "\n".join(f"{gid}:{pid}" for gid, pid in sorted((gid, pid) for pid, gid in keys)).encode()
    unknown_coverage = {}
    for label, predicate in (("rest", lambda row: row["restUncertain"]),
                             ("load7", lambda row: row["load7"] is None),
                             ("min7", lambda row: row["min7"] is None)):
        held = [row for row in after if predicate(row)]
        unknown_coverage[label] = {"rows": len(held), "fga": sum(row["fga"] for row in held)}
    totals = {field: sum(row[field] for row in after) for field in ("fga", "fgm", "fg3m")}
    summary = {"dataVersion": "1.0.4", "baselineCommit": "0f30d345", "baselineProducerSha256": hashlib.sha256(source.encode()).hexdigest(),
               "outcomes": len(keys), "outcomeIdentitySha256": hashlib.sha256(identity_bytes).hexdigest(),
               "outcomeIdentityEncoding": "sorted gameId:personId pairs separated by newline; no trailing newline",
               "rawOutcomesAndShotTotalsPreserved": True, "totals": totals, "wholePlayerSeasonsPreserved": len(public["seasons"]),
               "restAssignmentMatrix": dict(assignments), "restArmAssignmentsChanged": sum(v for k, v in assignments.items() if k.split("->")[0] != k.split("->")[1]),
               "fieldChanges": dict(field_changes), "changesBySeason": {key: dict(value) for key, value in sorted(per_season.items())},
               "eligibility": cohorts, "coverage": coverage, "unknownHistoryCoverage": unknown_coverage,
               "empiricalBayes": {"before": before_eb, "after": after_eb},
               "wadeWitness": {"pid": wade[0], "gid": wade[1], "beforeDaysSince": old[wade]["rest"], "afterDaysSince": new[wade]["rest"]},
               "artifacts": {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in
                             (ROOT / "public/data/player-rest.json", ROOT / "src/data/player-appearance-context.json", ROOT / "ml/data/shooting/player_shooting.json")}}
    output = ROOT / "docs/audit/player-rest-appearance/producer-summary.json"
    output.write_text(json.dumps(summary, indent=2) + "\n")
    log.info("verified %d unchanged outcomes; %d rest-arm assignments changed; wrote %s", len(keys), summary["restArmAssignmentsChanged"], output)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    main()
