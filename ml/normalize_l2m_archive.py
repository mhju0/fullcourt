"""Convert archived PDFs to the report contract; retain and verify their source bytes."""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

from collect_l2m_archive import ArchiveLinks
from collect_l2m_season import validate_report

PARSER_VERSION = "pdf-layout-v1"
ROW = re.compile(r"^\s*(Q\d+|OT\d*|\dOT)\s+\.?(\d{1,2}:\d\d(?:\.\d+)?)\s+(.+)$")
DATE = re.compile(r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2})\b", re.I)


def align_grade_lines(text):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if not re.fullmatch(r"\s*(?:CNC|INC|CC|IC)\*?\s+Video\s*", line):
            continue
        neighbors = [j for j in (i - 1, i + 1) if 0 <= j < len(lines) and ROW.match(lines[j])]
        if len(neighbors) != 1:
            raise ValueError("Ambiguous detached review grade")
        j = neighbors[0]
        lines[j] += "  " + line.strip()
        lines[i] = ""
    return "\n".join(lines)


def pdf_identity(text, games):
    for line in text.splitlines():
        match = DATE.search(line)
        if "@" not in line or not match:
            continue
        date_text = match[1].replace(".", "").replace(",", "")
        for fmt in ("%b %d %Y", "%B %d %Y"):
            try:
                date = datetime.strptime(date_text, fmt).strftime("%Y-%m-%d")
                break
            except ValueError:
                continue
        else:
            raise ValueError(f"Unknown header date: {date_text}")
        matchup = re.sub(r"\(\d+\)", "", line[:match.start()]).strip(" ()")
        away, home = [s.strip(" ()") for s in matchup.split("@", 1)]
        aliases = {"Sixers": "76ers"}
        matches = [g for g in games if g["date"][:10] == date and g["home_name"] == aliases.get(home, home) and g["away_name"] == aliases.get(away, away)]
        if len(matches) != 1:
            raise ValueError(f"Unresolved PDF identity: {away} @ {home} {date}: {len(matches)} games")
        return matches[0]
    raise ValueError("Missing PDF matchup and date header")


def parse_events(text):
    events = []
    comment = False
    for line in text.splitlines():
        match = ROW.match(line)
        if match:
            parts = re.split(r"\s{2,}", match[3].strip())
            grades = re.findall(r"\b(?:CNC|INC|CC|IC)\b", match[3])
            if len(grades) > 1:
                raise ValueError("Ambiguous PDF review grade")
            events.append({"PeriodName": match[1], "PCTime": match[2], "CallType": "" if parts[0] == "[CATEGORY NOT SUPPLIED]" else parts[0], "CallRatingName": grades[0] if grades else "", "Comment": "", "VideolLink": ""})
            comment = False
        elif line.strip().startswith("Comment:"):
            if not events:
                raise ValueError("Comment before a reviewed event")
            events[-1]["Comment"] = line.strip()[len("Comment:"):].strip()
            comment = True
        elif comment:
            if not line.strip():
                comment = False
            else:
                events[-1]["Comment"] += " " + line.strip()
    if not events or any(not e["Comment"] for e in events):
        raise ValueError("Missing reviewed events or verdict text")
    if len(re.findall(r"Comment:", text)) != len(events):
        raise ValueError("PDF event/comment count mismatch")
    return events


def parse_legacy_layout(text):
    # Some PDF revisions vertically center the period/grade separately from the clock.
    lines = text.split("\n")
    for i, line in enumerate(lines):
        period = re.match(r"^\s*(Q\d+)\s+((?:(?:CNC|INC|CC|IC)\*?\s+)?Video)\s*$", line)
        if period:
            neighbors = [j for j in (i - 1, i + 1) if 0 <= j < len(lines) and re.match(r"^\s*\d{1,2}:\d\d\.\d+\s+\S", lines[j])]
            if len(neighbors) != 1:
                raise ValueError("Ambiguous split PDF row")
            j = neighbors[0]
            lines[min(i, j)] = f"{period[1]}  {lines[j].strip()}  {period[2]}"
            lines[max(i, j)] = ""
        clock_only = re.match(r"^\s*(Q\d+)\s+(\d{1,2}:\d\d\.\d+)\s*$", line)
        if clock_only and i + 1 < len(lines):
            if lines[i + 1].strip().startswith("Comment:"):
                lines[i] = line + "  [CATEGORY NOT SUPPLIED]"
                continue
            parts = re.split(r"\s{2,}", lines[i + 1].strip())
            if len(parts) < 3:
                raise ValueError("Incomplete split PDF row")
            # A wrapped verdict can precede the next category on the same printed line.
            fragment = parts.pop(0) if ":" not in parts[0] else ""
            lines[i] = fragment + "\n" + f"{clock_only[1]}  {clock_only[2]}  " + "  ".join(parts)
            lines[i + 1] = ""
    cleaned = []
    for page in "\n".join(lines).split("\f"):
        page = page.split("Common Play Abbreviations:")[0]
        start = re.search(r"^\s*Q\d+\s+\d{1,2}:\d\d", page, re.M)
        if start:
            cleaned.extend(page[start.start():].splitlines())
    events = []
    blocks = []
    for line in cleaned:
        match = ROW.match(line)
        if match:
            parts = re.split(r"\s{2,}", match[3].strip())
            grades = re.findall(r"\b(?:CNC|INC|CC|IC)\b", match[3])
            if len(grades) > 1:
                raise ValueError("Ambiguous grade")
            events.append({"PeriodName": match[1], "PCTime": match[2], "CallType": "" if parts[0] == "[CATEGORY NOT SUPPLIED]" else parts[0], "CallRatingName": grades[0] if grades else "", "Comment": "", "VideolLink": ""})
            blocks.append([])
        elif blocks:
            blocks[-1].append(line)
    if len(events) != text.count("Comment:"):
        raise ValueError("Legacy PDF row/comment count mismatch")
    for event, block in zip(events, blocks):
        if sum("Comment:" in line for line in block) != 1:
            raise ValueError("Legacy verdict assignment mismatch")
        words = [line.replace("Comment:", "").strip() for line in block]
        event["Comment"] = " ".join(word for word in words if word and not re.fullmatch(r"[\d:.\s]+(?:To[\d:.\s]+)?", word))
    return events


