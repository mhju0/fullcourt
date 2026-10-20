"""Run the existing 15 analytics producers on an approved local arena after-state."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/audit/arena-shooting-correction/analytics"
TREND = "docs/research/2026-10-20-arena-shooting/home-advantage-trend"
NODE = ["node", "node_modules/tsx/dist/cli.mjs"]
OUTPUTS = [
    "ml/data/uncalled_half_report.txt", "ml/rest_split_facts.json",
    "ml/data/rest_eras_report.txt", "docs/audit/home-rest-confound.txt",
    "ml/home_rest_confound_facts.json", "ml/data/fatigue_features.csv",
    "ml/data/fatigue_export_report.txt", "ml/data/fatigue_model_table.csv",
    f"{TREND}.json", f"{TREND}.csv", "src/data/win-total-benchmark.json",
    "ml/data/fatigue_fitted_weights.csv", "ml/fatigue_fit_metrics.json",
    "ml/data/fatigue_fit_report.txt", "ml/fatigue_ablation_facts.json",
    "ml/data/fatigue_ablations.txt", "ml/data/four_term_report.txt",
    "ml/data/fatigue_ceiling_report.txt", "ml/data/availability_by_game.csv",
    "ml/data/availability_cost_coverage.json", "ml/data/availability_report.txt",
    "ml/data/availability_quality_coverage.json", "ml/data/availability_quality_report.txt",
    "ml/data/availability_facts_coverage.json", "ml/availability_facts.json",
    "ml/data/timezone_report.txt", "src/data/timezone-null.json",
]
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def commands() -> list[list[str]]:
    python = sys.executable
    return [
        NODE + ["scripts/measure_uncalled_half.ts"],
        NODE + ["scripts/measure_rest_eras.ts"],
        NODE + ["scripts/measure_home_rest_confound.ts"],
        NODE + ["scripts/export_fatigue_features.ts"],
        [python, "ml/prepare_fatigue_dataset.py"],
        NODE + ["scripts/research_home_advantage_trend.ts", "--output-prefix", TREND],
        NODE + ["scripts/fetch_win_totals.ts", "--offline", "--source-cache", "ml/data/win-total-source", "--through-season", "2025-26"],
        [python, "ml/fit_fatigue_weights.py"],
        [python, "ml/ablate_fatigue_terms.py"],
        [python, "ml/four_term_model.py"],
        [python, "ml/ceiling_test.py"],
        [python, "ml/availability_cost.py"],
        [python, "ml/availability_quality.py"],
        [python, "ml/availability_facts.py"],
        [python, "ml/timezone_test.py"],
    ]


def assert_local_url(value: str) -> None:
    target = urlsplit(value)
    if (target.scheme not in {"postgres", "postgresql"} or target.hostname != "127.0.0.1"
            or target.port != 55437 or target.path != "/fullcourt_arena_correction"
            or target.query or target.fragment):
        raise ValueError("Set ARENA_LOCAL_DATABASE_URL to exactly 127.0.0.1:55437/fullcourt_arena_correction without URL overrides")


def input_paths() -> list[Path]:
    shooting = ROOT / "ml/data/shooting"
    return ([shooting / f"{kind}_boxscores_{year}.csv"
             for kind in ("player", "team") for year in range(1996, 2026)]
            + [ROOT / f"ml/data/win-total-source/{year}.{suffix}"
               for year in range(1993, 2026) for suffix in ("html", "json")]
            + [ROOT / "src/data/player-appearance-context.json"])


def preflight() -> list[Path]:
    inputs = input_paths()
    failures = [f"missing input: {path.relative_to(ROOT)}" for path in inputs if not path.is_file()]
    for path in [ROOT / name for name in OUTPUTS] + [OUT]:
        if not path.resolve().is_relative_to(ROOT):
            failures.append(f"output resolves outside this checkout: {os.path.relpath(path, ROOT)}")
    for name in ["node_modules/tsx/dist/cli.mjs"] + [next(x for x in command if x.endswith((".ts", ".py"))) for command in commands()]:
        if not (ROOT / name).is_file():
            failures.append(f"missing runtime/producer: {name}")
    if failures:
        raise ValueError("Producer preflight failed before execution:\n" + "\n".join(failures))
    for year in range(1993, 2026):
        metadata = json.loads((ROOT / f"ml/data/win-total-source/{year}.json").read_text())
        expected_url = f"https://www.sportsoddshistory.com/nba-win/?y={year}-{year + 1}&sa=nba&t=win&o=t"
        if metadata.get("url") != expected_url or metadata.get("sha256") != sha256(ROOT / f"ml/data/win-total-source/{year}.html"):
            raise ValueError(f"Frozen offline market input mismatch: {year}")
    subprocess.run([sys.executable, "-c", "import numpy,pandas,scipy,sklearn"], cwd=ROOT, check=True)
    return inputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--expected-manifest-sha", required=True)
    parser.add_argument("--expected-source-proof-sha", required=True)
    parser.add_argument("--expected-after-hash", required=True)
    parser.add_argument("--preflight", action="store_true", help="Validate local files and bindings; do not connect or run producers")
    args = parser.parse_args()
    for value in (args.expected_manifest_sha, args.expected_source_proof_sha, args.expected_after_hash):
        if not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError("Externally reviewed manifest, source-proof and after-state SHA-256 values are required")
    candidate_path = args.candidate.resolve()
    if sha256(candidate_path) != args.expected_manifest_sha:
        raise ValueError("Externally frozen arena candidate SHA-256 mismatch")
    candidate = json.loads(candidate_path.read_bytes())
    if (candidate.get("kind") != "arena-correction" or candidate.get("version") != 1
            or candidate.get("sourceProofSha256") != args.expected_source_proof_sha
            or candidate.get("afterHash") != args.expected_after_hash
            or candidate.get("sourceProof", {}).get("sha256") != args.expected_source_proof_sha):
        raise ValueError("Arena manifest/source-proof/after-state bindings mismatch")
    proof = Path(candidate["sourceProof"]["path"])
    if sha256(proof) != args.expected_source_proof_sha:
        raise ValueError("Frozen source proof file differs from the reviewed digest")
    url = os.environ.get("ARENA_LOCAL_DATABASE_URL", "")
    assert_local_url(url)
    inputs = preflight()
    if args.preflight:
        log.info("Preflight passed: %d inputs, %d local outputs, %d stages; no database connection or producers executed", len(inputs), len(OUTPUTS), len(commands()))
        return
    env = dict(os.environ)
    env.update(DATABASE_URL=url, ARENA_LOCAL_DATABASE_URL=url, DB_POOL_MAX="1", PYTHONUNBUFFERED="1")
    env.pop("DATABASE_SSL_CA", None)
    env.pop("ARENA_CORRECTION_DATABASE_URL", None)
    OUT.mkdir(parents=True, exist_ok=True)
    (ROOT / TREND).parent.mkdir(parents=True, exist_ok=True)
    inventory = {str(path.relative_to(ROOT)): sha256(path) for path in inputs}
    (OUT / "input-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")

    def verify_after_state(label: str) -> None:
        if sha256(candidate_path) != args.expected_manifest_sha or sha256(proof) != args.expected_source_proof_sha:
            raise ValueError("Frozen manifest/source proof changed during regeneration")
        result = subprocess.run(NODE + ["scripts/arena-correction/run.ts", "check", str(candidate_path),
                                "--expected-manifest-sha", args.expected_manifest_sha],
                                cwd=ROOT, env=env, capture_output=True, text=True)
        (OUT / f"{label}-state-check.log").write_text(result.stdout + result.stderr)
        if result.returncode:
            raise ValueError(f"Arena candidate validation failed: {label}; inspect state-check log")
        state = json.loads(result.stdout.strip())
        if (state.get("state") != "after" or state.get("hash") != args.expected_after_hash
                or state.get("manifestSha256") != args.expected_manifest_sha
                or state.get("sourceProofSha256") != args.expected_source_proof_sha):
            raise ValueError("Analytics require the exact reviewed arena after-state")
        (OUT / f"{label}-binding.json").write_text(json.dumps({
            "candidateSha256": args.expected_manifest_sha, "sourceProofSha256": args.expected_source_proof_sha,
            "afterHash": args.expected_after_hash, "observed": state,
            "checkedAt": datetime.now(timezone.utc).isoformat()}, indent=2) + "\n")

    verify_after_state("before-producers")
    records = []
    try:
        for index, command in enumerate(commands(), start=1):
            name = Path(next(x for x in command if x.endswith((".ts", ".py")))).stem
            path = OUT / f"{index:02d}-{name}.log"
            started = datetime.now(timezone.utc).isoformat()
            log.info("%d/15 %s", index, name)
            with path.open("w") as handle:
                result = subprocess.run(command, cwd=ROOT, env=env, stdout=handle, stderr=subprocess.STDOUT)
            records.append({"command": command, "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
                            "exitCode": result.returncode, "log": str(path.relative_to(ROOT)), "logSha256": sha256(path)})
            (OUT / "commands.json").write_text(json.dumps(records, indent=2) + "\n")
            if result.returncode:
                raise RuntimeError(f"Producer failed: {name}; inspect {path.relative_to(ROOT)}")
    finally:
        verify_after_state("after-producers")
        if inventory != {str(path.relative_to(ROOT)): sha256(path) for path in inputs}:
            raise ValueError("Research input bytes changed during regeneration; outputs are not accepted")
    log.info("All 15 producers passed on the frozen arena after-state")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, RuntimeError) as error:
        log.error("%s", error)
        sys.exit(1)
