import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const out='../docs/product-card-price-fit/evidence'; await mkdir(out,{recursive:true});
const css=await readFile('src/components/storefront/purchase-controls.css','utf8');
const baseline=execFileSync('C:/Program Files/Git/cmd/git.exe',['show','b44c57b:frontend/src/components/storefront/purchase-controls.css'],{encoding:'utf8'});
const fitter=(await readFile('src/components/storefront/fit-card-prices.mjs','utf8')).replace('export function','function');
const browser=await chromium.launch(); const page=await browser.newPage();const results=[];
try {
 await page.goto('https://gheverhan.store/shop',{waitUntil:'networkidle'});
 await page.evaluate(()=>{for(const s of document.styleSheets){try{const clear=sheet=>{for(let i=sheet.cssRules.length-1;i>=0;i--){const r=sheet.cssRules[i];if(/\.product-card-(purchase|prices|price|original)/.test(r.selectorText||''))sheet.deleteRule(i);else if(r.cssRules)clear(r)}};clear(s)}catch{}}});
 await page.locator('.product-listing-grid').first().evaluate(grid=>{const template=grid.firstElementChild.cloneNode(true);grid.replaceChildren();for(const [sale,base] of [[5000,20000],[17000,20000],[249000,299000],[1499000,1999000],[8999000,9999000]]){const c=template.cloneNode(true);c.dataset.priceLayout='inline';c.classList.remove('h-full');const row=c.querySelector('.product-card-purchase');row.classList.remove('mt-auto','pt-1');row.classList.add('mt-2');row.parentElement.classList.remove('flex-1');c.querySelector('.product-card-price').textContent='Rp '+sale.toLocaleString('id-ID');c.querySelector('.product-card-original').textContent='Rp '+base.toLocaleString('id-ID');c.style.setProperty('--product-price-units',(c.querySelector('.product-card-price').textContent.length+c.querySelector('.product-card-original').textContent.length*.8)*.68);grid.append(c)}});
 await page.addScriptTag({content:fitter+';window.fitCardPrices=fitCardPrices;'});
 const patch=await page.addStyleTag({content:baseline});
 for(const width of [320,360,375,390,430,768,1024,1440]){
  await page.setViewportSize({width,height:900});await patch.evaluate((s,css)=>s.textContent=css,baseline);
  const before=await page.locator('.product-listing-grid .product-card-price').evaluateAll(ns=>ns.map(n=>parseFloat(getComputedStyle(n).fontSize)));
  if([320,390].includes(width))await page.screenshot({path:`${out}/before-${width}.png`,fullPage:true});
  await patch.evaluate((s,css)=>s.textContent=css,css);
  await page.locator('.product-card-prices').evaluateAll(rows=>rows.forEach(r=>window.fitCardPrices(r)));
  const after=await page.locator('.product-listing-grid .product-card').evaluateAll(cards=>cards.map(c=>{
   const row=c.querySelector('.product-card-prices'),p=row.querySelector('.product-card-price'),o=row.querySelector('.product-card-original'),b=c.querySelector('.product-card-purchase>button');
   const a=p.getBoundingClientRect(),r=o.getBoundingClientRect(),t=b.getBoundingClientRect(),available=row.getBoundingClientRect().width,font=parseFloat(getComputedStyle(p).fontSize),scale=parseFloat(row.style.getPropertyValue('--product-price-scale'));
   const capped=scale>=.9999;row.style.setProperty('--product-price-scale',String(scale+.1/16));const larger=p.getBoundingClientRect().width+o.getBoundingClientRect().width+2;row.style.setProperty('--product-price-scale',String(scale));
   return{price:p.textContent,original:o.textContent,cardWidth:c.getBoundingClientRect().width,available,mainWidth:a.width,originalWidth:r.width,font,originalFont:parseFloat(getComputedStyle(o).fontSize),gap:r.left-a.right,cartGap:t.left-r.right,touch:t.width,sameRow:Math.abs(a.y+a.height/2-r.y-r.height/2)<.5,aligned:Math.abs(a.y+a.height/2-t.y-t.height/2)<1.5,largest:capped||larger>available,clipped:p.scrollWidth>p.clientWidth+1||o.scrollWidth>o.clientWidth+1};
  }));
  for(let i=0;i<after.length;i++){const r=after[i];assert.ok(r.font>=before[i]-.05&&r.largest&&r.sameRow&&r.aligned&&!r.clipped&&r.gap>=1.9&&r.gap<=4&&r.cartGap>=1.9&&r.cartGap<=4&&r.touch>=43.9&&r.mainWidth+r.originalWidth+r.gap<=r.available+.1,JSON.stringify({width,r,before:before[i]}));results.push({width,beforeFont:before[i],...r});}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if([320,390,1440].includes(width))await page.screenshot({path:`${out}/after-${width}.png`,fullPage:true});
 }
}finally{await writeFile(`${out}/measurements.json`,JSON.stringify(results,null,2));await browser.close();}
console.log('PASS '+results.length+' measured price cases');
