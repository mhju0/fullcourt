"""Read-only, bounded external schedule capture; no database or application writes."""
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import pathlib
import time
import urllib.request
from urllib.parse import urlsplit
import urllib.error
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[4]
RAW = ROOT / 'docs/audit/2026-10-20-historical-audit/sources'
RAW.mkdir(parents=True, exist_ok=True)
manifest = []

def get(url, name):
    p = RAW / name
    cached = p.exists()
    if not cached:
        if urlsplit(url).hostname in {'basketball-reference.com', 'www.basketball-reference.com'}:
            time.sleep(2.2)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            p.write_bytes(r.read())
    b = p.read_bytes()
    return {'url': url, 'path': str(p.relative_to(ROOT)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'captured_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'reused_audit_capture': cached}

release = json.loads((RAW / 'nba-schedule-release.json').read_text())
assets = [a for a in release['assets'] if a['name'].endswith('.csv.gz')]
with cf.ThreadPoolExecutor(max_workers=4) as ex:
    for r in ex.map(lambda a: get(a['browser_download_url'], a['name']), assets):
        manifest.append(r)
print('NBA season archives', len(assets), flush=True)
(RAW / 'fetch-manifest.json').write_text(json.dumps(manifest, indent=2))
for end in range(1986, 1997):
    base = f'https://www.basketball-reference.com/leagues/NBA_{end}_games.html'
    try:
        r = get(base, f'bref-{end}-index.html')
    except urllib.error.HTTPError as e:
        manifest.append({'url': base, 'error': str(e)})
        (RAW / 'fetch-manifest.json').write_text(json.dumps(manifest, indent=2))
        if e.code == 429:
            break
        continue
    manifest.append(r)
    soup = BeautifulSoup((ROOT / r['path']).read_bytes(), 'html.parser')
    links = sorted({a['href'] for a in soup.select('.filter a') if f'NBA_{end}_games-' in a.get('href', '')})
    for href in links:
        time.sleep(0.4)
        try:
            manifest.append(get('https://www.basketball-reference.com' + href, 'bref-' + href.rsplit('/',1)[-1]))
        except Exception as e:
            manifest.append({'url': 'https://www.basketball-reference.com' + href, 'error': str(e)})
            if isinstance(e, urllib.error.HTTPError) and e.code == 429:
                (RAW / 'fetch-manifest.json').write_text(json.dumps(manifest, indent=2))
                raise SystemExit('Stopped on provider rate limit; retained completed captures.')
    print('BRef', end, len(links), flush=True)
    (RAW / 'fetch-manifest.json').write_text(json.dumps(manifest, indent=2))
(RAW / 'fetch-manifest.json').write_text(json.dumps(manifest, indent=2))
