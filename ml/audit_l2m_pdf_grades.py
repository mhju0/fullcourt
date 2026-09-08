"""Independently count IC/INC labels by their PDF review-column coordinates."""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

XHTML = "{http://www.w3.org/1999/xhtml}"


def source_error_counts(path):
    raw = subprocess.check_output(["pdftotext", "-bbox", str(path), "-"])
    # Poppler can preserve XML-forbidden controls from the source PDF text layer.
    xml = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", raw.decode("utf-8", errors="replace"))
    counts = Counter()
    for page in ET.fromstring(xml).iter(XHTML + "page"):
        words = list(page.iter(XHTML + "word"))
        headers = [float(word.attrib["xMin"]) for word in words
                   if word.text == "Review" and any(
                       other.text == "Decision"
                       and abs(float(other.attrib["yMin"]) - float(word.attrib["yMin"])) < 1
                       and 0 < float(other.attrib["xMin"]) - float(word.attrib["xMin"]) < 60
                       for other in words)]
        if words and not headers:
            raise ValueError(f"Missing review-column header: {path}")
        threshold = min(headers) if headers else float(page.attrib["width"])
        for word in words:
            if float(word.attrib["xMin"]) > threshold and re.fullmatch(r"(?:IC|INC)\*?", word.text or ""):
                counts[word.text.rstrip("*")] += 1
    return counts


def check_report(path):
    data = json.loads(path.with_suffix(".json").read_text())
    parsed = Counter(event["CallRatingName"] for event in data["l2m"]
                     if event["CallRatingName"] in ("IC", "INC"))
    source = source_error_counts(path)
    if parsed != source:
        return {"file": str(path), "parsed": dict(parsed), "sourceColumn": dict(source)}
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("normalized", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    files = sorted(args.normalized.glob("20*/*.pdf"))
    if not files:
        parser.error("No normalized source PDFs found")
    with ThreadPoolExecutor(max_workers=4) as pool:
        mismatches = [result for result in pool.map(check_report, files) if result]
    args.out.write_text(json.dumps({"reports": len(files), "mismatches": mismatches}, indent=2) + "\n")
    print(f"PDFs: {len(files)}; mismatches: {len(mismatches)}")
    if mismatches:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
