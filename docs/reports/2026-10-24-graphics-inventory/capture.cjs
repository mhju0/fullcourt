const { chromium }=require('@playwright/test');const fs=require('node:fs');const path=require('node:path');
(async()=>{const root=__dirname;const records=JSON.parse(fs.readFileSync(path.join(root,'evidence.json')));const browser=await chromium.launch();const page=await browser.newPage();
for(const r of records){
 if(r.id==='shooting-history')r.route='/shooting?year=2025';if(r.id==='shooting-career')r.route='/shooting?year=career';r.url='https://fullcourt.fyi'+r.route;r.capturedAt=new Date().toISOString();
 try{await page.setViewportSize({width:1440,height:1000});await page.goto(r.url,{waitUntil:'networkidle',timeout:60000});await page.waitForTimeout(300);r.text=await page.locator('main').innerText();r.headings=await page.locator('main h1,main h2,main h3').allTextContents();r.views=[];
 for(const width of (r.id.startsWith('method-')||['about','engineering','explore','data-status'].includes(r.id)?[1440]:[1440,390])){await page.setViewportSize({width,height:r.id.startsWith('shooting')?1800:1000});await page.waitForTimeout(150);const file=`assets/${r.id}-${width}.jpg`;await page.screenshot({path:path.join(root,file),type:'jpeg',quality:65,fullPage:!r.id.startsWith('shooting')});r.views.push({width,file,fullPage:!r.id.startsWith('shooting'),captureHeight:r.id.startsWith('shooting')?1800:await page.evaluate(()=>document.documentElement.scrollHeight),pageOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});}
 if(['analysis','home-court','schedule','availability','referee-archive','officiating-history','season-history'].includes(r.id)||r.id.startsWith('method-')){
 await page.setViewportSize({width:1440,height:1000});await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));await page.waitForTimeout(500);const file=`assets/${r.id}-expanded.jpg`;await page.screenshot({path:path.join(root,file),type:'jpeg',quality:65,fullPage:true});r.expanded=file;
 }
 if(r.id==='shooting-history'||r.id==='shooting-career'){
 const expand=page.getByRole('button',{name:/^Expand .* shooting details/}).first();if(await expand.count()){await expand.click();await page.waitForTimeout(200);await page.setViewportSize({width:1440,height:1800});const file=`assets/${r.id}-expanded.jpg`;await page.screenshot({path:path.join(root,file),type:'jpeg',quality:70});r.expanded=file;}
 }
 console.log(r.id,'enriched');
 }catch(e){r.enrichError=e.message;console.log(r.id,e.message.slice(0,70));}
 fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(records,null,2));}
 await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
