import copy
from datetime import datetime, timezone
import io
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import collect_daily_publications as collector
import publish_current_shot_grid as shots
from daily_publications import empty_manifest, merge_candidate

SECRET = "postgresql://owner:sentinel-password@private.invalid/db?token=sentinel-token"
NOW = "2026-10-22T12:00:00+00:00"
FIXTURE = json.loads((Path(__file__).parent / "fixtures/shot-chart-detail-cache-sample.json").read_text())


class ShotReasonTests(unittest.TestCase):
    def invoke(self, opener):
        with tempfile.TemporaryDirectory() as directory:
            output, diagnostic = Path(directory, "shots.json"), Path(directory, "reason.json")
            output.write_text("last-good")
            with patch.object(sys, "argv", ["shots", "--season", "2025-26", "--output", str(output)]), \
                 patch.dict(os.environ, {"FULLCOURT_COLLECTION_REASON_PATH": str(diagnostic)}), \
                 patch.object(shots.urllib.request, "urlopen", side_effect=opener), \
                 patch.object(shots.time, "sleep"), self.assertLogs(shots.logger, level=logging.INFO) as logs:
                code = shots.main()
            reason = json.loads(diagnostic.read_text()) if diagnostic.exists() else None
            self.assertEqual(output.read_text(), "last-good")
            self.assertNotIn(SECRET, "\n".join(logs.output))
            self.assertNotIn(SECRET, json.dumps(reason))
            return code, reason

    def test_transport_reasons_use_exception_types_without_exposing_messages(self):
        for error, reason in [
            (HTTPError(SECRET, 403, SECRET, {}, None), "http-403"),
            (HTTPError(SECRET, 503, SECRET, {}, None), "http-error"),
            (TimeoutError(SECRET), "source-timeout"),
            (URLError(TimeoutError(SECRET)), "source-timeout"),
            (URLError(SECRET), "source-error"),
            (ValueError(SECRET), "source-error"),
        ]:
            with self.subTest(reason=reason):
                code, diagnostic = self.invoke(lambda *args, **kwargs: (_ for _ in ()).throw(error))
                self.assertEqual(code, 1)
                self.assertEqual(diagnostic, {"schemaVersion": 1, "reason": reason})

    def test_blank_and_nonempty_invalid_responses_are_distinct_failures(self):
        for body, reason in [(b"", "empty-response"), (b" \n\t", "empty-response"),
                             (SECRET.encode(), "invalid-response")]:
            with self.subTest(reason=reason):
                code, diagnostic = self.invoke(lambda *args, **kwargs: io.BytesIO(body))
                self.assertEqual((code, diagnostic), (1, {"schemaVersion": 1, "reason": reason}))

    def test_valid_empty_shot_dataset_remains_unavailable_without_a_failure_reason(self):
        body = copy.deepcopy(FIXTURE)
        body["resultSets"][0]["rowSet"] = []
        code, diagnostic = self.invoke(lambda *args, **kwargs: io.BytesIO(json.dumps(body).encode()))
        self.assertEqual(code, 3)
        self.assertIsNone(diagnostic)

    def test_valid_json_with_invalid_dataset_is_validation_error(self):
        for payload in ({"private": SECRET}, [], None, False):
            with self.subTest(payload=payload):
                code, diagnostic = self.invoke(lambda *args, **kwargs: io.BytesIO(json.dumps(payload).encode()))
                self.assertEqual((code, diagnostic), (1, {"schemaVersion": 1, "reason": "validation-error"}))


