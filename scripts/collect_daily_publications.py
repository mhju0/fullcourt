"""Collect each module into a disposable stage; no Git or production database writes."""
from __future__ import annotations
import argparse
import hashlib
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zoneinfo import ZoneInfo
from daily_publications import DATASETS, MAX_BYTES, empty_manifest, load_manifest
from collection_failure import FAILURE_REASONS, REASON_PATH_ENV, failure_reason, read_failure_reason

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://raw.githubusercontent.com/mhju0/fullcourt/data-publications/"
SHOOTING_BUDGET = 900
SHOOTING_BACKOFF = (5, 15)
STAGE_REASONS = FAILURE_REASONS | {"published", "validation-timeout", "budget-exhausted",
                                   "no-regular-finals", "no-observed-shots", "awaiting-first-reports"}


def fetch(path, limit=MAX_BYTES):
    with urlopen(Request(BASE + path, headers={"User-Agent": "FullCourt publication collector"}), timeout=20) as response:
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError("Publication too large")
    return body


def run(args, timeout, reason_path=None):
    environment = None
    if reason_path is not None:
        reason_path.unlink(missing_ok=True)
        environment = {**os.environ, REASON_PATH_ENV: str(reason_path)}
    completed = subprocess.run(args, cwd=ROOT, capture_output=True, timeout=timeout, check=False, env=environment)
    # Child diagnostics may contain database connection information; only verdicts leave this process.
    return completed.returncode


def collect_shooting(stage, season):
    deadline = time.monotonic() + SHOOTING_BUDGET
    output = stage / "shooting.json"
    command = [sys.executable, "scripts/publish_current_shooting.py", "--season", season, "--output", str(output)]
    result = {"status": "failed", "attempts": []}
    for attempt in range(3):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            result["attempts"].append("budget-exhausted")
            break
        reason = "source-error"
        try:
            output.unlink(missing_ok=True)
            code = run(command, remaining)
            if code == 3:
                result.update(status="unavailable", season=season, noRegularFinals=True, expectedGames=0)
                reason = "no-regular-finals"
            elif code == 0:
                reason = "validation-error"
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    reason = "budget-exhausted"
                else:
                    try:
                        validation = subprocess.run(["node", "node_modules/tsx/dist/cli.mjs", "scripts/validate_daily_dataset.ts", "shooting", str(output)], cwd=ROOT, capture_output=True, timeout=min(30, remaining))
                    except subprocess.TimeoutExpired:
                        reason = "validation-timeout"
                    else:
                        if validation.returncode == 0 and time.monotonic() < deadline:
                            identity = json.loads(validation.stdout)
                            if identity["season"] != season:
                                raise ValueError("Shooting season differs")
                            result.update(status="published", generatedAt=identity["generatedAt"], season=season)
                            reason = "published"
        except subprocess.TimeoutExpired:
            reason = "source-timeout"
        except Exception:
            pass
        result["attempts"].append(reason)
        logging.info("shooting attempt %s/3: %s", attempt + 1, reason)
        if result["status"] != "failed" or attempt == 2:
            break
        remaining = deadline - time.monotonic()
        backoff = SHOOTING_BACKOFF[attempt]
        if remaining <= backoff:
            result["attempts"].append("budget-exhausted")
            break
        time.sleep(backoff)
    return result


