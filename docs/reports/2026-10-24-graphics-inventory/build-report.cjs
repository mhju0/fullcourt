const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'inventory.json')));
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json')));
const annotationsPath = path.join(root, 'annotations.json');
if (!fs.existsSync(annotationsPath)) throw new Error('annotations.json is required before building the adjacent screenshot report');
const annotations = JSON.parse(fs.readFileSync(annotationsPath));
const annotationList = (kind, id) => {
 const captures = annotations[kind]?.[id];
 if (!Array.isArray(captures) || !captures.length) throw new Error('Missing focused screenshot: ' + kind + '/' + id);
 for (const capture of captures) {
  if (!capture.file || !capture.label || !capture.route || !capture.width || !capture.capturedAt || !['focused','representative'].includes(capture.kind) || !fs.existsSync(path.join(root,capture.file))) throw new Error('Incomplete screenshot metadata: ' + id);
 }
 return captures;
};
inventory.forEach(item => annotationList('items',item.id));
for (let i=1;i<=8;i++) annotationList('findings','finding-'+i);
const captureCount = [...Object.values(annotations.items),...Object.values(annotations.findings)].reduce((total,captures) => total+captures.length,0);
const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => '&#' + c.charCodeAt(0) + ';');
const groups=[['shooting','Player Shooting by Rest',['shooting','shooting-history','shooting-career']],['home','Home',['home']],['games','Games & Team Schedule',['games','games-history','team']],['season','Season Report',['season','season-history']],['schedule','Schedule Edge',['schedule']],['analysis','Model Results',['analysis']],['home-court','Home-court Advantage',['home-court']],['playoffs','Playoff Rest',['playoffs']],['availability','Availability Cost',['availability']],['shot-quality','Expected Shot Value',['shot-quality','shot-value','shot-diff','shot-actual']],['officiating','Officiating',['officiating','officiating-history']],['archive','Referee Research Archive',['referee-archive']],['methods','Behind the Data',evidence.filter(r=>r.id.startsWith('method-')).map(r=>r.id)],['other','공통 그래픽 · 안내 화면',['engineering','explore','data-status','about']]];
const findings = [
 ['비교값 먼저 보기','폰에서 선수 정보·시도 수 뒤로 eFG%와 Gap이 밀립니다.','효율·Gap 우선','시도 수 우선','현재 순서 유지'],
 ['갱신 안내 줄이기','긴 coverage·시간 안내가 표 진입을 늦춥니다.','기준일·범위만 먼저','안내를 표 아래로','현재 안내 유지'],
 ['표 숫자 문법 맞추기','표마다 숫자 정렬·단위·행 밀도가 다릅니다.','정렬·단위부터 통일','행 밀도도 비교','표별 현행 유지'],
 ['색의 의미 설명하기','유불리·Gap·모델 차이·판정 유형에 서로 다른 색 의미가 쓰입니다.','값·부호·범례 보강','같은 의미의 색 통일','현재 색·범례 유지'],
 ['차트 상세 확인 맞추기','차트마다 선택·툴팁·시즌 탐색 방식이 다릅니다.','선택 후 값·표본 통일','터치·키보드부터 점검','차트별 현행 유지'],
 ['0·결측·불확실 구별하기','정보를 줄일 때 0회·측정 없음·불확실의 구분이 사라질 수 있습니다.','구분 유지·표현 통일','현재 표현부터 점검','현재 표현 유지'],
 ['막대의 척도 드러내기','계수 크기·방향·비율·승률 막대가 서로 다른 비교를 담습니다.','척도·기준선 보강','Availability 방향 비교','현재 막대 유지'],
 ['상세·과거 화면 함께 보기','선수 상세·전체 breakdown·Methods·아카이브에도 같은 검토가 필요합니다.','공통 기준 함께 적용','주요 화면부터 개선','현재 범위 유지']
];
const note = (key, label) => `<label class="note" for="${key}-note">${esc(label)} 메모 <span class="meta">(선택)</span><textarea id="${key}-note" data-response="${key}-note" rows="2" placeholder="생각을 자유롭게 적으세요"></textarea></label>`;
const shot = capture => `<figure data-evidence-id="${esc(capture.file)}" data-route="${esc(capture.route)}" data-kind="${esc(capture.kind)}"><div class="preview" tabindex="0" role="region" aria-label="${esc(capture.label)} 스크롤"><img data-capture loading="eager" src="data:image/jpeg;base64,${fs.readFileSync(path.join(root,capture.file)).toString('base64')}" alt="${esc(capture.label)} 실제 화면" style="--capture-width:${capture.width}px"></div><figcaption><span>${esc(capture.label)} · ${capture.width}px<br><a href="https://fullcourt.fyi${esc(capture.route)}" target="_blank" rel="noopener">${esc(capture.route)}</a> · ${esc(capture.capturedAt)}<br>${capture.kind==='representative'?'대표 상태 캡처':'대상 영역 캡처'}</span><button type="button" data-zoom>확대</button></figcaption></figure>`;
const screenshots = (kind,id) => `<div class="evidence-images">${annotationList(kind,id).map(shot).join('')}</div>`;
const save = '<button class="save" type="button" data-save>전체 저장 (HTML)</button>';
let html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FullCourt · 시각 요소 검토 · 2026-10-24</title><style>
:root{font-family:system-ui,-apple-system,sans-serif;background:#f3f8fc;color:#17252b;line-height:1.5}*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1260px;margin:auto;padding:24px}h1{font-size:clamp(26px,4vw,40px);line-height:1.2;margin:12px 0}h2{font-size:24px;margin:0 0 12px}h3{font-size:17px;margin:0 0 6px}p{margin:6px 0}a{color:#234e90;overflow-wrap:anywhere}button,textarea,select{font:inherit}button{cursor:pointer;min-height:44px;padding:8px 14px;border:1px solid #879cab;background:#fbfdff;color:#17252b;border-radius:3px}button:hover{background:#eaf2f8}.save{background:#243e70;color:white;border-color:#243e70;font-weight:650}.save:hover{background:#193052}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,.preview:focus-visible{outline:3px solid #3a61bd;outline-offset:3px}.meta,figcaption,.source{font-size:12px;color:#425b67}.source{overflow-wrap:anywhere;margin-top:8px}.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0}.status{font-size:13px;overflow-wrap:anywhere}.nav{display:flex;gap:4px 16px;flex-wrap:wrap;margin:12px 0}.nav a{display:inline-flex;align-items:center;min-height:44px}.section{border-top:2px solid #253f4b;padding-top:22px;margin-top:32px;scroll-margin-top:16px}.finding,.item{display:grid;grid-template-columns:minmax(0,58fr) minmax(0,42fr);gap:24px;border-top:1px solid #c5d3dd;padding:16px 0;min-width:0}.finding:first-of-type{border-top:0}.finding p,.item p{font-size:14px}.finding-grid,.inventory{display:block}.comment,.evidence-images{min-width:0}.evidence-images{display:grid;gap:18px;align-content:start}fieldset{min-width:0;border:0;padding:0;margin:10px 0}legend{font-size:13px;font-weight:650;padding:0}.choices{display:flex;gap:0 12px;flex-wrap:wrap}.choice{display:flex;align-items:center;gap:7px;min-height:44px;font-size:13px;cursor:pointer}.choice input{width:18px;height:18px;accent-color:#243e70;flex-shrink:0}.note{display:block;font-size:13px}.note textarea{display:block;width:100%;min-width:0;min-height:62px;resize:vertical;padding:8px;border:1px solid #97aebd;border-radius:3px;background:#fbfdff;color:#17252b;margin-top:4px}select{max-width:100%;min-height:44px;border:1px solid #97aebd;background:#fbfdff;color:#17252b;padding:6px;margin:8px 0}figure{margin:0;min-width:0}.preview{margin-left:auto;width:fit-content;max-width:100%;overflow:auto;border:1px solid #b7c8d3;background:white}.preview img{display:block;width:100%;height:auto}figcaption{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:4px}figcaption button{font-size:12px;padding:4px 10px}.coverage{font-size:13px;max-width:95ch}footer{border-top:1px solid #b7c8d3;margin-top:32px}dialog{width:min(96vw,1500px);max-width:none;height:94vh;border:1px solid #587586;background:#f3f8fc;padding:0}dialog::backdrop{background:#0b192bcc}.bar{position:sticky;top:0;background:#f3f8fc;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 14px}dialog img{display:block;width:100%;height:auto}dialog .zoom-scroll{overflow:auto}dialog img{min-width:720px}#zoom-label{overflow-wrap:anywhere;font-size:13px}@media(max-width:700px){header,main,footer{padding:18px}.finding,.item{grid-template-columns:minmax(0,1fr);gap:14px}.section{margin-top:26px}h2{font-size:22px}.actions{align-items:flex-start;flex-direction:column}}@media print{button,dialog{display:none}.preview{max-height:none;overflow:visible}.preview img{min-width:0}.finding-grid,.inventory{display:block}.item,.finding{break-inside:avoid}}
</style></head><body><header><div class="meta">FULLCOURT · 2026.10.24 · v1.2.2 / 794219c5</div><h1>차트·표·그래픽 검토</h1><p>8개 논의점 · 95개 시각 요소 · 모든 의견 옆에 관련 캡처</p><p class="meta">모두 펼쳐 두었습니다. 선택하거나 메모한 뒤 보고서 전체를 HTML 하나로 저장하세요. 선택은 서비스 변경 승인이 아닙니다.</p><div class="actions">${save}<span class="status" data-status role="status" aria-live="polite">미응답으로 시작합니다. 입력은 가능한 경우 이 브라우저에 임시 보관됩니다.</span></div><nav class="nav" aria-label="목차"><a href="#discussion">핵심 논의</a><a href="#group-shooting">전체 목록 · Shooting부터</a><a href="#group-methods">Methods</a><a href="#coverage">확인 범위</a></nav></header><main><section id="discussion"><h2>핵심 논의</h2><div class="finding-grid">${findings.map((f,i)=>{const key='finding-'+(i+1);return `<article class="finding" data-finding="${key}">${screenshots('findings',key)}<div class="comment"><h3>${String(i+1).padStart(2,'0')} · ${esc(f[0])}</h3><p>${esc(f[1])}</p><fieldset class="finding-response"><legend>${esc(f[0])} — 방향 선택</legend><div class="choices">${[...f.slice(2),'보류'].map((choice,j)=>`<label class="choice"><input type="radio" name="${key}" value="${j}" data-response="${key}">${esc(choice)}</label>`).join('')}</div></fieldset>${note(key,f[0])}</div></article>`}).join('')}</div></section>`;
for(const [id,title] of groups){const items=inventory.filter(x=>x.group===id);html+=`<section class="section group" id="group-${id}"><h2>${esc(title)} <span class="meta">${items.length}개</span></h2><div class="inventory">${items.map(x=>{const key='item-'+x.id;return `<article class="item" data-item="${esc(x.id)}">${screenshots('items',x.id)}<div class="comment"><h3>${String(inventory.indexOf(x)+1).padStart(2,'0')} · ${esc(x.name)}</h3><p>${esc(Array.isArray(x.purpose)?x.purpose.join(' · '):x.purpose)}</p><p><strong>검토</strong> · ${esc(Array.isArray(x.review)?x.review.join(' · '):x.review)}</p><div class="source">${esc(x.type)} · <a href="https://fullcourt.fyi${esc(x.route)}" target="_blank" rel="noopener">${esc(x.route)}</a> · <a href="../../../${esc(x.source)}">${esc(x.source)}:${esc(x.line)}</a></div><label class="meta" for="${key}-decision">${esc(x.name)} — 의견</label><br><select id="${key}-decision" data-response="${key}-decision" aria-label="${esc(x.name)} 의견"><option value="">미응답</option><option value="keep">현재 유지</option><option value="review">더 검토</option><option value="simplify">간소화</option><option value="custom">다른 의견 (메모)</option></select>${note(key,x.name)}</div></article>`}).join('')}</div>`;
html+='</section>'}
html+=`<section class="section coverage" id="coverage"><h2>확인 범위</h2><p>95개 요소와 8개 논의점마다 관련 영역 캡처를 바로 붙였습니다. 작은 화면에서는 캡처 다음에 해당 의견이 이어집니다. 필요하면 확대하세요.</p><p>캡처는 수집 시점의 시각 기록이고 검토 의견은 논의 제안입니다. 캡처만으로 키보드·기능 결함을 입증하지 않습니다. 기능·접근성 전수 감사, 공급자 수치 검증, 실제 iPhone/Safari는 미검증입니다. 서비스 코드·모델·배포는 변경하지 않았습니다.</p><p><a href="inventory.json">전체 소스 목록</a> · <a href="evidence.json">캡처 기록</a></p></section></main><footer><div class="actions">${save}<span class="status" data-status role="status" aria-live="polite">선택하지 않은 항목도 빈 상태 그대로 저장합니다.</span></div><p class="meta">이미지·선택·메모를 포함한 HTML입니다. 다운로드 후 파일 위치와 내용을 확인하세요.</p></footer><dialog id="zoom" aria-label="캡처 확대"><div class="bar"><span id="zoom-label"></span><button id="close" type="button">닫기</button></div><div class="zoom-scroll"><img id="zoom-image" alt=""></div></dialog><script id="saved-responses" type="application/json">{}</script><script>
const controls = [...document.querySelectorAll('[data-response]')];
const storageKey = 'fullcourt-graphics-review:' + location.href;
let dirty = false;
function status(message) { document.querySelectorAll('[data-status]').forEach(el => el.textContent = message); }
function collect() { const values = {}; controls.forEach(el => { if (el.type !== 'radio' || el.checked) values[el.dataset.response] = el.value; }); return values; }
function restore(values) { controls.forEach(el => { const value = values[el.dataset.response]; if (el.type === 'radio') el.checked = value === el.value; else if (typeof value === 'string') el.value = value; }); }
let saved = {};
try { saved = JSON.parse(document.querySelector('#saved-responses').textContent); if (saved.values) restore(saved.values); } catch (_) { status('저장 응답을 읽지 못했습니다. 현재 입력을 확인하세요.'); }
try { const draft = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (draft && draft.values && draft.baseSavedAt === (saved.savedAt || 0) && draft.updatedAt >= (saved.savedAt || 0)) { restore(draft.values); dirty = true; status('이 브라우저의 임시 입력을 복원했습니다. 전체 저장으로 파일을 내려받으세요.'); } else if (saved.values) status('HTML에 저장된 응답을 복원했습니다. 수정 후 다시 전체 저장할 수 있습니다.'); } catch (_) { status(saved.values ? 'HTML 응답을 복원했습니다. 임시 보관은 사용할 수 없습니다.' : '임시 보관을 사용할 수 없습니다. 전체 저장으로 파일을 내려받으세요.'); }
controls.forEach(el => el.addEventListener('input', () => { dirty = true; try { localStorage.setItem(storageKey, JSON.stringify({values:collect(), baseSavedAt:saved.savedAt || 0, updatedAt:Date.now()})); status('수정됨 · 브라우저에 임시 보관했습니다. 파일 저장은 전체 저장을 누르세요.'); } catch (_) { status('수정됨 · 임시 보관 불가. 입력은 화면에 남아 있습니다. 전체 저장을 누르세요.'); } }));
function downloadReport() {
 let url;
 try {
  const clone = document.documentElement.cloneNode(true);
  const payload = JSON.stringify({values:collect(), savedAt:Date.now()}).replace(/</g, String.fromCharCode(92) + 'u003c');
  clone.querySelector('#saved-responses').textContent = payload;
  clone.querySelector('#zoom').removeAttribute('open');
  clone.querySelector('#zoom-image').removeAttribute('src');
  clone.querySelectorAll('[data-status]').forEach(el => el.textContent = 'HTML에 저장된 응답입니다. 수정 후 다시 전체 저장할 수 있습니다.');
  url = URL.createObjectURL(new Blob(['<!doctype html>' + String.fromCharCode(10) + clone.outerHTML], {type:'text/html;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'FullCourt-시각요소-검토-2026-10-24.html'; document.body.append(link); link.click(); link.remove();
  dirty = false;
  status('HTML 다운로드를 요청했습니다. 다운로드 목록에서 파일과 내용을 확인하세요.');
 } catch (_) { status('다운로드를 시작하지 못했습니다. 입력은 유지됩니다. 다시 전체 저장을 누르세요.'); }
 if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
}
document.querySelectorAll('[data-save]').forEach(button => button.addEventListener('click', downloadReport));
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
const zoom = document.querySelector('#zoom');
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => { const image = button.closest('figure').querySelector('img'); document.querySelector('#zoom-image').src = image.src; document.querySelector('#zoom-image').alt = image.alt; document.querySelector('#zoom-label').textContent = image.alt; zoom.showModal(); }));
document.querySelector('#close').addEventListener('click', () => zoom.close());
zoom.addEventListener('click', event => { if (event.target === zoom) zoom.close(); });
</script></body></html>`;
fs.writeFileSync(path.join(root,'index.html'),html);
console.log(`${inventory.length} items; ${captureCount} adjacent captures; ${evidence.length} archived routes; ${(Buffer.byteLength(html)/1024/1024).toFixed(1)} MB HTML`);
