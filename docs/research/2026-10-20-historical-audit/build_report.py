"""Build the owner's HTML review from the audit notes and season inventory."""
from pathlib import Path
import csv
import html
import re
import markdown

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1]
OUTPUT = DOCS / "reports/2026-10-20-historical-schedule-travel-audit.html"


def render_note(relative):
    source = (HERE / relative).read_text()
    rendered = markdown.markdown(source, extensions=["tables", "fenced_code"])
    prefix = "../research/2026-10-20-historical-audit/" + str(Path(relative).parent) + "/"

    def relocate(match):
        value = match.group(1)
        if value.startswith(("https://", "http://", "#", "mailto:")):
            return match.group(0)
        return 'href="' + html.escape(prefix + value, quote=True) + '"'

    return re.sub(r'href="([^"]+)"', relocate, rendered)


def inventory():
    with (HERE / "numeric/season-counts.csv").open() as handle:
        rows = list(csv.DictReader(handle))
    columns = [
        ("season", "Season"), ("games", "Stored games"),
        ("published_outcome_games", "Eligible final outcomes"),
        ("oracle_current_home_streak_mismatches", "Home streak mismatches"),
        ("published_side_changes", "Diagnostic side/no-call changes"),
        ("published_size_changes", "Diagnostic size changes"),
    ]
    table = '<table><caption>Coverage and homecoming sensitivity for every stored season</caption><thead><tr>'
    table += "".join("<th scope=\"col\">" + label + "</th>" for _, label in columns)
    table += "</tr></thead><tbody>"
    for row in rows:
        table += "<tr>" + "".join("<td>" + html.escape(row[key]) + "</td>" for key, _ in columns) + "</tr>"
    return table + "</tbody></table>"


def main():
    previous = (DOCS / "reports/2026-10-20-full-season-travel-audit.html").read_text()
    style = re.search(r"<style>(.*?)</style>", previous, re.S).group(1)
    style += "pre{white-space:pre-wrap;overflow-wrap:anywhere}caption{text-align:left;font-weight:650;margin-bottom:16px}summary{cursor:pointer;font-weight:650;padding:12px 0}details{margin:24px 0}a:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:3px solid #5145ee;outline-offset:4px}td:not(:first-child){font-variant-numeric:tabular-nums}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}"
    sections = [("findings", "README.md")]
    for anchor, relative in [("sources", "sources/README.md"), ("supplement", "sources/supplement/README.md"), ("venues", "venues/README.md")]:
        if (HERE / relative).exists():
            sections.append((anchor, relative))
    navigation = '<a href="#findings">Findings and recommendations</a><a href="#coverage">All-season inventory</a>'
    navigation += "".join('<a href="#' + anchor + '">' + {"sources": "Core schedule sources", "supplement": "Additional early archive", "venues": "Venues and itineraries"}[anchor] + "</a>" for anchor, _ in sections[1:])
    body = ""
    for anchor, relative in sections:
        rendered = render_note(relative)
        if anchor == "sources":
            rendered = rendered.replace("</h1>", '</h1><p><strong>Initial frozen source pass.</strong> This section preserves the original coverage and 589 overtime cases. The additional archive section below expands the combined total to 783; the main findings and combined coverage matrix use both passes.</p>', 1)
        body += '<article id="' + anchor + '">' + rendered + "</article>"
    body += '<article id="coverage"><h2>All-season inventory</h2><p>Zero outcome rows for 2026-27 means those games have not been played. Home streak mismatches include games where the retained streak is too short to add scoring load. Side and size changes overlap.</p>' + inventory() + "</article>"
    document = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FullCourt: all-season schedule and travel audit</title><style>' + style + '</style></head><body><header><p>FullCourt · October 20, 2026 · Read-only historical audit</p><nav aria-label="Report sections">' + navigation + '</nav></header><main>' + body + '</main><footer>Production scores, model coefficients and generated analytics are unchanged. Raw captures remain local; manifests and reproducible research outputs accompany this report.</footer></body></html>'
    document = document.replace("<table>", '<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable evidence table"><table>').replace("</table>", "</table></div>")
    OUTPUT.write_text(document)


if __name__ == "__main__":
    main()