def normalize(root, games):
    manifest = json.loads((root / "archive-manifest.json").read_text())
    index = (root / "index.html").read_bytes()
    if hashlib.sha256(index).hexdigest() != manifest["index_sha256"]:
        raise ValueError("Archive index hash mismatch")
    links = ArchiveLinks()
    links.feed(index.decode("utf-8-sig"))
    grouped = defaultdict(list)
    failures = []
    for record in manifest["reports"]:
        season = record["season"]
        if record["url"] not in links.links.get(season, set()):
            continue
        try:
            if record["status"] != "ok":
                raise ValueError("Download failed")
            source = root / record["file"]
            raw = source.read_bytes()
            if hashlib.sha256(raw).hexdigest() != record["sha256"]:
                raise ValueError("Source hash mismatch")
            if record["format"] == "pdf":
                text = align_grade_lines(subprocess.check_output(["pdftotext", "-layout", str(source), "-"]).decode())
                game = pdf_identity(text, games)
                gid = game["id"]
                data = {"game": [{"GameId": gid, "GameDate": game["date"][:10], "Home_team_abbr": game["home"], "Away_team_abbr": game["away"], "Home_team": game["home_name"], "Away_team": game["away_name"]}], "l2m": []}
                try:
                    data["l2m"] = parse_events(text)
                except ValueError:
                    data["l2m"] = parse_legacy_layout(text)
                data["sourcePdf"] = {"url": record["url"], "sha256": record["sha256"], "parser": PARSER_VERSION}
                body = (json.dumps(data, ensure_ascii=False) + "\n").encode()
            else:
                data = json.loads(raw.decode("utf-8-sig"))
                gid = data["game"][0]["GameId"]
                body = raw
            validate_report(data, gid)
            if not gid.startswith("002") or gid[3:5] != season[2:4]:
                raise ValueError("Wrong regular-season identity")
            grouped[season].append((gid, body, record))
        except Exception as exc:
            failures.append({"season": season, "url": record["url"], "error": str(exc)})
    (root / "normalization-errors.json").write_text(json.dumps(failures, indent=2) + "\n")
    for season, records in grouped.items():
        if any(f["season"] == season for f in failures):
            continue
        if len(records) != len(links.links[season]):
            raise ValueError(f"Incomplete archive: {season}")
        dest = root / "normalized" / season
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "index.html").write_bytes(index)
        reports = []
        for gid, body, record in records:
            if any(r["game_id"] == gid for r in reports):
                raise ValueError(f"Duplicate archive game: {gid}")
            (dest / f"{gid}.json").write_bytes(body)
            report = {"game_id": gid, "report_url": record["url"], "data_url": record["data_url"], "status": "ok", "sha256": hashlib.sha256(body).hexdigest()}
            if record["format"] == "pdf":
                (dest / f"{gid}.pdf").write_bytes((root / record["file"]).read_bytes())
                report["source_pdf_sha256"] = record["sha256"]
            reports.append(report)
        (dest / "manifest.json").write_text(json.dumps({"season": season, "index_url": manifest["index_url"], "index_sha256": manifest["index_sha256"], "finished_at": manifest["finished_at"], "indexed_reports": len(reports), "failed_reports": 0, "reports": reports}, indent=2) + "\n")
        print(f"{season}: normalized {len(reports)}", flush=True)
    print(f"Unresolved reports: {len(failures)}")
    return failures


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("snapshot", type=Path)
    p.add_argument("--games", type=Path, required=True, help="Read-only game identity export with official IDs, dates and team names")
    args = p.parse_args()
    errors = normalize(args.snapshot, json.loads(args.games.read_text()))
    if errors:
        raise SystemExit(1)
