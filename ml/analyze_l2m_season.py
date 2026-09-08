"""Descriptive research counts from an immutable L2M snapshot, never production data."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path

from collect_l2m_season import validate_report


def phase_for(game_id):
    phases = {"002": "regular_season", "004": "playoffs", "005": "play_in", "006": "cup_final"}
    if game_id[:3] not in phases:
        raise ValueError(f"Unknown game phase: {game_id}")
    return phases[game_id[:3]]


def abbr(value):
    return {"NY": "NYK", "GS": "GSW", "SA": "SAS", "NO": "NOP", "UTAH": "UTA", "WSH": "WAS"}.get(value, value)


def exposure(rows):
    grades = Counter(row["grade"] or "ungraded" for game in rows for row in game["events"])
    errors = grades["IC"] + grades["INC"]
    periods = sum(game["reviewed_periods"] for game in rows)
    return {
        "games": len(rows), "reviewed_periods": periods,
        "assessments": sum(grades.values()), "grades": dict(sorted(grades.items())),
        "errors": errors, "games_with_error": sum(game["errors"] > 0 for game in rows),
        "errors_per_game": round(errors / len(rows), 4) if rows else None,
        "errors_per_reviewed_period": round(errors / periods, 4) if periods else None,
    }


def audit_duplicates(events, game_id, source_sha256, reviewed=None):
    seen, pairs = {}, []
    for i, event in enumerate(events):
        signature = json.dumps(event, sort_keys=True)
        if signature in seen:
            pairs.append([seen[signature], i])
        else:
            seen[signature] = i
    if pairs or reviewed:
        if not reviewed or reviewed.get("source_sha256") != source_sha256 or reviewed.get("pairs") != pairs:
            raise ValueError(f"Exact duplicate assessments need review: {game_id} {pairs}")
        if not reviewed.get("reason"):
            raise ValueError(f"Missing duplicate-review reason: {game_id}")
    return pairs


def build(snapshot, games_csv, corrections=None, reviewed_duplicates=None):
    corrections = corrections or {}
    reviewed_duplicates = reviewed_duplicates or {}
    manifest = json.loads((snapshot / "manifest.json").read_text())
    if manifest["failed_reports"]:
        raise ValueError("Incomplete snapshot; fix acquisition before calculating season totals")
    if len(manifest["reports"]) != manifest["indexed_reports"]:
        raise ValueError("Manifest count mismatch")
    if len({r["game_id"] for r in manifest["reports"]}) != manifest["indexed_reports"]:
        raise ValueError("Duplicate game in manifest")
    if hashlib.sha256((snapshot / "index.html").read_bytes()).hexdigest() != manifest["index_sha256"]:
        raise ValueError("Index snapshot hash changed")
    cached = defaultdict(list)
    with games_csv.open() as handle:
        for row in csv.DictReader(handle):
            cached[(row["date_et"], abbr(row["home_abbr"]), abbr(row["away_abbr"]))].append(row)
    games, unknown_joins, stats_mismatch, duplicate_audit = [], [], [], []
    explicit_beneficiaries = 0
    raw_summary_beneficiaries = Counter()
    for record in manifest["reports"]:
        game_id = record["game_id"]
        raw = (snapshot / f"{game_id}.json").read_bytes()
        if hashlib.sha256(raw).hexdigest() != record["sha256"]:
            raise ValueError(f"Source hash changed: {game_id}")
        data = json.loads(raw.decode("utf-8-sig"))
        validate_report(data, game_id)
        meta = data["game"][0]
        date = meta["GameDate"][:10]
        home, away = meta["Home_team_abbr"], meta["Away_team_abbr"]
        candidates = cached[(date, home, away)]
        matched = [r for r in candidates if int(r["home_score"]) == meta["HomeTeamScore"]
                   and int(r["away_score"]) == meta["VisitorTeamScore"]]
        crew, event_id = [], None
        if len(matched) == 1:
            r = matched[0]
            crew = [r[f"official_{i}"] for i in (1, 2, 3)]
            if any(not name for name in crew) or len(set(crew)) != 3:
                crew = []
            else:
                event_id = r["event_id"]
        correction = corrections.get(game_id)
        if correction:
            if (date, home, away) != (correction["expected_date"], correction["expected_home"], correction["expected_away"]):
                raise ValueError(f"Assignment correction metadata mismatch: {game_id}")
            if len(set(correction["officials"])) != 3 or not correction["source_urls"]:
                raise ValueError(f"Invalid sourced assignment correction: {game_id}")
            source_file = Path(correction["source_file"])
            if hashlib.sha256(source_file.read_bytes()).hexdigest() != correction["source_sha256"]:
                raise ValueError(f"Assignment evidence hash changed: {game_id}")
            crew = correction["officials"]
            event_id = correction.get("espn_event_id")
        if not crew:
            unknown_joins.append({"game_id": game_id, "date": date, "home": home, "away": away,
                                  "candidates": len(candidates), "score_matches": len(matched)})
        events = []
        pairs = audit_duplicates(data["l2m"], game_id, record["sha256"], reviewed_duplicates.get(game_id))
        if pairs:
            duplicate_audit.append({"game_id": game_id, "pairs": pairs,
                                    "grades": [data["l2m"][second]["CallRatingName"] for _, second in pairs],
                                    "review": reviewed_duplicates[game_id], "rows_retained": True})
        for i, event in enumerate(data["l2m"]):
            grade = event["CallRatingName"] or ""
            if grade in ("IC", "INC") and event.get("teamIdInFavor"):
                explicit_beneficiaries += 1
            # One video can contain several distinct assessments; row ordinal preserves them.
            events.append({"id": f"{game_id}:{i}", "grade": grade,
                           "period": event["PeriodName"], "clock": event["PCTime"],
                           "call_type": event["CallType"], "video_event": event["VideolLink"]})
        errors = sum(row["grade"] in ("IC", "INC") for row in events)
        stats = next((s for s in data.get("stats", []) if s["stats_name"] == "Errors in Favor"), None)
        if stats:
            raw_summary_beneficiaries["home"] += stats["home"]
            raw_summary_beneficiaries["away"] += stats["away"]
        if not stats or stats["home"] + stats["away"] != errors:
            stats_mismatch.append({"game_id": game_id, "event_errors": errors, "source_summary": stats})
        games.append({"game_id": game_id, "date": date, "phase": phase_for(game_id),
                      "home": home, "away": away, "crew": sorted(crew), "espn_event_id": event_id,
                      "errors": errors, "reviewed_periods": len({e["period"] for e in events}),
                      "events": events, "source": record["report_url"],
                      "assignment_correction": correction})
    phases, months, officials, trios, types = (defaultdict(list) for _ in range(5))
    for game in games:
        phase = game["phase"]
        phases[phase].append(game)
        months[(phase, game["date"][:7])].append(game)
        for name in game["crew"]:
            officials[(phase, name)].append(game)
        if game["crew"]:
            trios[(phase, tuple(game["crew"]))].append(game)
        for event in game["events"]:
            types[(phase, event["call_type"])].append(event)
    result = {
        "season": manifest["season"], "snapshot": str(snapshot),
        "retrieved_at": manifest["finished_at"], "index_url": manifest["index_url"],
        "index_sha256": manifest["index_sha256"],
        "games_csv_sha256": hashlib.sha256(games_csv.read_bytes()).hexdigest(),
        "assignment_corrections_sha256": hashlib.sha256(json.dumps(corrections, sort_keys=True).encode()).hexdigest(),
        "duplicate_assessment_audit": duplicate_audit,
        "coverage": {"indexed": manifest["indexed_reports"], "retrieved": len(games),
                     "joined_crews": len(games) - len(unknown_joins), "unmatched": unknown_joins,
                     "first_date": min(g["date"] for g in games), "last_date": max(g["date"] for g in games),
                     "eligible_game_coverage_audited": False},
        "total": exposure(games),
        "phases": {key: exposure(rows) for key, rows in sorted(phases.items())},
        "months": [{"phase": phase, "month": month, **exposure(rows)}
                   for (phase, month), rows in sorted(months.items())],
        "call_types": [{"phase": phase, "call_type": kind, "assessments": len(rows),
                        "grades": dict(Counter(e["grade"] or "ungraded" for e in rows)),
                        "errors": sum(e["grade"] in ("IC", "INC") for e in rows)}
                       for (phase, kind), rows in sorted(types.items())],
        "official_assignment_exposure": [{"phase": phase, "official": name, **exposure(rows)}
                                        for (phase, name), rows in sorted(officials.items())],
        "exact_trios": [{"phase": phase, "officials": crew, **exposure(rows)}
                        for (phase, crew), rows in sorted(trios.items())],
        "beneficiary_audit": {"explicit_error_beneficiaries": explicit_beneficiaries,
                              "event_errors": sum(g["errors"] for g in games),
                              "raw_source_summary_totals": dict(raw_summary_beneficiaries),
                              "mismatched_games": stats_mismatch,
                              "team_error_tallies_published": False},
        "games": [{k: v for k, v in game.items() if k != "events"} for game in games],
        "limitations": ["NBA-reviewed selected close-game windows only; no full-game accuracy claim.",
                        "Officials are assignment associations, not personal error attribution.",
                        "Grade rates are descriptive; CNC selection is not a census of every possible non-call.",
                        "Beneficiary fields and summary inconsistencies prevent a validated team ledger in this pass."],
    }
    assert sum(p["errors"] for p in result["phases"].values()) == result["total"]["errors"]
    assert sum(m["errors"] for m in result["months"]) == result["total"]["errors"]
    assert sum(t["errors"] for t in result["call_types"]) == result["total"]["errors"]
    joined_errors = sum(g["errors"] for g in games if g["crew"])
    assert sum(o["errors"] for o in result["official_assignment_exposure"]) == joined_errors * 3
    assert sum(o["errors"] for o in result["exact_trios"]) == joined_errors
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--games-csv", type=Path, default=Path("ml/data/referee/games.csv"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--assignment-corrections", type=Path)
    parser.add_argument("--reviewed-duplicates", type=Path)
    args = parser.parse_args()
    corrections = json.loads(args.assignment_corrections.read_text()) if args.assignment_corrections else None
    reviewed = json.loads(args.reviewed_duplicates.read_text()) if args.reviewed_duplicates else None
    result = build(args.snapshot, args.games_csv, corrections, reviewed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"coverage": result["coverage"], "phases": result["phases"],
                      "beneficiary_mismatches": len(result["beneficiary_audit"]["mismatched_games"])}))


if __name__ == "__main__":
    main()
