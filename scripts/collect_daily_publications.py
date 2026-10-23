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
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zoneinfo import ZoneInfo
from daily_publications import DATASETS, MAX_BYTES, empty_manifest, load_manifest

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://raw.githubusercontent.com/mhju0/fullcourt/data-publications/"


def fetch(path, limit=MAX_BYTES):
    with urlopen(Request(BASE + path, headers={"User-Agent": "FullCourt publication collector"}), timeout=20) as response:
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError("Publication too large")
    return body


def run(args, timeout):
    completed = subprocess.run(args, cwd=ROOT, capture_output=True, timeout=timeout, check=False)
    # Child diagnostics may contain database connection information; only verdicts leave this process.
    return completed.returncode


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
        entry = {"expectedPriorHash": old["sha256"] if old else None, "checkedAt": checked, "status": "failed"}
        candidate["datasets"][name] = entry
        try:
            if name == "officiating":
                body = fetch(old["path"]) if old else None
                if body is not None and (len(body) != old["bytes"] or hashlib.sha256(body).hexdigest() != old["sha256"]):
                    raise ValueError("Prior source hash differs")
                code = collect_officiating(args.out, season, body)
            else:
                script = "publish_current_shooting.py" if name == "shooting" else "publish_current_shot_grid.py"
                command = [sys.executable, f"scripts/{script}", "--season", season, "--output", str(args.out / f"{name}.json")]
                code = run(command, 900 if name == "shooting" else 90)
            if code == 3:
                entry["status"] = "unavailable"
            elif code == 0:
                result = subprocess.run(["node", "node_modules/tsx/dist/cli.mjs", "scripts/validate_daily_dataset.ts", name, str(args.out / f"{name}.json")], cwd=ROOT, capture_output=True, timeout=30)
                if result.returncode == 0:
                    entry.update(status="published", **json.loads(result.stdout))
        except Exception:
            entry["status"] = "failed"
        logging.info("%s: %s", name, entry["status"])
    (args.out / "candidate.json").write_text(json.dumps(candidate, indent=2) + "\n")
    # A failed module is reported visibly, while successful modules remain publishable.
    return 0

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    raise SystemExit(main())
