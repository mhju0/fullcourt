import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from daily_publications import empty_manifest, merge_candidate, entry_for, load_manifest
import publish_daily_publications as publisher

NOW = "2026-10-22T12:00:00+00:00"
EARLIER = "2026-10-22T11:00:00+00:00"


def candidate(name="shooting", prior=None, status="published"):
    entry = {"expectedPriorHash": prior, "checkedAt": NOW, "status": status}
    if status == "published":
        entry["generatedAt"] = EARLIER
    return {"schemaVersion": 1, "datasets": {name: entry}}


class MergeTests(unittest.TestCase):
    def test_failure_preserves_last_good_and_other_module_can_advance(self):
        body = b'{"old":true}'
        previous = empty_manifest(EARLIER)
        previous["datasets"]["shooting"] = entry_for("shooting", body, EARLIER)
        old = previous["datasets"]["shooting"]
        update = candidate("shooting", old["sha256"], "failed")
        update["datasets"].update(candidate("officiating")["datasets"])
        result = merge_candidate(previous, update, {"officiating": b'{}'}, NOW)
        self.assertEqual(result["datasets"]["shooting"], old)
        self.assertEqual(result["checks"]["shooting"]["status"], "failed")
        self.assertEqual(set(result["datasets"]), {"shooting", "officiating"})

    def test_stale_same_dataset_cannot_overwrite_newer_but_disjoint_can_merge(self):
        previous = empty_manifest(EARLIER)
        previous["datasets"]["shooting"] = entry_for("shooting", b'newer', EARLIER)
        with self.assertRaisesRegex(ValueError, "Stale"):
            merge_candidate(previous, candidate("shooting", None), {"shooting": b'older'}, NOW)
        merged = merge_candidate(previous, candidate("officiating"), {"officiating": b'{}'}, NOW)
        self.assertEqual(merged["datasets"]["shooting"], previous["datasets"]["shooting"])

    def test_old_or_future_generation_and_checks_are_refused(self):
        previous = empty_manifest(EARLIER)
        previous["datasets"]["shooting"] = entry_for("shooting", b'x', NOW)
        prior = previous["datasets"]["shooting"]["sha256"]
        with self.assertRaisesRegex(ValueError, "backwards"):
            merge_candidate(previous, candidate(prior=prior), {"shooting": b'y'}, NOW)
        future = candidate()
        future["datasets"]["shooting"]["generatedAt"] = "2030-01-01T00:00:00Z"
        with self.assertRaisesRegex(ValueError, "future"):
            merge_candidate(empty_manifest(EARLIER), future, {"shooting": b'z'}, NOW)

    def test_manifest_cannot_escape_blob_directory_or_accept_unknown_dataset(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "manifest.json"
            bad = empty_manifest(NOW)
            bad["datasets"]["shooting"] = {**entry_for("shooting", b'x', EARLIER), "path": "../credential"}
            path.write_text(json.dumps(bad))
            with self.assertRaises(ValueError): load_manifest(path)
            bad["datasets"] = {"unknown": {}}
            path.write_text(json.dumps(bad))
            with self.assertRaises(ValueError): load_manifest(path)

    def test_source_membership_regression_is_refused(self):
        before = {"publication": {"season": "2026-27", "fixtureIds": ["one", "two"]}}
        after = {"publication": {"season": "2026-27", "fixtureIds": ["one"]}}
        with self.assertRaisesRegex(ValueError, "membership"):
            publisher.continuity("shooting", before, after)


class GitPublicationTests(unittest.TestCase):
    def git(self, root, *args):
        return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()

    def test_real_git_publish_preserves_old_blob_and_refuses_replayed_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote, repo, stage = root / "origin.git", root / "repo", root / "stage"
            remote.mkdir(); repo.mkdir(); stage.mkdir()
            self.git(remote, "init", "--bare")
            self.git(repo, "init", "-b", "main")
            self.git(repo, "config", "user.email", "test@example.invalid")
            self.git(repo, "config", "user.name", "Test")
            (repo / "trusted-code.txt").write_text("application code")
            self.git(repo, "add", "."); self.git(repo, "commit", "-m", "base")
            self.git(repo, "remote", "add", "origin", str(remote))
            self.git(repo, "push", "origin", "main")
            (stage / "shooting.json").write_text('{"publication":{"season":"2026-27","fixtureIds":["one"]}}')
            (stage / "candidate.json").write_text(json.dumps(candidate()))
            with patch.object(publisher, "ROOT", repo), patch.object(publisher, "validate", return_value={"generatedAt": EARLIER}), patch.object(sys, "argv", ["publish", "--stage", str(stage)]):
                self.assertEqual(publisher.main(), 0)
                first = self.git(remote, "rev-parse", "data-publications")
                manifest = json.loads(self.git(remote, "show", "data-publications:manifest.json"))
                self.assertEqual(json.loads(self.git(remote, "show", "data-publications:vercel.json")), {"git": {"deploymentEnabled": False}})
                blob = manifest["datasets"]["shooting"]["path"]
                self.assertEqual(self.git(remote, "show", f"data-publications:{blob}"), (stage / "shooting.json").read_text())
                self.assertEqual(self.git(repo, "show", "main:trusted-code.txt"), "application code")
                with self.assertRaisesRegex(ValueError, "Stale"):
                    publisher.main()
                self.assertEqual(self.git(remote, "rev-parse", "data-publications"), first)
                second = candidate("officiating", status="unavailable")
                (stage / "candidate.json").write_text(json.dumps(second))
                self.assertEqual(publisher.main(), 0)
                current = json.loads(self.git(remote, "show", "data-publications:manifest.json"))
                self.assertEqual(current["datasets"]["shooting"], manifest["datasets"]["shooting"])
                self.assertEqual(self.git(remote, "show", f"data-publications:{blob}"), (stage / "shooting.json").read_text())

    def test_symlink_candidate_is_rejected_without_writing_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); stage = root / "stage"; stage.mkdir()
            source = root / "candidate.json"; source.write_text(json.dumps(candidate()))
            (stage / "candidate.json").symlink_to(source)
            with self.assertRaises(ValueError): publisher.prepare(stage, root)
            self.assertFalse((root / "manifest.json").exists())


if __name__ == "__main__": unittest.main()
