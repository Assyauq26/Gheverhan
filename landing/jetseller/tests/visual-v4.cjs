const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});
try { for(const width of [360,390,428,768,1024,1440,1920]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('.hero-artwork img').evaluate(img=>img.decode());
  const state=await page.evaluate(()=>{
    const rect=s=>document.querySelector(s).getBoundingClientRect();
    const style=(s,pseudo)=>getComputedStyle(document.querySelector(s),pseudo);
    return {src:document.querySelector('.hero-artwork img').currentSrc,
      gap:rect('#cara-kerja .eyebrow').top-rect('#fitur .cards-3').bottom,
      heroMask:style('.hero','::before').maskImage,ctaMask:style('.cta-banner','::before').maskImage,
      footer:style('.site-footer').textAlign,overflow:document.documentElement.scrollWidth>innerWidth,
      badgeBackground:style('.pill').backgroundColor,sellerColor:style('.pill span').color,
      sellerSize:parseFloat(style('.pill span').fontSize),brandAfter:style('.site-header .brand','::after').content,
      icons:[...document.querySelectorAll('.step-icon img,.step-icon svg')].map(el=>el.getBoundingClientRect().width),
      numbers:[...document.querySelectorAll('.step-num')].map(el=>el.getBoundingClientRect().width),
      missing:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)};
  });
  assert(state.src.endsWith(width<=768?'hero-mobile.png':'hero-desktop.png'));
  assert.equal(state.gap,width<=600?28:38);
  assert.match(state.heroMask,/radial-gradient/);assert.match(state.ctaMask,/linear-gradient/);
  if(width<=600)assert.equal(state.footer,'center');
  assert.equal(state.overflow,false);assert.deepEqual(state.missing,[]);
  assert.equal(state.badgeBackground,'rgba(0, 0, 0, 0)');assert.equal(state.sellerColor,'rgb(0, 0, 0)');
  assert.equal(state.sellerSize,width<=600?24:30);assert(['none','normal','""'].includes(state.brandAfter));
  assert.deepEqual(state.icons,Array(3).fill(width<=600?40:52));
  assert.deepEqual(state.numbers,Array(3).fill(width<=600?23:26));
  assert.match(await page.locator('.hero .lead').textContent(),/dalam waktu ±10 menit/);
  assert.equal(await page.locator('#cara-kerja .eyebrow').textContent(),'Cara Buat Toko di JetSeller');
  assert.equal(await page.locator('#cara-kerja-title').textContent(),'Buat Toko Online, Gampang Banget!');
  assert.equal(await page.locator('.step-icon img').count(),2);
  assert.equal(await page.locator('.pill img').getAttribute('alt'),'J&T Express');
  assert.equal(await page.locator('.pill span').textContent(),'X Seller');
  console.log(JSON.stringify({width,...state}));await page.close();
}} finally {await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
