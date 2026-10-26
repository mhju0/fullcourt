from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import collect_daily_publications as collector
import publish_daily_publications as publisher
from daily_publications import empty_manifest, entry_for

NOW = "2026-10-22T12:00:00+00:00"
EARLIER = "2026-10-22T11:00:00+00:00"
IDENTITY = {"season": "2026-27", "generatedAt": EARLIER}


def candidate(status="published", prior=None, checked=NOW, **extra):
    change = {"status": status, "expectedPriorHash": prior, "checkedAt": checked, **extra}
    if status == "published":
        change.update(IDENTITY)
    return {"schemaVersion": 1, "datasets": {"shooting": change}}


def payload(games=1, season="2026-27"):
    return {"publication": {"season": season, "expectedGames": games,
                            "observedGames": games, "fixtureIds": [str(i) for i in range(games)]}}


def valid(*args):
    body = json.loads(Path(args[-1]).read_text())
    return {**IDENTITY, "season": body.get("publication", {}).get("season", "2026-27")}


class CollectorRetryTests(unittest.TestCase):
    def collect(self, outcomes, validations=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        stage = Path(directory.name)
        (stage / "shooting.json").write_text("stale")
        timeouts = []

        def run(command, timeout):
            self.assertFalse((stage / "shooting.json").exists())
            timeouts.append(timeout)
            outcome = outcomes.pop(0)
            (stage / "shooting.json").write_text("new")
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        validations = validations or [subprocess.CompletedProcess([], 0, json.dumps(IDENTITY).encode())]
        with patch.object(collector, "run", side_effect=run), patch.object(collector.subprocess, "run", side_effect=validations), patch.object(collector.time, "sleep") as sleep:
            result = collector.collect_shooting(stage, "2026-27")
        return result, sleep, timeouts

    def test_source_failure_retries_and_succeeds_without_stale_output(self):
        result, sleep, timeouts = self.collect([1, 1, 0])
        self.assertEqual(result["status"], "published")
        self.assertEqual(result["attempts"], ["source-error", "source-error", "published"])
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [5, 15])
        self.assertTrue(all(0 < timeout <= 900 for timeout in timeouts))

    def test_validation_and_spawn_failures_retry(self):
        invalid = subprocess.CompletedProcess([], 1, b"", b"secret")
        good = subprocess.CompletedProcess([], 0, json.dumps(IDENTITY).encode())
        result, _, _ = self.collect([OSError("secret"), 0, 0], [invalid, good])
        self.assertEqual(result["attempts"], ["source-error", "validation-error", "published"])

    def test_timeout_retries_and_exhausted_attempts_fail(self):
        result, _, _ = self.collect([subprocess.TimeoutExpired([], 1), 1, 1])
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["attempts"], ["source-timeout", "source-error", "source-error"])

    def test_exact_no_finals_contract_does_not_retry(self):
        result, sleep, _ = self.collect([3])
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["season"], "2026-27")
        self.assertIs(result["noRegularFinals"], True)
        self.assertEqual(result["expectedGames"], 0)
        sleep.assert_not_called()

    def test_total_deadline_includes_validation_and_backoff(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(collector.time, "monotonic", side_effect=[0, 0, 895, 899, 900]), patch.object(collector, "run", return_value=0), patch.object(collector.subprocess, "run", side_effect=subprocess.TimeoutExpired([], 5)) as validation, patch.object(collector.time, "sleep") as sleep:
            result = collector.collect_shooting(Path(directory), "2026-27")
        self.assertEqual(validation.call_args.kwargs["timeout"], 5)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["attempts"], ["validation-timeout", "budget-exhausted"])
        sleep.assert_not_called()

    def test_retries_share_time_spent_in_source_validation_and_backoff(self):
        elapsed = [0]
        timeouts = []
        outcomes = iter([1, 0, 1])

        def run(command, timeout):
            timeouts.append(timeout)
            elapsed[0] += 100 if len(timeouts) == 1 else 200
            return next(outcomes)

        def validation(*args, **kwargs):
            elapsed[0] += kwargs["timeout"]
            return subprocess.CompletedProcess([], 1)

        with tempfile.TemporaryDirectory() as directory, patch.object(collector.time, "monotonic", side_effect=lambda: elapsed[0]), patch.object(collector.time, "sleep", side_effect=lambda seconds: elapsed.__setitem__(0, elapsed[0] + seconds)), patch.object(collector, "run", side_effect=run), patch.object(collector.subprocess, "run", side_effect=validation):
            result = collector.collect_shooting(Path(directory), "2026-27")
        self.assertEqual(timeouts, [900, 795, 550])
        self.assertEqual(result["status"], "failed")

    def test_invalid_validator_json_and_wrong_season_retry(self):
        for stdout in (b"private diagnostics", json.dumps({**IDENTITY, "season": "2025-26"}).encode()):
            with self.subTest(stdout=stdout):
                bad = subprocess.CompletedProcess([], 0, stdout)
                good = subprocess.CompletedProcess([], 0, json.dumps(IDENTITY).encode())
                result, _, _ = self.collect([0, 0], [bad, good])
                self.assertEqual(result["attempts"], ["validation-error", "published"])

    def test_collector_failure_still_writes_partial_candidate(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(sys, "argv", ["collect", "--out", directory, "--season", "2026-27"]), patch.object(collector, "fetch", return_value=json.dumps(empty_manifest(EARLIER)).encode()), patch.object(collector, "collect_shooting", return_value={"status": "failed", "attempts": ["source-error"]}), patch.object(collector, "collect_officiating", return_value=3), patch.object(collector, "run", return_value=3):
            self.assertEqual(collector.main(), 0)
            changes = json.loads((Path(directory) / "candidate.json").read_text())["datasets"]
        self.assertEqual(changes["shooting"]["status"], "failed")
        self.assertEqual(changes["officiating"]["status"], "unavailable")


class ShootingHealthTests(unittest.TestCase):
    def setup_files(self, root, change=None):
        stage, pub = root / "stage", root / "pub"
        stage.mkdir(); pub.mkdir()
        body = json.dumps(payload()).encode()
        (stage / "shooting.json").write_bytes(body)
        (stage / "candidate.json").write_text(json.dumps(change or candidate()))
        manifest = empty_manifest(NOW)
        entry = entry_for("shooting", body, EARLIER, "2026-27")
        manifest["datasets"]["shooting"] = entry
        manifest["checks"]["shooting"] = {"checkedAt": NOW, "status": "published"}
        (pub / entry["path"]).parent.mkdir(parents=True)
        (pub / entry["path"]).write_bytes(body)
        (pub / "manifest.json").write_text(json.dumps(manifest))
        return stage, pub, manifest

    def test_health_summary_reports_only_safe_reason_codes(self):
        with tempfile.TemporaryDirectory() as directory:
            stage, pub, _ = self.setup_files(Path(directory), candidate("failed"))
            summary = Path(directory) / "summary.md"
            with patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}), self.assertLogs(level="INFO") as logs:
                with self.assertRaises(publisher.ShootingHealthError):
                    publisher.shooting_health(stage, pub)
            self.assertEqual(summary.read_text(), "- Shooting publication health: shooting-candidate-failed\n")
            self.assertIn("shooting-candidate-failed", " ".join(logs.output))

    def test_unavailable_may_retain_previous_season_publication(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(publisher, "validate", side_effect=valid):
            stage, pub, manifest = self.setup_files(Path(directory), candidate("unavailable", season="2027-28", noRegularFinals=True, expectedGames=0))
            manifest["checks"]["shooting"]["status"] = "unavailable"
            (pub / "manifest.json").write_text(json.dumps(manifest))
            publisher.require_shooting(stage, pub)

    def test_current_candidate_and_exact_blob_are_required(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(publisher, "validate", side_effect=valid):
            stage, pub, manifest = self.setup_files(Path(directory))
            publisher.require_shooting(stage, pub)
            manifest["checks"]["shooting"]["checkedAt"] = EARLIER
            (pub / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "shooting-check-mismatch"):
                publisher.require_shooting(stage, pub)

    def test_failed_candidate_cannot_be_hidden_by_previous_green(self):
        with tempfile.TemporaryDirectory() as directory:
            stage, pub, _ = self.setup_files(Path(directory), candidate("failed"))
            with self.assertRaisesRegex(ValueError, "shooting-candidate-failed"):
                publisher.require_shooting(stage, pub)

    def test_readback_identity_and_corrupt_blob_are_refused(self):
        for mutation in ("hash", "bytes", "season", "generatedAt", "content"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory, patch.object(publisher, "validate", side_effect=valid):
                stage, pub, manifest = self.setup_files(Path(directory))
                entry = manifest["datasets"]["shooting"]
                if mutation == "content":
                    (pub / entry["path"]).write_bytes(b"corrupt")
                elif mutation == "hash":
                    entry["sha256"] = "f" * 64
                    entry["path"] = f'blobs/shooting-{entry["sha256"]}.json'
                elif mutation == "bytes":
                    entry["bytes"] += 1
                elif mutation == "season":
                    entry["season"] = "2027-28"
                else:
                    entry["generatedAt"] = NOW
                (pub / "manifest.json").write_text(json.dumps(manifest))
                with self.assertRaises((ValueError, FileNotFoundError)):
                    publisher.require_shooting(stage, pub)

    def test_unavailable_requires_explicit_zero_evidence_and_this_run_check(self):
        for extra in ({}, {"season": "2026-27", "expectedGames": 0}, {"season": "2026-27", "expectedGames": False, "noRegularFinals": True}, {"season": "2026-27", "expectedGames": 0, "noRegularFinals": True}):
            with self.subTest(extra=extra), tempfile.TemporaryDirectory() as directory:
                stage, pub, manifest = self.setup_files(Path(directory), candidate("unavailable", **extra))
                manifest["datasets"] = {}
                manifest["checks"]["shooting"]["status"] = "unavailable"
                (pub / "manifest.json").write_text(json.dumps(manifest))
                if len(extra) == 3 and type(extra["expectedGames"]) is int:
                    publisher.require_shooting(stage, pub)
                else:
                    with self.assertRaisesRegex(ValueError, "shooting-no-finals-evidence"):
                        publisher.require_shooting(stage, pub)

    def test_unavailable_cannot_hide_same_season_positive_coverage_in_history(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(publisher, "validate", side_effect=valid):
            stage, pub, manifest = self.setup_files(Path(directory), candidate("unavailable", season="2026-27", noRegularFinals=True, expectedGames=0))
            manifest["history"] = {"shooting": {"2026-27": manifest["datasets"].pop("shooting")}}
            manifest["checks"]["shooting"]["status"] = "unavailable"
            (pub / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "shooting-no-finals-regression"):
                publisher.require_shooting(stage, pub)

    def test_prepare_only_flag_runs_gate_after_partial_prepare(self):
        with tempfile.TemporaryDirectory() as directory:
            stage, pub, _ = self.setup_files(Path(directory), candidate("failed"))
            change = candidate("failed", prior=entry_for("shooting", (stage / "shooting.json").read_bytes(), EARLIER, "2026-27")["sha256"])
            (stage / "candidate.json").write_text(json.dumps(change))
            with patch.object(sys, "argv", ["publish", "--stage", str(stage), "--publication-root", str(pub), "--require-shooting"]):
                with self.assertRaisesRegex(ValueError, "shooting-candidate-failed"):
                    publisher.main()
            self.assertEqual(json.loads((pub / "manifest.json").read_text())["checks"]["shooting"]["status"], "failed")


class AuthenticShootingGateTests(unittest.TestCase):
    def test_authentic_provider_fixture_passes_real_staged_validator_and_isolated_gate(self):
        from scripts.tests.test_current_shooting import disputed_game
        from publish_current_shooting import build_snapshot
        fixture, summary = disputed_game()
        fixture["gid"] = "espn-401909095"
        body = build_snapshot([fixture], {fixture["gid"]: summary}, {fixture["gid"]: "401909095"}, "2026-27")
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory) / "stage"
            stage.mkdir()

            def source(command, timeout):
                (stage / "shooting.json").write_text(json.dumps(body))
                return 0

            with patch.object(collector, "run", side_effect=source):
                result = collector.collect_shooting(stage, "2026-27")
            self.assertEqual(result["status"], "published")
            self.assertEqual(result["attempts"], ["published"])
            update = {"schemaVersion": 1, "datasets": {"shooting": {
                "expectedPriorHash": None, "checkedAt": datetime.now(timezone.utc).isoformat(), **result}}}
            (stage / "candidate.json").write_text(json.dumps(update))
            publication = Path(directory) / "publication"
            with patch.object(sys, "argv", ["publish", "--stage", str(stage), "--publication-root", str(publication), "--require-shooting"]):
                self.assertEqual(publisher.main(), 0)
            manifest = json.loads((publication / "manifest.json").read_text())
            self.assertEqual(json.loads((publication / manifest["datasets"]["shooting"]["path"]).read_text()), body)
            self.assertEqual(body["publication"]["observedGames"], 1)
            self.assertEqual(sum(row[5] for row in body["seasons"]), 167)


class GitShootingHealthTests(unittest.TestCase):
    def git(self, root, *args):
        return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        self.remote, self.repo, self.stage = root / "origin.git", root / "repo", root / "stage"
        for path in (self.remote, self.repo, self.stage):
            path.mkdir()
        self.git(self.remote, "init", "--bare")
        self.git(self.repo, "init", "-b", "main")
        self.git(self.repo, "config", "user.email", "test@example.invalid")
        self.git(self.repo, "config", "user.name", "Test")
        (self.repo / "code.txt").write_text("application")
        self.git(self.repo, "add", ".")
        self.git(self.repo, "commit", "-m", "base")
        self.git(self.repo, "remote", "add", "origin", str(self.remote))
        self.git(self.repo, "push", "origin", "main")
        (self.stage / "shooting.json").write_text(json.dumps(payload()))
        (self.stage / "officiating.json").write_text('{"season":{"season":"2026-27","games":[]}}')
        root_patch = patch.object(publisher, "ROOT", self.repo)
        root_patch.start(); self.addCleanup(root_patch.stop)
        validation_patch = patch.object(publisher, "validate", side_effect=valid)
        validation_patch.start(); self.addCleanup(validation_patch.stop)

    def publish(self, update, required=True):
        (self.stage / "candidate.json").write_text(json.dumps(update))
        args = ["publish", "--stage", str(self.stage)]
        if required:
            args.append("--require-shooting")
        with patch.object(sys, "argv", args):
            return publisher.main()

    def readback(self):
        return json.loads(self.git(self.remote, "show", "data-publications:manifest.json"))

    def seed(self):
        self.assertEqual(self.publish(candidate(checked=EARLIER)), 0)
        return self.readback()["datasets"]["shooting"]

    def with_other(self, update):
        update["datasets"]["officiating"] = {"expectedPriorHash": None, "checkedAt": NOW,
            "status": "published", **IDENTITY}
        return update

    def test_required_success_freshly_fetches_and_pins_actual_remote_commit(self):
        real_git = publisher.git
        calls = []

        def observed(*args, **kwargs):
            calls.append(args)
            return real_git(*args, **kwargs)

        with patch.object(publisher, "git", side_effect=observed):
            self.assertEqual(self.publish(candidate()), 0)
        head = self.git(self.remote, "rev-parse", "data-publications")
        fetches = [i for i, call in enumerate(calls) if call[0] == "fetch"]
        pushes = [i for i, call in enumerate(calls) if call[0] == "push"]
        self.assertGreater(fetches[-1], pushes[-1])
        self.assertIn(("show", f"{head}:manifest.json"), calls)
        entry = self.readback()["datasets"]["shooting"]
        self.assertIn(("show", f"{head}:{entry['path']}"), calls)

    def test_failed_shooting_fails_after_other_module_publishes_and_retains_last_good(self):
        old = self.seed()
        before = self.git(self.remote, "rev-parse", "data-publications")
        update = self.with_other(candidate("failed", prior=old["sha256"]))
        with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-candidate-failed"):
            self.publish(update)
        manifest = self.readback()
        self.assertNotEqual(self.git(self.remote, "rev-parse", "data-publications"), before)
        self.assertEqual(manifest["datasets"]["shooting"], old)
        self.assertEqual(manifest["checks"]["shooting"], {"status": "failed", "checkedAt": NOW})
        self.assertEqual(manifest["checks"]["officiating"]["status"], "published")
        self.assertEqual(json.loads(self.git(self.remote, "show", f"data-publications:{old['path']}")), payload())
        self.assertEqual(self.git(self.repo, "show", "main:code.txt"), "application")

    def test_final_validator_rejection_fails_after_partial_push(self):
        old = self.seed()

        def reject_stage(name, path):
            if name == "shooting" and path.resolve() == (self.stage / "shooting.json").resolve():
                raise ValueError("private diagnostics")
            return valid(name, path)

        with patch.object(publisher, "validate", side_effect=reject_stage):
            with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-check-mismatch"):
                self.publish(self.with_other(candidate(prior=old["sha256"])))
        self.assertEqual(self.readback()["checks"]["officiating"]["status"], "published")
        self.assertEqual(self.readback()["datasets"]["shooting"], old)

    def test_cas_skipped_shooting_cannot_reuse_old_green_even_with_same_check(self):
        self.seed()
        update = self.with_other(candidate(checked=EARLIER))
        with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-cas-skipped"):
            self.publish(update)
        self.assertEqual(self.readback()["checks"]["shooting"]["status"], "published")
        self.assertEqual(self.readback()["checks"]["officiating"]["status"], "published")

    def test_missing_shooting_candidate_fails_after_other_module_publishes(self):
        update = self.with_other({"schemaVersion": 1, "datasets": {}})
        with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-candidate-missing"):
            self.publish(update)
        self.assertEqual(self.readback()["checks"]["officiating"]["status"], "published")

    def test_unavailable_early_season_passes_but_same_season_regression_fails(self):
        unavailable = candidate("unavailable", season="2026-27", noRegularFinals=True, expectedGames=0, checked=EARLIER)
        self.assertEqual(self.publish(unavailable), 0)
        old = self.seed()
        unavailable = candidate("unavailable", prior=old["sha256"], season="2026-27", noRegularFinals=True, expectedGames=0)
        with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-no-finals-regression"):
            self.publish(unavailable)
        self.assertEqual(self.readback()["checks"]["shooting"]["status"], "unavailable")
        self.assertEqual(self.readback()["datasets"]["shooting"], old)

    def test_unavailable_cannot_hide_remote_history_after_latest_season_changes(self):
        self.seed()
        later = candidate(prior=self.readback()["datasets"]["shooting"]["sha256"])
        later["datasets"]["shooting"]["season"] = "2027-28"
        (self.stage / "shooting.json").write_text(json.dumps(payload(season="2027-28")))
        self.assertEqual(self.publish(later), 0)
        old = self.readback()["datasets"]["shooting"]
        update = candidate("unavailable", prior=old["sha256"], season="2026-27", noRegularFinals=True, expectedGames=0)
        with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-no-finals-regression"):
            self.publish(update)
        self.assertEqual(self.readback()["datasets"]["shooting"], old)

    def test_post_push_remote_error_fails_without_undoing_publication(self):
        real_git = publisher.git
        fetches = 0

        def fail_second_fetch(*args, **kwargs):
            nonlocal fetches
            if args[0] == "fetch":
                fetches += 1
                if fetches == 2:
                    raise subprocess.CalledProcessError(1, ["git"], stderr="private diagnostics")
            return real_git(*args, **kwargs)

        with patch.object(publisher, "git", side_effect=fail_second_fetch):
            with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-remote-readback-error"):
                self.publish(candidate())
        self.assertEqual(self.readback()["checks"]["shooting"]["status"], "published")

    def test_post_push_changed_remote_head_is_read_instead_of_local_prepared_tree(self):
        real_git = publisher.git

        def mutate_after_push(*args, **kwargs):
            result = real_git(*args, **kwargs)
            if args[0] == "push":
                checkout = kwargs["cwd"]
                manifest = json.loads((checkout / "manifest.json").read_text())
                manifest["checks"]["shooting"]["checkedAt"] = EARLIER
                (checkout / "manifest.json").write_text(json.dumps(manifest))
                real_git("add", "manifest.json", cwd=checkout)
                real_git("commit", "-m", "Concurrent publication", cwd=checkout)
                real_git("push", "origin", "HEAD:refs/heads/data-publications", cwd=checkout)
            return result

        with patch.object(publisher, "git", side_effect=mutate_after_push):
            with self.assertRaisesRegex(publisher.ShootingHealthError, "shooting-check-mismatch"):
                self.publish(candidate())


if __name__ == "__main__":
    unittest.main()