class ParentReasonTests(unittest.TestCase):
    def collect(self, child_reason, code=1):
        self.child_calls = []
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory)
            summary = stage / "summary.md"

            def child(*args, reason_path=None, **kwargs):
                self.child_calls.append((args, reason_path))
                if reason_path is not None and child_reason is not None:
                    Path(reason_path).write_bytes(child_reason if isinstance(child_reason, bytes)
                                                  else json.dumps(child_reason).encode())
                return code

            with patch.object(sys, "argv", ["collect", "--out", directory, "--season", "2026-27"]), \
                 patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}), \
                 patch.object(collector, "fetch", return_value=json.dumps(empty_manifest(NOW)).encode()), \
                 patch.object(collector, "collect_shooting", return_value={"status": "failed", "attempts": ["source-timeout"]}), \
                 patch.object(collector, "collect_officiating", return_value=3), \
                 patch.object(collector, "run", side_effect=child):
                self.assertEqual(collector.main(), 0)
            candidate = json.loads((stage / "candidate.json").read_text())
            text = summary.read_text()
            self.assertNotIn(SECRET, json.dumps(candidate) + text)
            return candidate, text

    def test_official_web_collector_has_a_bounded_process_and_safe_reason_channel(self):
        self.collect(None)
        self.assertEqual(len(self.child_calls), 1)
        (command, timeout), reason_path = self.child_calls[0]
        self.assertEqual(command[:4], [sys.executable, "scripts/publish_nba_web_shot_grid.py", "--season", "2026-27"])
        self.assertEqual(timeout, 900)
        self.assertEqual(reason_path.name, "shot-quality-reason.json")

    def test_parent_surfaces_only_allowlisted_codes_and_keeps_other_modules_independent(self):
        candidate, summary = self.collect({"schemaVersion": 1, "reason": "http-403"})
        changes = candidate["datasets"]
        self.assertEqual(changes["shotQuality"]["reason"], "http-403")
        self.assertEqual(changes["shotQuality"]["status"], "failed")
        self.assertEqual(changes["shooting"]["reason"], "source-timeout")
        self.assertEqual(changes["officiating"]["status"], "unavailable")
        self.assertIn("shotQuality: failed; reason: http-403", summary)
        published = merge_candidate(empty_manifest(NOW), candidate, {}, datetime.now(timezone.utc).isoformat())
        self.assertEqual(published["checks"]["shotQuality"], {"status": "failed", "checkedAt": changes["shotQuality"]["checkedAt"]})

    def test_absent_unknown_or_invalid_sidecar_reason_is_generic(self):
        for diagnostic in (None, b"not json", {"schemaVersion": 1, "reason": SECRET},
                           {"schemaVersion": 1, "reason": "published"}, {"schemaVersion": True, "reason": "http-403"},
                           {"schemaVersion": 2, "reason": "http-403"},
                           {"schemaVersion": 1, "reason": "http-403", "error": SECRET}):
            with self.subTest(diagnostic=diagnostic):
                candidate, _ = self.collect(diagnostic)
                self.assertEqual(candidate["datasets"]["shotQuality"]["reason"], "source-error")

    def test_valid_empty_source_has_an_observation_reason_not_a_transport_failure(self):
        candidate, summary = self.collect(None, code=3)
        self.assertEqual(candidate["datasets"]["shotQuality"]["status"], "unavailable")
        self.assertEqual(candidate["datasets"]["shotQuality"]["reason"], "no-observed-shots")
        self.assertIn("no-observed-shots", summary)

    def test_run_clears_prior_reason_before_child_and_keeps_stderr_private(self):
        with tempfile.TemporaryDirectory() as directory:
            diagnostic = Path(directory, "reason.json")
            diagnostic.write_text('{"schemaVersion":1,"reason":"http-403"}')

            def child(*args, **kwargs):
                self.assertFalse(diagnostic.exists())
                self.assertEqual(kwargs["env"]["FULLCOURT_COLLECTION_REASON_PATH"], str(diagnostic))
                return subprocess.CompletedProcess([], 1, SECRET.encode(), SECRET.encode())

            with patch.object(collector.subprocess, "run", side_effect=child):
                self.assertEqual(collector.run(["child"], 90, reason_path=diagnostic), 1)
            self.assertFalse(diagnostic.exists())


if __name__ == "__main__":
    unittest.main()
