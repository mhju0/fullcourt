"""Regenerate OT-dependent research against the isolated, corrected data shadow."""
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/audit/overtime-correction/analytics"
DATABASE_URL = "postgresql://overtime_owner@127.0.0.1:55436/fullcourt_overtime"
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--expected-manifest-sha", required=True)
    args = parser.parse_args()
    candidate_bytes = args.candidate.read_bytes()
    if hashlib.sha256(candidate_bytes).hexdigest() != args.expected_manifest_sha:
        raise ValueError("Externally frozen final candidate SHA-256 mismatch")
    candidate = json.loads(candidate_bytes)
    if candidate.get("kind") != "overtime-correction":
        raise ValueError("An overtime-only final candidate is required")
    OUT.mkdir(parents=True, exist_ok=True)
    python = sys.executable
    node = ["node", "node_modules/tsx/dist/cli.mjs"]
    trend = "docs/research/2026-10-20-overtime-correction/home-advantage-trend"
    (ROOT / trend).parent.mkdir(parents=True, exist_ok=True)
    commands = [
        node + ["scripts/measure_uncalled_half.ts"],
        node + ["scripts/measure_rest_eras.ts"],
        node + ["scripts/measure_home_rest_confound.ts"],
        node + ["scripts/export_fatigue_features.ts"],
        [python, "ml/prepare_fatigue_dataset.py"],
        node + ["scripts/research_home_advantage_trend.ts", "--output-prefix", trend],
        node + ["scripts/fetch_win_totals.ts", "--offline", "--source-cache", "ml/data/win-total-source", "--through-season", "2025-26"],
        [python, "ml/fit_fatigue_weights.py"],
        [python, "ml/ablate_fatigue_terms.py"],
        [python, "ml/four_term_model.py"],
        [python, "ml/ceiling_test.py"],
        [python, "ml/availability_cost.py"],
        [python, "ml/availability_quality.py"],
        [python, "ml/availability_facts.py"],
        [python, "ml/timezone_test.py"],
    ]
    env = dict(os.environ)
    env.update(DATABASE_URL=DATABASE_URL, DB_POOL_MAX="1", PYTHONUNBUFFERED="1")
    env.pop("DATABASE_SSL_CA", None)
    def verify_after_state(label: str) -> None:
        result = subprocess.run(node + ["scripts/overtime-correction/run.ts", "check", str(args.candidate.resolve())],
                                cwd=ROOT, env=env, capture_output=True, text=True)
        (OUT / f"{label}-state-check.log").write_text(result.stdout + result.stderr)
        if result.returncode:
            raise ValueError(f"Candidate state validation failed: {label}")
        state = json.loads(result.stdout.strip())
        if state.get("state") != "after" or state.get("hash") != candidate["afterHash"]:
            raise ValueError("Analytics require the exact corrected after-state, not the baseline")
        (OUT / f"{label}-binding.json").write_text(json.dumps({
            "candidateSha256": args.expected_manifest_sha, "afterHash": candidate["afterHash"],
            "observed": state, "checkedAt": datetime.now(timezone.utc).isoformat()}, indent=2) + "\n")
    verify_after_state("before-producers")
    records = []
    for index, command in enumerate(commands, start=1):
        name = Path(command[-1] if len(command) == 2 else next(x for x in command if x.endswith((".ts", ".py")))).stem
        path = OUT / f"{index:02d}-{name}.log"
        started = datetime.now(timezone.utc).isoformat()
        log.info("%d/%d %s", index, len(commands), name)
        with path.open("w") as handle:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=handle, stderr=subprocess.STDOUT)
        records.append({"command": command, "startedAt": started,
                        "finishedAt": datetime.now(timezone.utc).isoformat(), "exitCode": result.returncode,
                        "log": str(path.relative_to(ROOT)), "logSha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        (OUT / "commands.json").write_text(json.dumps(records, indent=2) + "\n")
        if result.returncode:
            raise SystemExit(f"Producer failed: {name}; inspect {path.relative_to(ROOT)}")
    verify_after_state("after-producers")
    log.info("All %d OT-dependent producer stages passed on the frozen corrected after-state", len(commands))


if __name__ == "__main__":
    main()
