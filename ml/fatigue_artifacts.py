"""Local content provenance for the export -> prepare -> research pipeline."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEATURES = "ml/data/fatigue_features.csv"
TABLE = "ml/data/fatigue_model_table.csv"
SOURCE_LIST = "scripts/fatigue-artifact-sources.json"
PREPARE_SOURCES = ("ml/prepare_fatigue_dataset.py", "ml/fatigue_artifacts.py", "ml/requirements.txt")
RERUN = "Run from the repository root: pnpm exec tsx scripts/export_fatigue_features.ts && python ml/prepare_fatigue_dataset.py"


class StaleFatigueArtifact(ValueError):
    pass


def fail(reason: str) -> None:
    raise StaleFatigueArtifact(f"Fatigue artifact provenance: {reason}. {RERUN}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hashes(root: Path, files) -> dict[str, str]:
    return {name: sha256_file(root / name) for name in files}


def receipt_path(root: Path, artifact: str) -> Path:
    return root / f"{artifact}.provenance.json"


def read_receipt(root: Path, artifact: str, kind: str) -> dict:
    try:
        receipt = json.loads(receipt_path(root, artifact).read_text())
        if not isinstance(receipt, dict) or receipt.get("version") != 1 or receipt.get("kind") != kind or receipt.get("status") != "success":
            fail(f"missing/unsupported successful {kind} receipt")
        expected = {"path": artifact, "sha256": sha256_file(root / artifact)}
        if receipt.get("output") != expected:
            fail(f"{artifact} content changed")
        return receipt
    except (OSError, ValueError, TypeError) as error:
        if isinstance(error, StaleFatigueArtifact):
            raise
        fail(f"cannot validate {artifact}: {error}")


def require_feature_export(root: Path = ROOT) -> dict:
    receipt = read_receipt(root, FEATURES, "fatigue-features")
    try:
        sources = json.loads((root / SOURCE_LIST).read_text())
        if receipt.get("sources") != hashes(root, sources):
            fail("exporter computation sources changed")
        fidelity = receipt.get("fidelity", {})
        if fidelity.get("compared", 0) < 1 or fidelity.get("mismatches") != 0 or fidelity.get("failures") != 0:
            fail("export fidelity was not successful")
    except (OSError, ValueError, TypeError, AttributeError) as error:
        if isinstance(error, StaleFatigueArtifact):
            raise
        fail(f"cannot validate export sources: {error}")
    return receipt


def preparation_inputs(root: Path = ROOT) -> dict:
    require_feature_export(root)
    shooting = root / "ml/data/shooting"
    players = sorted(shooting.glob("player_boxscores_*.csv"))
    teams = sorted(shooting.glob("team_boxscores_*.csv"))
    if not players or not teams:
        fail("player and team boxscore caches are both required")
    files = [FEATURES, f"{FEATURES}.provenance.json", *PREPARE_SOURCES]
    files.extend(p.relative_to(root).as_posix() for p in sorted(players + teams))
    try:
        return hashes(root, files)
    except OSError as error:
        fail(f"cannot read preparation input: {error}")


def require_model_table(root: Path = ROOT) -> dict:
    receipt = read_receipt(root, TABLE, "fatigue-model-table")
    if receipt.get("inputs") != preparation_inputs(root):
        fail("model table inputs, cache inventory or preparation sources changed")
    return receipt


class ModelTableGeneration:
    def __init__(self, root: Path = ROOT):
        self.root = root
        receipt_path(root, TABLE).unlink(missing_ok=True)
        self.inputs = preparation_inputs(root)
        descriptor, name = tempfile.mkstemp(prefix="fatigue_model_table.", suffix=".tmp", dir=root / "ml/data")
        os.close(descriptor)
        self.temporary = Path(name)

    def finish(self) -> None:
        if self.inputs != preparation_inputs(self.root):
            fail("inputs changed during model preparation")
        receipt = {
            "version": 1, "kind": "fatigue-model-table", "status": "success",
            "inputs": self.inputs,
            "output": {"path": TABLE, "sha256": sha256_file(self.temporary)},
        }
        temporary_receipt = self.temporary.with_suffix(".provenance.json.tmp")
        try:
            temporary_receipt.write_text(json.dumps(receipt, indent=2) + "\n")
            self.temporary.replace(self.root / TABLE)
            temporary_receipt.replace(receipt_path(self.root, TABLE))
        finally:
            temporary_receipt.unlink(missing_ok=True)

    def close(self) -> None:
        self.temporary.unlink(missing_ok=True)
