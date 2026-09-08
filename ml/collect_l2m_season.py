"""Snapshot the official season index and its report JSON; see l2m_season_preregistration.md."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, urljoin, urlparse


class ReportLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = {}

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href", "")
        if tag != "a":
            return
        url = urljoin("https://official.nba.com/", href)
        parsed = urlparse(url)
        if parsed.hostname != "official.nba.com" or parsed.path != "/l2m/L2MReport.html":
            return
        game_id = parse_qs(parsed.query).get("gameId", [""])[0]
        if re.fullmatch(r"\d{10}", game_id):
            self.links[game_id] = url


def fetch(url):
    result = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "30",
         "--retry", "2", "--retry-delay", "1", "--user-agent", "Mozilla/5.0", url],
        capture_output=True, check=True,
    )
    return result.stdout


def validate_report(data, game_id):
    games = data.get("game", [])
    if len(games) != 1 or games[0].get("GameId") != game_id:
        raise ValueError(f"Wrong report identity: {game_id}")
    events = data.get("l2m")
    if not isinstance(events, list) or not events:
        raise ValueError(f"Missing reviewed events: {game_id}")
    for row in events:
        if row.get("CallRatingName") not in ("CC", "CNC", "IC", "INC", "", None):
            raise ValueError(f"Unknown grade: {row.get('CallRatingName')}")
        if not row.get("PeriodName") or not row.get("CallType"):
            raise ValueError(f"Missing event fields: {game_id}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2025-26")
    parser.add_argument("--out", type=Path, default=Path("ml/data/l2m-research"))
    args = parser.parse_args()
    if not re.fullmatch(r"20\d{2}-\d{2}", args.season):
        parser.error("Expected season YYYY-YY")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    dest = args.out / args.season / stamp
    dest.mkdir(parents=True)
    index_url = f"https://official.nba.com/{args.season}-nba-officiating-last-two-minute-reports/"
    raw = fetch(index_url)
    (dest / "index.html").write_bytes(raw)
    links = ReportLinks()
    links.feed(raw.decode("utf-8-sig"))
    if not links.links:
        raise ValueError("No report links; do not treat an empty index as a completed season")
    expected_year = args.season[2:4]
    if any(gid[3:5] != expected_year for gid in links.links):
        raise ValueError("Season index contains mismatched game IDs")
    manifest = {
        "season": args.season, "started_at": stamp, "index_url": index_url,
        "index_sha256": hashlib.sha256(raw).hexdigest(),
        "indexed_reports": len(links.links), "reports": [],
    }

    def download(item):
        game_id, report_url = item
        url = f"https://official.nba.com/l2m/json/{game_id}.json"
        record = {"game_id": game_id, "report_url": report_url, "data_url": url}
        try:
            body = fetch(url)
            (dest / f"{game_id}.json").write_bytes(body)
            record["sha256"] = hashlib.sha256(body).hexdigest()
            validate_report(json.loads(body.decode("utf-8-sig")), game_id)
            record["status"] = "ok"
        except (subprocess.CalledProcessError, ValueError) as exc:
            record["status"] = "failed"
            record["error"] = str(exc)
        record["retrieved_at"] = datetime.now(timezone.utc).isoformat()
        return record

    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, record in enumerate(pool.map(download, sorted(links.links.items())), 1):
            manifest["reports"].append(record)
            if i % 50 == 0:
                print(f"Fetched {i}/{len(links.links)}", flush=True)
    manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
    manifest["failed_reports"] = sum(r["status"] != "ok" for r in manifest["reports"])
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"snapshot": str(dest), "indexed": len(links.links), "failed": manifest["failed_reports"]}))
    if manifest["failed_reports"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
