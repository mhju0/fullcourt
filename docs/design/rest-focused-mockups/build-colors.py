from pathlib import Path
import re,json,math
root=Path(__file__).parent
if 'shooting_source' not in globals():
 import runpy
 runpy.run_path(str(root/'build.py'))
 raise SystemExit
source=shooting_source
p=json.loads((root/'data/player-rest.json').read_text())
rows=sorted([r for r in p['seasons'] if r[1]==2025 and r[5]>=300],key=lambda r:-r[5])[:20]
variants=[('cell','01 · Tinted difference','Color stays in the difference column. The quietest treatment.'),('bar','02 · Centered bar','Bars extend left for negative and right for positive. Direction and size remain readable without color.'),('row','03 · Row gradient','A subtle wash spans each player row. The strongest treatment for scanning the list.')]
legend='''<div class="color-legend"><div><span class="negative">− Lower with rest</span><span class="positive">+ Higher with rest</span></div><div class="scale" aria-label="Color intensity scale: minus 10 to plus 10 percentage points"><i></i><div><span>−10 pp</span><span>0</span><span>+10 pp</span></div></div><p id="color-note">Color strength shows the size of the difference, capped at ±10 pp. † Quieter marks: difference smaller than its estimated standard error. These comparisons do not establish that rest caused a change.</p></div>'''
for kind,title,desc in variants:
 index=[0]
 def replace(match):
  r=rows[index[0]];index[0]+=1
  delta=r[10]-r[8];quiet=abs(delta)<math.sqrt(2500/r[7]+2500/r[9]);strength=min(abs(delta)/10,1)
  sign='positive' if delta>=0 else 'negative'
  rgb='22,101,52' if delta>=0 else '180,35,24'
  opacity=(.05+.20*strength)*(.45 if quiet else 1)
  row=match[0].replace('<tr ',f'<tr class="{sign}{" quiet" if quiet else ""}" style="--wash:rgba({rgb},{opacity:.3f});--extent:{strength*50:.2f}%;" ',1)
  marker='<sup aria-label="difference smaller than estimated standard error">†</sup>' if quiet else ''
  row=re.sub(r'<td>([^<]*)</td></tr>$',lambda m:f'<td class="difference" aria-describedby="color-note"><span class="difference-value">{m[1]}{marker}</span><span class="delta-bar" aria-hidden="true"><i></i></span></td></tr>',row)
  return row
 html=re.sub(r'<tr data-player=.*?</tr>',replace,source)
 assert index[0]==20
 html=html.replace('href="styles.css">','href="styles.css"><link rel="stylesheet" href="shooting-colors.css">')
 html=html.replace('<body class="">',f'<body class="color-{kind}">')
 html=html.replace('<div class="dense-table-wrap">',legend+'<div class="dense-table-wrap">')
 html=html.replace('Design review · real data snapshot ·',f'<a href="shooting-colors.html">Color options</a> · {title} ·')
 (root/f'shooting-color-{kind}.html').write_text(html)
 if kind=='cell':
  selected=html.replace(f'<a href="shooting-colors.html">Color options</a> · {title} ·', 'Selected design · A: tinted difference cells ·')
  (root/'shooting.html').write_text(selected)
options=''.join(f'<button type="button" data-kind="{k}" aria-pressed="{str(i==0).lower()}">{t}</button>' for i,(k,t,d) in enumerate(variants))
descriptions=json.dumps({k:d for k,t,d in variants})
(root/'shooting-colors.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shooting color options · FullCourt</title><link rel="stylesheet" href="styles.css"><style>body{padding:24px}h1{font-size:28px;margin:0 0 8px}.controls{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}button{min-height:44px;padding:8px 14px;border:1px solid #c7cbd0;border-radius:5px;background:white;color:#17191d}button[aria-pressed=true]{background:#17191d;color:white}button:focus-visible,a:focus-visible{outline:3px solid #2563eb;outline-offset:3px}.canvas{overflow:auto;background:#e9eaec;padding:16px}iframe{display:block;width:1280px;height:1600px;border:0;background:white}p{max-width:850px}#description{min-height:48px}a{display:inline-flex;align-items:center;min-height:44px} @media(max-width:600px){body{padding:12px}.canvas{padding:0}}</style><body><h1>Shooting by Rest · Color options</h1><p>Selected: A · Tinted difference cells. Previous alternatives are retained for reference.</p><div class="controls" aria-label="Color treatment">'''+options+'''</div><p id="description" aria-live="polite">'''+variants[0][2]+'''</p><div class="controls" aria-label="Preview width"><button data-width="1280" aria-pressed="true">Desktop · 1280</button><button data-width="390" aria-pressed="false">Mobile · 390</button><a id="direct" href="shooting-color-cell.html">Open selected mock ↗</a></div><div class="canvas"><iframe title="Shooting table color preview" src="shooting-color-cell.html"></iframe></div><script>const descriptions='''+descriptions+''';document.querySelectorAll('[data-kind]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));const url=`shooting-color-${button.dataset.kind}.html`;document.querySelector('iframe').src=url;document.querySelector('#direct').href=url;document.querySelector('#description').textContent=descriptions[button.dataset.kind]});document.querySelectorAll('[data-width]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelector('iframe').style.width=button.dataset.width+'px'});</script></body></html>''')
