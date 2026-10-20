import hashlib
from datetime import datetime, timedelta
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))
from publish_officiating import build, canonical_external_id, load_aliases, verdict


class PublisherTests(unittest.TestCase):
    def test_published_counts_match_detail_evidence(self):
        index = json.loads((ROOT / "src/data/officiating.json").read_text())
        for s in index["seasons"]:
            missed = wrong = 0
            for g in s["games"]:
                d = json.loads(
                    (
                        ROOT
                        / "public/data/officiating"
                        / s["season"]
                        / f'{g["id"]}-{g["sha256"][:16]}.json'
                    ).read_text()
                )
                self.assertEqual(d["id"], g["id"])
                self.assertEqual(d["sha256"], g["sha256"])
                m = sum(e["grade"] == "INC" for e in d["events"])
                w = sum(e["grade"] == "IC" for e in d["events"])
                self.assertEqual((m, w), (g["missed"], g["wrong"]))
                self.assertEqual(sum(g["categories"].values()), m + w)
                missed += m
                wrong += w
            self.assertEqual((missed, wrong), (s["missed"], s["wrong"]))

    def test_incomplete_snapshot_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            (p / "manifest.json").write_text(
                json.dumps({"reports": [], "failed_reports": 1, "indexed_reports": 1,
                            "finished_at": "2026-10-12T12:00:00+00:00"})
            )
            with self.assertRaisesRegex(ValueError, "Incomplete"):
                build(p)

    def fixture(self, p, season_index=-1, game_id=None):
        season = json.loads((ROOT / "src/data/officiating.json").read_text())[
            "seasons"
        ][season_index]
        g = next(g for g in season["games"] if g["id"] == game_id) if game_id else season["games"][0]
        detail = json.loads(
            (
                ROOT
                / "public/data/officiating"
                / season["season"]
                / f'{g["id"]}-{g["sha256"][:16]}.json'
            ).read_text()
        )
        raw = {
            "game": [
                {
                    "GameId": g["id"],
                    "GameDate": g["date"],
                    "Home_team_abbr": g["home"],
                    "Away_team_abbr": g["away"],
                    "Home_team": g["homeName"],
                    "Away_team": g["awayName"],
                }
            ],
            "l2m": [
                {
                    "PeriodName": e["period"],
                    "PCTime": e["clock"],
                    "CallType": e["category"],
                    "CallRatingName": e["grade"],
                    "Comment": e["verdict"],
                }
                for e in detail["events"]
            ],
        }
        body = json.dumps(raw).encode()
        (p / f'{g["id"]}.json').write_bytes(body)
        (p / "index.html").write_bytes(b"fixture-index")
        manifest = {
            "season": season["season"],
            "failed_reports": 0,
            "indexed_reports": 1,
            "index_sha256": hashlib.sha256(b"fixture-index").hexdigest(),
            "index_url": season["indexSource"],
            "finished_at": season["refreshedAt"],
            "reports": [
                {
                    "game_id": g["id"],
                    "status": "ok",
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "report_url": g["source"],
                }
            ],
        }
        (p / "manifest.json").write_text(json.dumps(manifest))
        return g, raw, manifest

    def test_changed_source_hash_and_disappeared_report_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            g, raw, manifest = self.fixture(p)
            valid, _ = build(p)
            self.assertEqual(valid["missed"], g["missed"])
            with self.assertRaisesRegex(ValueError, "disappeared"):
                build(p, {"games": [{"id": "0022500001"}]})
            (p / f'{g["id"]}.json').write_text("{}")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                build(p)

    def test_cup_alias_preserves_nba_report_and_content_addressed_detail_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            g, _, _ = self.fixture(p, season_index=-2, game_id="0022401229")
            published, details = build(p)
            game = published["games"][0]
            self.assertEqual(game["id"], "0022401229")
            self.assertEqual(game["canonicalExternalId"], "bref-202412140MIL")
            self.assertEqual((game["date"], game["home"], game["away"]), ("2024-12-14", "MIL", "ATL"))
            self.assertEqual((game["source"], game["sha256"]), (g["source"], hashlib.sha256((p / "0022401229.json").read_bytes()).hexdigest()))
            self.assertEqual(list(details), ["0022401229"])
            self.assertTrue(all(e["id"].startswith("0022401229:") for e in details["0022401229"]["events"]))

    def test_alias_requires_exact_nba_date_and_designated_teams(self):
        aliases = load_aliases()
        meta = {"GameId": "0022401229", "GameDate": "2024-12-14T16:30:00",
                "Home_team_abbr": "MIL", "Away_team_abbr": "ATL",
                "HomeTeamId": 1610612749, "AwayTeamId": 1610612737}
        self.assertEqual(canonical_external_id(meta, aliases), "bref-202412140MIL")
        for field, value in (("GameDate", "2024-12-15"), ("Home_team_abbr", "ATL"),
                             ("Away_team_abbr", "MIL"), ("HomeTeamId", 1610612737),
                             ("AwayTeamId", 1610612749)):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "alias.*differs"):
                canonical_external_id(dict(meta, **{field: value}), aliases)
        self.assertEqual(canonical_external_id({"GameId": "0022400001"}, aliases), "0022400001")

    def test_duplicate_or_malformed_aliases_fail_closed(self):
        rows = list(load_aliases().values())
        for changed in (rows + [rows[0]], rows + [dict(rows[0], gameId="0022409999")],
                        [dict(rows[0], canonicalId="bref-202411030WAS")]):
            with tempfile.TemporaryDirectory() as temp:
                p = Path(temp) / "context.json"
                p.write_text(json.dumps({"historyAliases": changed}))
                with self.assertRaisesRegex(ValueError, "alias"):
                    load_aliases(p)

    def test_older_snapshot_cannot_replace_published_season(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            _, _, manifest = self.fixture(p)
            manifest["finished_at"] = "2026-10-12T12:00:00+00:00"
            (p / "manifest.json").write_text(json.dumps(manifest))
            previous, _ = build(p)
            manifest["finished_at"] = "2026-10-11T12:00:00+00:00"
            (p / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "older"):
                build(p, previous)

    def test_equal_time_requires_identical_source_provenance(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            self.fixture(p)
            previous, _ = build(p)
            for field in ("index_sha256", "report_hash", "report_url", "report_id"):
                with self.subTest(field=field):
                    changed = json.loads(json.dumps(previous))
                    if field == "index_sha256":
                        changed["indexSha256"] = "different-index"
                    elif field == "report_hash":
                        changed["games"][0]["sha256"] = "different-report"
                    elif field == "report_url":
                        changed["games"][0]["source"] = "https://example.test/changed"
                    else:
                        changed["games"] = []
                    with self.assertRaisesRegex(ValueError, "same timestamp"):
                        build(p, changed)

    def test_timezone_offsets_and_idempotent_snapshot_are_supported(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            g, _, manifest = self.fixture(p)
            manifest["finished_at"] = "2026-10-12T12:00:00Z"
            (p / "manifest.json").write_text(json.dumps(manifest))
            previous, details = build(p)
            replay, replay_details = build(p, previous)
            self.assertEqual((replay, replay_details), (previous, details))
            _, crew_details = build(p, previous, crews={g["id"]: {
                "date": g["date"], "home": g["home"], "away": g["away"],
                "crew": ["Verified assignment"],
            }})
            self.assertEqual(crew_details[g["id"]]["crew"], ["Verified assignment"])
            manifest["finished_at"] = "2026-10-12T08:00:00-04:00"
            (p / "manifest.json").write_text(json.dumps(manifest))
            build(p, previous)
            manifest["finished_at"] = "2026-10-12T08:01:00-04:00"
            (p / "manifest.json").write_text(json.dumps(manifest))
            newer, _ = build(p, previous)
            self.assertEqual(newer["refreshedAt"], manifest["finished_at"])
            manifest["finished_at"] = "2026-10-12T13:00:00+02:00"
            (p / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "older"):
                build(p, previous)

    def test_missing_invalid_and_naive_publication_times_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            _, _, manifest = self.fixture(p)
            previous, _ = build(p)
            for value in (None, "invalid", "2026-10-12", "2026-10-12T12:00:00", 42):
                with self.subTest(value=value):
                    invalid = dict(manifest)
                    invalid["finished_at"] = value
                    (p / "manifest.json").write_text(json.dumps(invalid))
                    for publication in (None, previous):
                        with self.assertRaisesRegex(ValueError, "Snapshot finished_at"):
                            build(p, publication)
                    (p / "manifest.json").write_text(json.dumps(manifest))
                    invalid_previous = dict(previous, refreshedAt=value)
                    with self.assertRaisesRegex(ValueError, "Published refreshedAt"):
                        build(p, invalid_previous)
            del manifest["finished_at"]
            (p / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "Snapshot finished_at"):
                build(p)
            manifest["finished_at"] = previous["refreshedAt"]
            (p / "manifest.json").write_text(json.dumps(manifest))
            del previous["refreshedAt"]
            with self.assertRaisesRegex(ValueError, "Published refreshedAt"):
                build(p, previous)

    def run_publisher(self, output, *snapshots):
        return subprocess.run(
            [sys.executable, str(ROOT / "ml/publish_officiating.py"),
             *(str(p) for p in snapshots), "--root", str(output)],
            capture_output=True, text=True,
        )

    def test_cli_validates_entire_repeated_season_batch_before_writing(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            newer, older = output / "newer", output / "older"
            for snapshot, timestamp in (
                (newer, "2026-10-12T12:00:00+00:00"),
                (older, "2026-10-11T12:00:00+00:00"),
            ):
                snapshot.mkdir()
                _, _, manifest = self.fixture(snapshot)
                manifest["finished_at"] = timestamp
                (snapshot / "manifest.json").write_text(json.dumps(manifest))
            previous, _ = build(older)
            index = output / "src/data/officiating.json"
            index.parent.mkdir(parents=True)
            index.write_text(json.dumps({"seasons": [previous]}))
            retained = output / "public/data/officiating/retained.json"
            retained.parent.mkdir(parents=True)
            retained.write_bytes(b"older content-addressed version\n")
            before = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
            rejected = self.run_publisher(output, newer, older)
            self.assertNotEqual(rejected.returncode, 0, rejected.stdout)
            self.assertIn("older", rejected.stderr)
            after = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
            self.assertEqual(after, before)

    def test_cli_accepts_newer_and_repeated_identical_snapshots(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            snapshot = output / "snapshot"
            snapshot.mkdir()
            _, _, manifest = self.fixture(snapshot)
            first = self.run_publisher(output, snapshot)
            self.assertEqual(first.returncode, 0, first.stderr)
            index = output / "src/data/officiating.json"
            retained = output / "public/data/officiating/older-content-hash.json"
            retained.write_bytes(b"retained source version\n")
            before = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
            replay = self.run_publisher(output, snapshot, snapshot)
            self.assertEqual(replay.returncode, 0, replay.stderr)
            self.assertEqual(
                {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}, before,
            )
            manifest["finished_at"] = (
                datetime.fromisoformat(manifest["finished_at"]) + timedelta(days=1)
            ).isoformat()
            (snapshot / "manifest.json").write_text(json.dumps(manifest))
            refresh = self.run_publisher(output, snapshot)
            self.assertEqual(refresh.returncode, 0, refresh.stderr)
            self.assertEqual(json.loads(index.read_text())["seasons"][0]["refreshedAt"], manifest["finished_at"])
            self.assertEqual(retained.read_bytes(), b"retained source version\n")

    def test_cli_rejects_mixed_season_batch_without_partial_publication(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            valid, stale = output / "valid", output / "stale"
            valid.mkdir()
            stale.mkdir()
            self.fixture(valid)
            self.fixture(stale, season_index=-2)
            previous, _ = build(stale)
            previous["refreshedAt"] = "2026-10-12T12:00:00+00:00"
            index = output / "src/data/officiating.json"
            index.parent.mkdir(parents=True)
            index.write_text(json.dumps({"seasons": [previous]}))
            before = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
            rejected = self.run_publisher(output, valid, stale)
            self.assertNotEqual(rejected.returncode, 0, rejected.stdout)
            self.assertIn("older", rejected.stderr)
            self.assertEqual(
                {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}, before,
            )

    def test_pdf_evidence_hash_and_url_are_verified(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            g, raw, manifest = self.fixture(p)
            pdf = p / f'{g["id"]}.pdf'
            pdf.write_bytes(b"source fixture")
            digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
            raw["sourcePdf"] = {"url": g["source"], "sha256": digest, "parser": "fixture"}
            body = json.dumps(raw).encode()
            (p / f'{g["id"]}.json').write_bytes(body)
            manifest["reports"][0].update(sha256=hashlib.sha256(body).hexdigest(), source_pdf_sha256=digest)
            (p / "manifest.json").write_text(json.dumps(manifest))
            build(p)
            pdf.write_bytes(b"changed source")
            with self.assertRaisesRegex(ValueError, "PDF source hash mismatch"):
                build(p)
            pdf.write_bytes(b"source fixture")
            manifest["reports"][0]["report_url"] = "https://example.test/changed.pdf"
            (p / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "PDF source URL mismatch"):
                build(p)

    def test_duplicate_assessments_require_review(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            g, raw, manifest = self.fixture(p)
            raw["l2m"].append(raw["l2m"][0])
            body = json.dumps(raw).encode()
            (p / f'{g["id"]}.json').write_bytes(body)
            manifest["reports"][0]["sha256"] = hashlib.sha256(body).hexdigest()
            (p / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "duplicate assessments"):
                build(p)

    def test_verdict_html_becomes_text_not_markup(self):
        self.assertEqual(
            verdict("Player&apos;s <b>contact</b><br>was marginal."),
            "Player's contact\nwas marginal.",
        )


if __name__ == "__main__":
    unittest.main()
