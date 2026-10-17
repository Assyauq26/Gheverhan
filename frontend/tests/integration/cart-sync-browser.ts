import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Browser } from '@playwright/test';
import { expect } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';

export async function verifyCartSynchronization(browser: Browser, db: PrismaClient, base: string, prefix: string, errors: string[], artifacts: string) {
 for (const width of [390, 768, 1024, 1360]) {
  const scope = `r20cart-${prefix}-${width}`;
  const email = `${scope}@example.test`;
  const password = 'R20-disposable-fixture-password';
  const products: { id: string; variants: { id: string }[] }[] = [];
  for (let i=0;i<3;i++) products.push(await db.product.create({ data: { name: `${scope} item ${i}`, slug: `${scope}-${i}`, status: 'PUBLISHED', basePrice: 10000+i*1000, variants: { create: { sku: `${scope}-${i}`, inventory: { create: { onHand: 20 } } } } }, include: { variants: true } }));
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  ctx.on('page', page => page.on('pageerror', err => errors.push(err.message)));
  let userId: string | undefined;
  try {
   const page = await ctx.newPage();
   // Exercise real registration, logout/replay protection, then the login Server Action.
   await page.goto(`${base}/register`);
   await page.getByTestId('register-name').fill('Synthetic Cart Buyer');
   await page.getByTestId('register-email').fill(email);
   await page.getByTestId('register-password').fill(password);
   await page.getByTestId('register-terms').check();
   await page.getByTestId('auth-submit').click();
   await expect(page).toHaveURL(`${base}/account`);
   const user = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true } }); userId=user.id;
   const previousSession = (await ctx.cookies()).find(cookie => cookie.name==='gh_session');
   assert.ok(previousSession, 'registration must establish a session');
   assert.equal((await ctx.request.post(`${base}/api/v1/auth/logout`, { headers: { Origin: base } })).status(), 200);
   const replay = await browser.newContext();
   try {
    await replay.addCookies([previousSession]);
    const probe=await replay.newPage(); probe.on('pageerror',err=>errors.push(err.message));
    await probe.goto(`${base}/cart`);
    await expect(probe.getByText('Masuk untuk melihat keranjang',{exact:true})).toBeVisible();
   } finally { await replay.close(); }
   await page.goto(`${base}/login?redirectTo=${encodeURIComponent('/shop?q='+scope)}`);
   await page.getByTestId('login-identifier').fill(email);
   await page.getByTestId('login-password').fill(password);
   await page.getByTestId('auth-submit').click();
   await expect(page).toHaveURL(new RegExp(`/shop\\?q=${scope}`));
   await page.evaluate(() => { (window as unknown as { r20CartDocument: string }).r20CartDocument='preserved'; });
   const state = () => db.cartItem.findMany({ where: { cart: { userId } }, orderBy: { variantId: 'asc' } });
   async function badges(count: number) {
    await expect(page.getByTestId('header-cart-count')).toHaveText(String(count));
    await expect(page.getByTestId('bottom-cart-count')).toHaveText(String(count));
   }
   async function settled(lines: number, count: number) {
    await expect.poll(async () => (await state()).length).toBe(lines);
    await expect.poll(async () => (await state()).reduce((sum,x)=>sum+x.quantity,0)).toBe(count);
    await expect(page.locator('[data-testid^="cart-line-"]')).toHaveCount(lines);
    await expect(page.getByTestId('cart-lines')).toHaveAttribute('aria-busy','false');
    await badges(count);
   }
   for(let i=0;i<3;i++) {
    await page.getByTestId(`quick-add-${products[i].variants[0].id}`).click();
    await expect.poll(async () => (await state()).reduce((sum,x)=>sum+x.quantity,0)).toBe(i+1);
    await badges(i+1);
   }
   await page.getByTestId('header-cart').click(); await expect(page).toHaveURL(`${base}/cart`);
   await settled(3,3);
   const removed = (await state()).find(line=>line.variantId===products[0].variants[0].id)!;
   await page.getByTestId(`cart-remove-${removed.id}`).click(); await settled(2,2);
   async function checkoutBack() {
    await page.getByTestId('checkout-btn').click(); await expect(page).toHaveURL(`${base}/checkout`);
    await page.goBack(); await expect(page).toHaveURL(`${base}/cart`);
   }
   await checkoutBack(); await settled(2,2);
   for(let i=0;i<3;i++) {
    await page.goForward(); await expect(page).toHaveURL(`${base}/checkout`);
    await page.goBack(); await expect(page).toHaveURL(`${base}/cart`); await settled(2,2);
   }
   const remaining=(await state())[0];
   await page.getByTestId(`cart-inc-${remaining.id}`).click(); await settled(2,3);
   await checkoutBack(); await settled(2,3);
   const abortOne = async (action: () => Promise<unknown>) => {
    let aborted=0;
    const handler=async (route: import('@playwright/test').Route) => {
     if(!aborted && route.request().method()==='POST' && route.request().headers()['next-action']) { aborted++; await route.abort('failed'); }
     else await route.continue();
    };
    await page.route('**/cart',handler);
    try {
     await action(); await expect.poll(()=>aborted).toBe(1);
     await expect(page.getByTestId('cart-error')).toBeVisible(); await settled(2,3);
    } finally { await page.unroute('**/cart',handler); }
   };
   await abortOne(()=>page.getByTestId(`cart-inc-${remaining.id}`).click());
   await expect(page.getByTestId(`cart-quantity-${remaining.id}`)).toHaveText('2');
   const other=(await state()).find(line=>line.id!==remaining.id)!;
   await abortOne(()=>page.getByTestId(`cart-remove-${other.id}`).click());
   // Native Link navigation and concurrent actions on different product cards.
   if (width === 768) {
    const search=page.getByRole('search',{name:'Pencarian katalog'}).filter({visible:true});
    await search.getByRole('textbox',{name:'Cari katalog'}).fill(scope);
    await search.getByRole('textbox',{name:'Cari katalog'}).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${scope}`));
   } else {
    await page.getByRole('link',{name:'Shop',exact:true}).filter({visible:true}).first().click();
    await expect(page).toHaveURL(`${base}/shop`);
   }
   for(const product of products.slice(0,2)) {
    await expect(page.getByTestId(`quick-add-${product.variants[0].id}`)).toBeVisible();
    await expect(page.getByTestId(`quick-add-${product.variants[0].id}`)).toBeEnabled();
   }
   const transport: { event: string; status?: number }[] = [];
   page.on('request', request => { if(request.method()==='POST' && request.headers()['next-action']) transport.push({event:'request'}); });
   page.on('response', response => { if(response.request().method()==='POST' && response.request().headers()['next-action']) transport.push({event:'response',status:response.status()}); });
   page.on('requestfailed', request => { if(request.method()==='POST' && request.headers()['next-action']) transport.push({event:'requestfailed'}); });
   await page.evaluate(()=>{
    const target=window as unknown as {r20Clicks:string[]}; target.r20Clicks=[];
    document.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest('button[data-testid^="quick-add-"]');if(button)target.r20Clicks.push(button.getAttribute('data-testid')!);},true);
   });
   // Parallel mouse commands share one pointer and can lose a click. Dispatch
   // two distinct DOM click events in one turn, then require two acknowledged requests.
   await page.evaluate(ids=>{
    for(const id of ids) {
     const button=[...document.querySelectorAll<HTMLButtonElement>('button[data-testid]')].find(el=>el.dataset.testid===id);
     if(!button || button.disabled) throw new Error('Concurrent cart control must be enabled');
     button.click();
    }
   },products.slice(0,2).map(product=>`quick-add-${product.variants[0].id}`));
   const hits=await page.evaluate(()=>(window as unknown as {r20Clicks:string[]}).r20Clicks);
   assert.equal(hits.length,2); assert.equal(new Set(hits).size,2);
   try {
    await expect.poll(()=>transport.filter(event=>event.event==='response'&&event.status===200).length).toBe(2);
    await expect.poll(async ()=>(await state()).reduce((n,x)=>n+x.quantity,0)).toBe(5);
   } catch (error) {
    await writeFile(path.join(artifacts,`cart-concurrency-${width}.json`),JSON.stringify({width,expectedCount:5,actualCount:(await state()).reduce((n,x)=>n+x.quantity,0),clicks:await page.evaluate(()=>(window as unknown as {r20Clicks:string[]}).r20Clicks),transport},null,2));
    throw error;
   }
   await badges(5);
   await page.getByTestId('header-cart').click(); await expect(page).toHaveURL(`${base}/cart`); await settled(3,5);
   await checkoutBack(); await settled(3,5);
   assert.equal(await page.evaluate(()=>(window as unknown as {r20CartDocument?:string}).r20CartDocument),'preserved','cart flow must not reload the document');
   assert.equal(await db.order.count({where:{userId}}),0,'visiting checkout and history must not create orders');
   for(const product of products) {
    const stock=await db.inventory.findUniqueOrThrow({where:{variantId:product.variants[0].id}});
    assert.equal(stock.onHand,20); assert.equal(stock.reserved,0);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'cart must not overflow');
   console.log(`PASS ${width}px R20 cart: register/login/logout replay,3→2,checkout/history,badges,quantity,failed mutations,concurrent add; no reload`);
  } finally {
   await ctx.close();
   const user=await db.user.findUnique({where:{email},select:{id:true}});
   if(user){await db.auditLog.deleteMany({where:{userId:user.id}});await db.cart.deleteMany({where:{userId:user.id}});await db.user.delete({where:{id:user.id}});}
   const ids=products.map(p=>p.id);
   await db.inventory.deleteMany({where:{variant:{productId:{in:ids}}}});
   await db.productVariant.deleteMany({where:{productId:{in:ids}}});await db.product.deleteMany({where:{id:{in:ids}}});
  }
 }
}
