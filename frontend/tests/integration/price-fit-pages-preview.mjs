import { execFileSync } from 'node:child_process';
/** Read-only public HTML/CSS preview. No login, mutations, or production writes.
 * Actual candidate route coverage is in flash-campaign-browser.ts in isolated CI.
 */
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = '../docs/product-card-price-fit/pages';
await mkdir(out, { recursive: true });
const css = await readFile('src/components/storefront/purchase-controls.css', 'utf8');
const fitting = (await readFile('src/components/storefront/fit-card-prices.mjs','utf8')).replace('export function','function');
const browser = await chromium.launch();
const page = await browser.newPage();
const results = [];
const beforeCss=execFileSync('C:/Program Files/Git/cmd/git.exe',['show','b44c57b:frontend/src/components/storefront/purchase-controls.css'],{encoding:'utf8'});
async function candidateMarkup() { await page.evaluate(()=>{ function clear(sheet){for(let i=sheet.cssRules.length-1;i>=0;i--){const rule=sheet.cssRules[i];if(/\.product-card-(purchase|prices|price|original)/.test(rule.selectorText||''))sheet.deleteRule(i);else if(rule.cssRules)clear(rule);}}for(const sheet of document.styleSheets){try{clear(sheet)}catch{}}}); await page.locator('.product-card').evaluateAll(cards => cards.forEach(card => {
 const p=card.querySelector('.product-card-price'),o=card.querySelector('.product-card-original'),purchase=card.querySelector('.product-card-purchase');
 card.dataset.priceLayout=o?'inline':'single';card.style.setProperty('--product-price-units',(p.textContent.length+(o?o.textContent.length*.8:0))*.68);
 card.classList.remove('h-full');purchase.parentElement.classList.remove('flex-1');purchase.classList.remove('mt-auto','pt-1');purchase.classList.add('mt-2');
})); }

