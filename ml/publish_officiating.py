"""Publish validated regular-season L2M snapshots; fail before writing on incomplete input."""

from __future__ import annotations
import argparse
from collections import Counter
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from collect_l2m_season import validate_report
from analyze_l2m_season import audit_duplicates


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "p", "div"):
            self.parts.append("\n")


def verdict(value):
    parser = TextOnly()
    parser.feed(value or "")
    return unescape("".join(parser.parts)).strip()


def category(raw):
    return re.sub(r"\s+", " ", raw.strip()) or "Category not supplied"


def build(snapshot, previous=None, crews=None, duplicates=None):
    manifest = json.loads((snapshot / "manifest.json").read_text())
    records = manifest["reports"]
    if (
        manifest["failed_reports"]
        or len(records) != manifest["indexed_reports"]
        or len({r["game_id"] for r in records}) != len(records)
    ):
        raise ValueError("Incomplete or duplicate manifest")
    if (
        hashlib.sha256((snapshot / "index.html").read_bytes()).hexdigest()
        != manifest["index_sha256"]
    ):
        raise ValueError("Index hash mismatch")
    games, details = [], {}
    for record in records:
        gid = record["game_id"]
        if record["status"] != "ok":
            raise ValueError("Failed report")
        if not re.fullmatch(r"\d{10}", gid) or gid[3:5] != manifest["season"][2:4]:
            raise ValueError("Wrong season identity")
        raw = (snapshot / f"{gid}.json").read_bytes()
        if hashlib.sha256(raw).hexdigest() != record["sha256"]:
            raise ValueError("Report hash mismatch")
        data = json.loads(raw.decode("utf-8-sig"))
        validate_report(data, gid)
        if data.get("sourcePdf"):
            source_hash = hashlib.sha256((snapshot / f"{gid}.pdf").read_bytes()).hexdigest()
            if source_hash != record.get("source_pdf_sha256") or source_hash != data["sourcePdf"]["sha256"]:
                raise ValueError("PDF source hash mismatch")
            if data["sourcePdf"]["url"] != record["report_url"]:
                raise ValueError("PDF source URL mismatch")
        if not gid.startswith("002"):
            continue
        audit_duplicates(
            data["l2m"], gid, record["sha256"], (duplicates or {}).get(gid)
        )
        meta = data["game"][0]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["GameDate"][:10]):
            raise ValueError("Invalid game date")
        events = []
        for i, e in enumerate(data["l2m"]):
            video = str(e.get("VideolLink") or "")
            events.append(
                {
                    "id": f"{gid}:{i}",
                    "period": e["PeriodName"],
                    "clock": e["PCTime"],
                    "category": category(e["CallType"]),
                    "grade": str(e["CallRatingName"] or "").strip(),
                    "verdict": verdict(e.get("Comment")),
                    "video": (
                        f"https://official.nba.com/last-two-minute-report/?gameNo={gid}&eventNum={video}"
                        if re.fullmatch(r"\d+", video)
                        else None
                    ),
                }
            )
        errors = [e for e in events if e["grade"] in ("IC", "INC")]
        known = (crews or {}).get(gid)
        crew = (
            known["crew"]
            if known
            and (known["date"], known["home"], known["away"])
            == (meta["GameDate"][:10], meta["Home_team_abbr"], meta["Away_team_abbr"])
            else []
        )
        game = {
            "id": gid,
            "date": meta["GameDate"][:10],
            "home": meta["Home_team_abbr"],
            "away": meta["Away_team_abbr"],
            "homeName": meta["Home_team"],
            "awayName": meta["Away_team"],
            "missed": sum(e["grade"] == "INC" for e in events),
            "wrong": sum(e["grade"] == "IC" for e in events),
            "ungraded": sum(e["grade"] in ("", "Undetectable", "NCI", "NCC") for e in events),
            "categories": dict(Counter(e["category"] for e in errors)),
            "source": record["report_url"],
            "sha256": record["sha256"],
        }
        games.append(game)
        details[gid] = {
            "id": gid,
            "source": record["report_url"],
            "sha256": record["sha256"],
            "crew": crew,
            "events": events,
            **({"sourcePdf": data["sourcePdf"]} if data.get("sourcePdf") else {}),
        }
    if not games:
        raise ValueError("No regular-season reports; retain existing published data")
    if previous and not {g["id"] for g in previous["games"]} <= {
        g["id"] for g in games
    }:
        raise ValueError(
            "Previously published reports disappeared; review before publication"
        )
    counts = Counter()
    for g in games:
        counts.update(g["categories"])
    result = {
        "season": manifest["season"],
        "refreshedAt": manifest["finished_at"],
        "through": max(g["date"] for g in games),
        "indexSource": manifest["index_url"],
        "indexSha256": manifest["index_sha256"],
        "missed": sum(g["missed"] for g in games),
        "wrong": sum(g["wrong"] for g in games),
        "categories": dict(counts.most_common()),
        "games": sorted(games, key=lambda g: (g["date"], g["id"]), reverse=True),
    }
    return result, details


def main():
    p = argparse.ArgumentParser()
    p.add_argument("snapshots", type=Path, nargs="+")
    p.add_argument("--duplicate-review", type=Path)
    p.add_argument("--root", type=Path, default=Path("."))
    args = p.parse_args()
    index = args.root / "src/data/officiating.json"
    current = json.loads(index.read_text()) if index.exists() else {"seasons": []}
    seasons = {s["season"]: s for s in current["seasons"]}
    writes = []
    for snapshot in args.snapshots:
        season = json.loads((snapshot / "manifest.json").read_text())["season"]
        research = args.root / "docs/research" / f"2026-09-06-l2m-{season}-results.json"
        if season == "2025-26":
            research = args.root / "docs/research/2026-09-06-l2m-season-results.json"
        crews = (
            {g["game_id"]: g for g in json.loads(research.read_text())["games"]}
            if research.exists()
            else {}
        )
        review = (
            args.root
            / "docs/research"
            / f"2026-09-06-l2m-{season}-reviewed-duplicates.json"
        )
        duplicates = json.loads(review.read_text()) if review.exists() else {}
        if args.duplicate_review:
            duplicates.update(json.loads(args.duplicate_review.read_text()))
        result, details = build(snapshot, seasons.get(season), crews, duplicates)
        seasons[season] = result
        for gid, detail in details.items():
            path = args.root / "public/data/officiating" / season / f"{gid}.json"
            # The content hash in the path keeps open older pages consistent across deployments.
            path = path.with_name(f'{gid}-{detail["sha256"][:16]}.json')
            writes.append((path, detail))
    for path, data in writes:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
    index.parent.mkdir(parents=True, exist_ok=True)
    index.write_text(
        json.dumps(
            {"seasons": sorted(seasons.values(), key=lambda s: s["season"])},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    )
    print(f"Published {len(writes)} reports; {len(seasons)} seasons")


if __name__ == "__main__":
    main()
