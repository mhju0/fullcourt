"""Content changes and failed producers must stop research before output writes."""
from __future__ import annotations

import importlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))
import fatigue_artifacts as artifacts


class FatigueArtifactTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        sources = json.loads((ML.parent / artifacts.SOURCE_LIST).read_text())
        for name in [*sources, *artifacts.PREPARE_SOURCES, artifacts.FEATURES, "ml/data/shooting/player_boxscores_2024.csv", "ml/data/shooting/team_boxscores_2024.csv"]:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture input\n")
        (self.root / artifacts.SOURCE_LIST).write_text(json.dumps(sources))
        self.export_receipt()

    def export_receipt(self):
        sources = json.loads((self.root / artifacts.SOURCE_LIST).read_text())
        receipt = dict(version=1, kind="fatigue-features", status="success", sources=artifacts.hashes(self.root, sources),
                       output=dict(path=artifacts.FEATURES, sha256=artifacts.sha256_file(self.root / artifacts.FEATURES)),
                       fidelity=dict(compared=2, mismatches=0, failures=0))
        artifacts.receipt_path(self.root, artifacts.FEATURES).write_text(json.dumps(receipt))

    def prepare(self):
        run = artifacts.ModelTableGeneration(self.root)
        self.addCleanup(run.close)
        run.temporary.write_text("exact model bytes\n")
        run.finish()
        return run

    def test_successful_chain_accepts_exact_output_and_preserves_csv_bytes(self):
        self.prepare()
        artifacts.require_model_table(self.root)
        self.assertEqual((self.root / artifacts.TABLE).read_bytes(), b"exact model bytes\n")

    def test_skipped_prepare_and_output_tampering_fail_closed(self):
        self.prepare()
        (self.root / artifacts.FEATURES).write_text("new successful export\n")
        self.export_receipt()
        with self.assertRaisesRegex(artifacts.StaleFatigueArtifact, "inputs.*changed"):
            artifacts.require_model_table(self.root)
        self.prepare()
        (self.root / artifacts.TABLE).write_text("tampered\n")
        with self.assertRaisesRegex(artifacts.StaleFatigueArtifact, "content changed"):
            artifacts.require_model_table(self.root)

    def test_cache_edit_add_delete_and_rename_all_invalidate_the_model(self):
        for mutation in ["edit", "add", "delete", "rename"]:
            with self.subTest(mutation=mutation):
                self.prepare()
                cache = self.root / "ml/data/shooting/player_boxscores_2024.csv"
                backup = cache.read_bytes()
                extra = cache.with_name("player_boxscores_2025.csv")
                if mutation == "edit": cache.write_text("changed contents\n")
                if mutation == "add": extra.write_bytes(backup)
                if mutation == "delete": cache.unlink()
                if mutation == "rename": cache.rename(extra)
                with self.assertRaises(artifacts.StaleFatigueArtifact):
                    artifacts.require_model_table(self.root)
                cache.write_bytes(backup)
                extra.unlink(missing_ok=True)

    def test_changed_producer_or_registry_invalidates_success(self):
        self.prepare()
        for name in ["scripts/export_fatigue_features.ts", "src/lib/fatigue.ts", "src/data/fixture-venue-corrections.json", "src/data/arena-history.json", "src/lib/arena-history.ts", "ml/prepare_fatigue_dataset.py", "ml/fatigue_artifacts.py"]:
            with self.subTest(source=name):
                path = self.root / name
                original = path.read_bytes()
                path.write_bytes(original + b"changed")
                with self.assertRaises(artifacts.StaleFatigueArtifact):
                    artifacts.require_model_table(self.root)
                path.write_bytes(original)

    def test_missing_malformed_version_or_failed_export_receipt_is_not_blessed(self):
        receipt_path = artifacts.receipt_path(self.root, artifacts.FEATURES)
        original = json.loads(receipt_path.read_text())
        for receipt in [None, "invalid JSON", [], {**original, "version": 2}, {**original, "status": "failed"}, {**original, "fidelity": dict(compared=2, mismatches=1, failures=0)}]:
            with self.subTest(receipt=receipt):
                if receipt is None: receipt_path.unlink(missing_ok=True)
                else: receipt_path.write_text(receipt if isinstance(receipt, str) else json.dumps(receipt))
                with self.assertRaisesRegex(artifacts.StaleFatigueArtifact, "pnpm exec tsx.*prepare_fatigue_dataset"):
                    artifacts.require_feature_export(self.root)

    def test_failed_or_concurrently_changed_preparation_preserves_old_csv_without_success(self):
        self.prepare()
        run = artifacts.ModelTableGeneration(self.root)
        self.addCleanup(run.close)
        run.temporary.write_text("unvalidated replacement\n")
        cache = self.root / "ml/data/shooting/team_boxscores_2024.csv"
        cache.write_text("changed while preparing\n")
        with self.assertRaisesRegex(artifacts.StaleFatigueArtifact, "changed during"):
            run.finish()
        self.assertEqual((self.root / artifacts.TABLE).read_text(), "exact model bytes\n")
        self.assertFalse(artifacts.receipt_path(self.root, artifacts.TABLE).exists())
        run.close()
        self.assertFalse(run.temporary.exists())

    def test_preparation_exception_cleans_temporary_output_and_invalidates_old_success(self):
        self.prepare()
        module = importlib.import_module("prepare_fatigue_dataset")
        with patch.object(module, "ROOT", self.root), patch.object(module.pd, "read_csv", side_effect=RuntimeError("unreadable CSV")):
            with self.assertRaisesRegex(RuntimeError, "unreadable CSV"):
                module.main()
        self.assertEqual((self.root / artifacts.TABLE).read_text(), "exact model bytes\n")
        self.assertFalse(artifacts.receipt_path(self.root, artifacts.TABLE).exists())
        self.assertEqual(list((self.root / "ml/data").glob("*.tmp")), [])

    def test_model_receipt_missing_malformed_or_unsupported_fails_closed(self):
        self.prepare()
        path = artifacts.receipt_path(self.root, artifacts.TABLE)
        original = json.loads(path.read_text())
        for receipt in [None, "invalid JSON", {**original, "version": 2}, {**original, "inputs": {}}]:
            with self.subTest(receipt=receipt):
                if receipt is None: path.unlink(missing_ok=True)
                else: path.write_text(receipt if isinstance(receipt, str) else json.dumps(receipt))
                with self.assertRaises(artifacts.StaleFatigueArtifact):
                    artifacts.require_model_table(self.root)

    def test_all_research_entry_points_refuse_before_loading_or_writing(self):
        artifacts.receipt_path(self.root, artifacts.FEATURES).unlink()
        for name in ["fit_fatigue_weights", "four_term_model", "ceiling_test", "availability_cost", "availability_quality", "availability_facts", "timezone_test", "ablate_fatigue_terms"]:
            with self.subTest(consumer=name):
                module = importlib.import_module(name)
                with patch.object(module, "ROOT", self.root), patch.object(module.pd, "read_csv", side_effect=AssertionError("read before guard")), patch.object(Path, "write_text", side_effect=AssertionError("write before guard")):
                    with self.assertRaises(artifacts.StaleFatigueArtifact):
                        module.main()


if __name__ == "__main__":
    unittest.main()