try {
  for (const route of ['/', '/shop', '/shop?flash=1', '/search?q=tee', '/category/pria', '/brand/gheverhan']) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('https://gheverhan.store' + route, { waitUntil: 'networkidle' });
    const grids = page.locator('.grid:has(> .product-card)');
    if (!await grids.count()) { results.push({ route, skipped: 'No public products on this route; isolated CI covers populated fixture' }); continue; }
    await grids.evaluateAll(els => els.forEach(el => el.classList.add('product-listing-grid')));
    await candidateMarkup(); await page.addStyleTag({content:beforeCss});
    const baseline = await grids.first().evaluate(el => getComputedStyle(el).gridTemplateColumns);
    if (route === '/' || route === '/shop') await page.screenshot({ path: `${out}/before-${route === '/' ? 'home' : 'shop'}-390.png`, fullPage: true });
    const carousel = page.locator('[aria-label="Produk pilihan"]');
    const carouselBefore = await carousel.count() ? await carousel.evaluate(el => ({ display: getComputedStyle(el).display, widths: [...el.querySelectorAll('.product-card')].map(c => c.getBoundingClientRect().width) })) : null;
    await candidateMarkup();
    const patch = await page.addStyleTag({ content: css });
    await page.addScriptTag({content:fitting+';window.fitCardPrices=fitCardPrices;'});
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('.product-card-prices').evaluateAll(rows=>rows.forEach(row=>window.fitCardPrices(row)));
      const metrics = await grids.evaluateAll(els => els.map(el => ({
        columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        cards: [...el.children].map(card => {
          const price = card.querySelector('.product-card-price');
          const original = card.querySelector('.product-card-original');
          const button = card.querySelector('.product-card-purchase > button');
          const a = price.getBoundingClientRect(), b = button.getBoundingClientRect(), o = original?.getBoundingClientRect();
          const image = card.querySelector('.aspect-square').getBoundingClientRect();
          const wishlist = card.querySelector('button[aria-label*="wishlist" i]');
          return { width: card.getBoundingClientRect().width, price: price.textContent, font: getComputedStyle(price).fontSize, originalFont: original ? getComputedStyle(original).fontSize : null,
            clipped: price.scrollWidth > price.clientWidth + 1 || (original && original.scrollWidth > original.clientWidth + 1),
            overlap: Boolean(o && o.left < b.right - 1 && o.right > b.left + 1 && o.top < b.bottom - 1 && o.bottom > b.top + 1),
            aligned: Math.abs(a.y + a.height / 2 - b.y - b.height / 2) <= 1.5,
            square: Math.abs(image.width - image.height) <= 1,
            touch: b.width >= 43.9 && b.height >= 43.9,
            wishlist: !wishlist || getComputedStyle(wishlist).pointerEvents !== 'none' };
        }),
      })));
      if (width >= 768) {
        await patch.evaluate(el => { el.sheet.disabled = true; });
        const original = await grids.evaluateAll(els => els.map(el => ({ columns:getComputedStyle(el).gridTemplateColumns.split(' ').length, widths:[...el.children].map(card=>card.getBoundingClientRect().width) })));
        await patch.evaluate(el => { el.sheet.disabled = false; });
        assert.deepEqual(metrics.map(g=>({columns:g.columns,widths:g.cards.map(c=>c.width)})),original,'tablet/desktop must match baseline');
      }
      const featured = await page.locator('[data-featured]').evaluateAll(cards=>cards.map(card=>{const title=(card.querySelector('[data-testid="flash-timer"]')||card.querySelector('h3')).getBoundingClientRect(),purchase=card.querySelector('.product-card-purchase').getBoundingClientRect(),price=card.querySelector('.product-card-price').getBoundingClientRect(),original=card.querySelector('.product-card-original')?.getBoundingClientRect();return {gap:purchase.top-title.bottom,beside:!original||original.left>=price.right+1,sameRow:!original||Math.abs(original.y+original.height/2-price.y-price.height/2)<1.5}}));
      assert.ok(featured.every(f=>f.gap>=7.9&&f.gap<=12.1&&f.beside&&f.sameRow),JSON.stringify({route,width,featured}));
      results.push({route,width,featured});
      for (const grid of metrics) {
        if (width < 768) {
          assert.equal(grid.columns, 2, `${route} ${width}`);
          assert.ok(grid.cards.every(c => Math.abs(c.width - grid.cards[0].width) < 1));
        }
        assert.ok(grid.cards.every(c => !c.clipped && !c.overlap && c.aligned && c.square && c.touch && c.wishlist &&
          (parseFloat(c.font) > 0 && (c.originalFont === null || parseFloat(c.originalFont) > 0))
        ), JSON.stringify({ route, width, grid }));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      results.push({ route, width, baselineAt390: baseline, metrics });
      if ([320, 390, 1440].includes(width) && (route === '/' || route === '/shop')) await page.screenshot({ path: `${out}/after-${route === '/' ? 'home' : 'shop'}-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 900 });
    if (carouselBefore) assert.deepEqual(await carousel.evaluate(el => ({ display: getComputedStyle(el).display, widths: [...el.querySelectorAll('.product-card')].map(c => c.getBoundingClientRect().width) })), carouselBefore);
  }
  // Exercise missing public campaign/long-price cases without writing fixtures
  // to Production. Keep the shipped card markup and change only fixture text.
  await page.goto('https://gheverhan.store/shop', { waitUntil: 'networkidle' });
  await page.locator('.grid:has(> .product-card)').first().evaluate(grid => {
    grid.classList.add('product-listing-grid');
    const template = grid.firstElementChild.cloneNode(true);
    grid.replaceChildren();
    for (const [base, sale] of [[20000,17000],[299000,249000],[499000,299000],[1999000,1499000],[9999000,8999000],[189000,null]]) {
      const card = template.cloneNode(true);
      card.dataset.priceLayout = sale == null ? 'single' : base >= 1000000 ? 'stacked' : 'inline';
      if (card.dataset.priceLayout === 'inline' || ('Rp ' + base.toLocaleString('id-ID')).length > 11) card.setAttribute('data-wide-price','true');
      else card.removeAttribute('data-wide-price');
      card.querySelector('.product-card-price').textContent = 'Rp ' + (sale ?? base).toLocaleString('id-ID');
      const original = card.querySelector('.product-card-original');
      if (sale == null) original.remove();
      else original.textContent = 'Rp ' + base.toLocaleString('id-ID');
      const timer = document.createElement('div'); timer.textContent = '23:59:59'; timer.setAttribute('data-testid','synthetic-countdown');
      card.querySelector('.product-card-purchase').before(timer);
      grid.append(card);
    }
  });
  await page.setViewportSize({ width:390, height:900 });
  await page.screenshot({ path:`${out}/before-synthetic-390.png`, fullPage:true });
  await candidateMarkup();
  await page.addStyleTag({ content:css });
  await page.addScriptTag({content:fitting+';window.fitCardPrices=fitCardPrices;'});
  const root = page.locator('.storefront-root').first();
  const theme = await root.evaluate(el => ({style:el.getAttribute('style'),active:el.getAttribute('data-theme-active')}));
  for (const name of ['published','default']) {
    if (name === 'default') await root.evaluate(el => {el.removeAttribute('style');el.removeAttribute('data-theme-active');});
    for (const width of [320,360,375,390,430,768,1024,1440]) {
      await page.setViewportSize({width,height:900});
      await page.locator('.product-card-prices').evaluateAll(rows=>rows.forEach(row=>window.fitCardPrices(row)));
      const metrics = await page.locator('.product-listing-grid').first().evaluate(grid => ({columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,cards:[...grid.children].map(card=>{
        const p=card.querySelector('.product-card-price'),o=card.querySelector('.product-card-original'),b=card.querySelector('.product-card-purchase>button');
        const a=p.getBoundingClientRect(),r=o?.getBoundingClientRect(),t=b.getBoundingClientRect();
        return {font:getComputedStyle(p).fontSize,originalFont:o ? getComputedStyle(o).fontSize : null,clipped:p.scrollWidth>p.clientWidth+1 || (o && o.scrollWidth>o.clientWidth+1),overlap:Boolean(r && r.left<t.right-1 && r.right>t.left+1 && r.top<t.bottom-1 && r.bottom>t.top+1),aligned:Math.abs(a.y+a.height/2-t.y-t.height/2)<1.5};
      })}));
      if (width<768) assert.equal(metrics.columns,2);
      assert.ok(metrics.cards.every(c=>!c.clipped&&!c.overlap&&c.aligned&&(parseFloat(c.font)>0&&(c.originalFont===null||parseFloat(c.originalFont)>0))),JSON.stringify({name,width,metrics}));
      results.push({fixture:'synthetic prices/countdown',theme:name,width,metrics});
      if ([320,390].includes(width)) await page.screenshot({path:`${out}/after-synthetic-${name}-${width}.png`,fullPage:true});
    }
  }
  await root.evaluate((el,t)=>{if(t.style)el.setAttribute('style',t.style);if(t.active)el.setAttribute('data-theme-active',t.active);},theme);
  await page.setViewportSize({width:320,height:900});
  await page.locator('.product-listing-grid').first().evaluate(grid=>[...grid.children].slice(1).forEach(card=>card.remove()));
  assert.equal(await page.locator('.product-listing-grid').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
} finally {
  await writeFile(`${out}/public-preview-results.json`, JSON.stringify({ scope: 'Public rendered HTML with candidate CSS/marker injected locally; no deployment', results }, null, 2));
  await browser.close();
}
console.log(`PASS: ${results.filter(r => r.width).length} public layout checks`);
