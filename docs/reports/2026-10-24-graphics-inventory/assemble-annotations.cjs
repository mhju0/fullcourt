const fs=require('node:fs'),path=require('node:path');const root=__dirname,p=path.join(root,'annotations.json');const a=JSON.parse(fs.readFileSync(p));a.extras=a.extras||{};for(const id of Object.keys(a.items).filter(x=>x.startsWith('aux-'))){a.extras[id]=a.items[id];delete a.items[id]}
const rename={'aux-shooting-phone-table':'Shooting · 폰에서 처음 보이는 열 · 390px','aux-shooting-phone-coverage':'Shooting · 갱신 안내와 표 진입 · 390px','aux-shooting-current-zero':'Shooting · 현재 시즌의 0회와 미측정 값','aux-shooting-expanded':'Shooting · 선수 상세 행','aux-maskable-512':'Maskable icon · 512px','aux-shooting-efg-formula':'Shooting Methods · eFG% 계산식','aux-shooting-uncertainty-formula':'Shooting Methods · 불확실성 계산식'};for(const[id,label]of Object.entries(rename))a.extras[id][0].label=label;
const get=id=>a.items[id]||a.extras[id];
// Keep the original item first so source mappings remain stable across regeneration.
const append=(id,extraIds)=>{const base=a.items[id].filter(x=>!Object.values(a.extras).flat().some(y=>y.file===x.file));a.items[id]=[...base,...extraIds.flatMap(get)]};
append('player_shooting_main_table',['aux-shooting-phone-table']);append('method_player_shooting_formulas',['aux-shooting-efg-formula','aux-shooting-uncertainty-formula']);append('maskable-icons',['aux-maskable-512']);
const mappings={
 'finding-1':['aux-shooting-phone-table'],
 'finding-2':['aux-shooting-phone-coverage'],
 'finding-3':['player_shooting_main_table','season-team-records','method_availability_schedule_table'],
 'finding-4':['schedule-edge-ranked-diverging-bars','player_shooting_main_table','shot_quality_difference_map','officiating-error-split'],
 'finding-5':['analysis_gap_size_chart','home_court_season_chart','shot_quality_expected_map'],
 'finding-6':['aux-shooting-current-zero','aux-shooting-uncertainty-formula'],
 'finding-7':['availability_effect_bars','schedule-edge-ranked-diverging-bars','home_rest_gap_rate_bars','playoff_grind_gap_bars'],
 'finding-8':['aux-shooting-expanded','schedule-edge-expanded-breakdown-table','method_rest_split_table','referee-archive-style-table']
};a.findings=Object.fromEntries(Object.entries(mappings).map(([id,ids])=>[id,ids.map(x=>get(x)[0])]));
a.summary={items:Object.keys(a.items).length,findings:Object.keys(a.findings).length,uniqueImages:new Set([...Object.values(a.items),...Object.values(a.findings)].flat().map(x=>x.file)).size,inlinePlacements:[...Object.values(a.items),...Object.values(a.findings)].reduce((s,v)=>s+v.length,0)};
const inventoryFile=path.join(root,'inventory.json'),inventory=JSON.parse(fs.readFileSync(inventoryFile));for(const x of inventory){if(x.id.startsWith('shared-'))x.route=a.items[x.id][0].route;}
fs.writeFileSync(inventoryFile,JSON.stringify(inventory,null,2));fs.writeFileSync(p,JSON.stringify(a,null,2));if(inventory.some(x=>!a.items[x.id]?.length)||a.failures.length)throw Error('Incomplete annotations');console.log(a.summary);
