const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});const results=[];
for(const width of [1440,1280,1024,768,428,390,360]){const page=await browser.newPage({viewport:{width,height:900}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/');await page.waitForTimeout(1000);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.brand').first().textContent(),'JetSeller');assert.equal(await page.locator('.brand svg').count(),0);
await page.locator('.hero-artwork img').evaluate(i=>i.decode());
const artwork=await page.locator('.hero-artwork img').evaluate(i=>{const r=i.getBoundingClientRect();return {left:r.left,right:r.right,ratio:r.width/r.height,natural:i.naturalWidth/i.naturalHeight,src:i.currentSrc};});
assert(artwork.src.endsWith('hero-desktop.png'));assert(Math.abs(artwork.ratio-artwork.natural)<0.001);
assert(artwork.left>=0&&artwork.right<=width);
if(width<=768){assert(Math.abs(artwork.left-4)<1);assert(Math.abs(artwork.right-(width-4))<1);}
assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'/assets/img/favicon.svg?v=wordmark-1');
// Android-style tap highlight must not flash blue on anchors, buttons, or FAQ summaries.
for (const selector of ['.brand','.hero-cta .btn','.nav-toggle','.faq summary','.cta-banner a','.footer-nav a']) {
  const styles=await page.locator(selector).first().evaluate(el=>{
    const c=getComputedStyle(el);
    return {tap:c.getPropertyValue('-webkit-tap-highlight-color'),select:c.userSelect};
  });
  assert.match(styles.tap,/^(?:rgba?\(0,\s*0,\s*0,\s*0\)|transparent)$/,selector+' has visible touch highlight: '+styles.tap);
  if(selector==='.faq summary') assert.equal(styles.select,'none','FAQ headings should not become blue text selection');
}
assert.equal(await page.locator('.btn-play').getAttribute('href'),'https://gheverhan.store');assert.equal(await page.locator('.btn-play').getAttribute('target'),'_blank');
if(width<=900){await page.locator('.nav-toggle').click();assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'false');await page.locator('.nav-toggle').click();await page.locator('#nav a[href="#faq"]').click();assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'false');}
await page.locator('.faq').nth(1).locator('summary').click();assert(await page.locator('.faq').nth(1).getAttribute('open')!==null);await page.locator('.cta-banner a').scrollIntoViewIfNeeded();await page.locator('.cta-banner a').click();assert(page.url().endsWith('/daftar/'));await page.goto('http://127.0.0.1:8765/');await page.waitForTimeout(1000);await page.screenshot({path:`landing/jetseller/tests/evidence/v2-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);results.push({width,result:'PASS'});await page.close();}
const page=await browser.newPage({reducedMotion:'reduce'});for(const route of ['/','/daftar/','/masuk/','/404.html']){assert.equal((await page.goto('http://127.0.0.1:8765'+route)).status(),200);assert.equal(await page.locator('.brand svg').count(),0);for(const rel of ['icon','apple-touch-icon']){const href=await page.locator(`link[rel="${rel}"]`).getAttribute('href');const res=await page.request.get('http://127.0.0.1:8765'+href);assert.equal(res.status(),200);assert.match(res.headers()['content-type'],rel==='icon'?/image\/svg\+xml/:/image\/png/);}}assert.equal((await page.goto('http://127.0.0.1:8765/not-found')).status(),404);await page.goto('http://127.0.0.1:8765/');assert.equal(await page.locator('.hero-visual').evaluate(el=>getComputedStyle(el).animationName),'none');
await browser.close();console.log(JSON.stringify(results,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
