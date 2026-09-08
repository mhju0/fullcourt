"""Snapshot the NBA's historical regular-season L2M archive, including legacy PDFs."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse, parse_qs

from collect_l2m_season import fetch

ARCHIVE = "https://official.nba.com/nba-officiating-last-two-minute-reports-archive/"


class ArchiveLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.heading = None
        self.heading_text = ""
        self.season = None
        self.links = {}
        self.content_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag == "div":
            if "entry-content" in dict(attrs).get("class", "").split():
                self.content_depth = 1
            elif self.content_depth:
                self.content_depth += 1
        if not self.content_depth:
            return
        if tag in ("h2", "h3"):
            self.heading = tag
            self.heading_text = ""
        href = urljoin(ARCHIVE, dict(attrs).get("href", ""))
        parsed = urlparse(href)
        if tag == "a" and self.season and (
            (parsed.hostname == "official.nba.com" and parsed.path == "/l2m/L2MReport.html")
            or (parsed.hostname in ("ak-static.cms.nba.com", "official.nba.com", "www.nba.com") and parsed.path.lower().endswith(".pdf"))
        ):
            self.links.setdefault(self.season, set()).add(href)

    def handle_data(self, data):
        if self.heading:
            self.heading_text += data

    def handle_endtag(self, tag):
        if tag == "div" and self.content_depth:
            self.content_depth -= 1
            if not self.content_depth:
                self.season = None
        if tag == self.heading:
            match = re.search(r"(20\d{2}-\d{2}) NBA Regular Season", self.heading_text)
            self.season = match[1] if match else None
            self.heading = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--first", default="2014-15")
    parser.add_argument("--last", default="2022-23")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    index = args.out / "index.html"
    if not index.exists():
        index.write_bytes(fetch(ARCHIVE))
    links = ArchiveLinks()
    links.feed(index.read_text(encoding="utf-8-sig"))
    work = [(season, url) for season, urls in sorted(links.links.items()) if args.first <= season <= args.last for url in sorted(urls)]
    if not work:
        raise ValueError("No historical reports found")

    def download(item):
        season, url = item
        pdf = urlparse(url).path.lower().endswith(".pdf")
        gid = parse_qs(urlparse(url).query).get("gameId", [""])[0].strip()
        source = url if pdf else f"https://official.nba.com/l2m/json/{gid}.json"
        filename = hashlib.sha256(url.encode()).hexdigest()[:24] + (".pdf" if pdf else ".json")
        path = args.out / season / filename
        path.parent.mkdir(exist_ok=True)
        record = {"season": season, "url": url, "data_url": source, "file": f"{season}/{filename}", "format": "pdf" if pdf else "json"}
        try:
            if not path.exists():
                path.write_bytes(fetch(source))
            body = path.read_bytes()
            if pdf and not body.startswith(b"%PDF"):
                raise ValueError("Expected PDF")
            if not pdf:
                data = json.loads(body.decode("utf-8-sig"))
                if data["game"][0]["GameId"] != gid:
                    raise ValueError("Report identity mismatch")
            record.update(status="ok", sha256=hashlib.sha256(body).hexdigest())
        except Exception as exc:
            record.update(status="failed", error=str(exc))
        return record

    records = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, record in enumerate(pool.map(download, work), 1):
            records.append(record)
            if i % 100 == 0:
                print(f"Fetched {i}/{len(work)}", flush=True)
    manifest = {"index_url": ARCHIVE, "index_sha256": hashlib.sha256(index.read_bytes()).hexdigest(), "finished_at": datetime.now(timezone.utc).isoformat(), "reports": records}
    (args.out / "archive-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    failed = sum(r["status"] != "ok" for r in records)
    print(f"Reports: {len(records)}; failed: {failed}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