def collect_officiating(stage, season, previous):
    index = json.loads((ROOT / "src/data/officiating.json").read_text())
    if previous:
        old = json.loads(previous)
        index["seasons"] = [s for s in index["seasons"] if s["season"] != old["season"]["season"]] + [old["season"]]
    root = stage / "officiating-root"
    (root / "src/data").mkdir(parents=True)
    source_index = root / "src/data/officiating.json"
    source_index.write_text(json.dumps(index))
    source = stage / "officiating-sources"
    code = run([sys.executable, "ml/collect_l2m_season.py", "--season", season, "--out", str(source), "--published-data", str(source_index)], 1200)
    if code:
        return code
    manifests = list(source.rglob("manifest.json"))
    if len(manifests) != 1:
        return 1
    code = run([sys.executable, "ml/publish_officiating.py", str(manifests[0].parent), "--root", str(root)], 120)
    if code:
        return code
    published = next(s for s in json.loads(source_index.read_text())["seasons"] if s["season"] == season)
    details = {}
    for g in published["games"]:
        key = f'{g["id"]}-{g["sha256"][:16]}'
        details[key] = json.loads((root / "public/data/officiating" / season / f"{key}.json").read_text())
    (stage / "officiating.json").write_text(json.dumps({"schemaVersion": 1, "generatedAt": published["refreshedAt"], "season": published, "details": details}, ensure_ascii=False, separators=(",", ":")) + "\n")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--season")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    now = datetime.now(ZoneInfo("America/New_York"))
    year = now.year if now.month >= 10 else now.year - 1
    season = args.season or f"{year}-{str(year + 1)[-2:]}"
    manifest_path = args.out / "previous-manifest.json"
    try:
        manifest_path.write_bytes(fetch("manifest.json", 32768))
        previous = load_manifest(manifest_path)
    except HTTPError as error:
        if error.code != 404:
            raise
        previous = empty_manifest(datetime.now(timezone.utc).isoformat())
    # An unreachable or malformed previous publication is not permission to reset its base.
    candidate = {"schemaVersion": 1, "datasets": {}}
    for name in DATASETS:
        old = previous["datasets"].get(name)
        checked = datetime.now(timezone.utc).isoformat()
        entry = {"expectedPriorHash": old["sha256"] if old else None, "checkedAt": checked,
                 "status": "failed", "reason": "source-error"}
        candidate["datasets"][name] = entry
        phase = "source"
        try:
            if name == "shooting":
                entry.update(collect_shooting(args.out, season))
                attempts = entry.get("attempts", [])
                entry["reason"] = attempts[-1] if attempts and attempts[-1] in STAGE_REASONS else "source-error"
                continue
            if name == "officiating":
                body = fetch(old["path"]) if old else None
                if body is not None and (len(body) != old["bytes"] or hashlib.sha256(body).hexdigest() != old["sha256"]):
                    raise ValueError("Prior source hash differs")
                code = collect_officiating(args.out, season, body)
            else:
                command = [sys.executable, "scripts/publish_nba_web_shot_grid.py", "--season", season, "--output", str(args.out / f"{name}.json")]
                reason_path = args.out / "shot-quality-reason.json"
                code = run(command, 900, reason_path=reason_path)
                entry["reason"] = read_failure_reason(reason_path)
            if code == 3:
                entry["status"] = "unavailable"
                entry["reason"] = "no-observed-shots" if name == "shotQuality" else "awaiting-first-reports"
            elif code == 0:
                phase = "validation"
                entry["reason"] = "validation-error"
                result = subprocess.run(["node", "node_modules/tsx/dist/cli.mjs", "scripts/validate_daily_dataset.ts", name, str(args.out / f"{name}.json")], cwd=ROOT, capture_output=True, timeout=30)
                if result.returncode == 0:
                    entry.update(status="published", **json.loads(result.stdout))
                    entry["reason"] = "published"
        except Exception as error:
            entry["status"] = "failed"
            if phase == "validation":
                entry["reason"] = "validation-timeout" if isinstance(error, subprocess.TimeoutExpired) else "validation-error"
            else:
                entry["reason"] = failure_reason(error)
        logging.info("%s: %s; reason: %s", name, entry["status"], entry["reason"])
    (args.out / "candidate.json").write_text(json.dumps(candidate, indent=2) + "\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as stream:
            for name, entry in candidate["datasets"].items():
                stream.write(f"- {name}: {entry['status']}; reason: {entry['reason']}\n")
                if name == "shooting":
                    attempts = [reason if reason in STAGE_REASONS else "source-error" for reason in entry.get("attempts", [])]
                    stream.write(f"  - Attempts: {', '.join(attempts)}\n")
    # A failed module is reported visibly, while successful modules remain publishable.
    return 0

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    raise SystemExit(main())
