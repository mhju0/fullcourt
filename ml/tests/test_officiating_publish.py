import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))
from publish_officiating import build, verdict


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
                json.dumps({"reports": [], "failed_reports": 1, "indexed_reports": 1})
            )
            with self.assertRaises(ValueError):
                build(p)

    def fixture(self, p):
        season = json.loads((ROOT / "src/data/officiating.json").read_text())[
            "seasons"
        ][-1]
        g = season["games"][0]
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
