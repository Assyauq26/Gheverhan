import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { expireStaleOrders } from '../../src/modules/orders/orders.service';
import { chooseTestLocation } from '../fixtures/jnt-checkout';

export async function verifyPaymentSynchronization(browser: Browser, db: PrismaClient, base: string,
 bankId: string, customerRoleId: string, finance: BrowserContext, dashboard: Page,
 cookie: (user: {id:string;email:string})=>Promise<import('@playwright/test').Cookie|{name:string;value:string;domain:string;path:string;httpOnly:boolean;secure:boolean;sameSite:'Lax'}>,
 errors: string[], png: Buffer) {
 for (const width of [390,1360]) {
  const prefix=`r20pay-${randomUUID().slice(0,8)}`;
  const user=await db.user.create({data:{name:'Synthetic Payment Buyer',email:prefix+'@example.test',passwordHash:'unused',roles:{create:{roleId:customerRoleId}}}});
  const product=await db.product.create({data:{name:prefix,slug:prefix,status:'PUBLISHED',basePrice:100000,weightGrams:250,variants:{create:{sku:prefix,inventory:{create:{onHand:3}}}}},include:{variants:true}});
  const variantId=product.variants[0].id;
  await db.cart.create({data:{userId:user.id,items:{create:{variantId,quantity:1}}}});
  const ctx=await browser.newContext({viewport:{width,height:900}}); await ctx.addCookies([await cookie(user)]);
  ctx.on('page',page=>page.on('pageerror',err=>errors.push(`${page.url()}: ${err.stack ?? err.message}`)));
  const buyer=await ctx.newPage();const admin=await finance.newPage();admin.on('pageerror',err=>errors.push(`${admin.url()}: ${err.stack ?? err.message}`));
  try {
   await buyer.goto(`${base}/checkout`);
   await chooseTestLocation(buyer);
   await buyer.getByTestId(`bank-option-${bankId}`).locator('input').check();
   await expect(buyer.getByTestId('place-order-btn')).toBeEnabled();
   await buyer.getByTestId('place-order-btn').click(); await expect(buyer).toHaveURL(/\/checkout\/payment\//);
   const order=await db.order.findFirstOrThrow({where:{userId:user.id},include:{payment:true}});
   assert.equal(await db.order.count({where:{userId:user.id}}),1);
   assert.equal(order.status,'PENDING_PAYMENT'); assert.equal(order.paymentStatus,'PENDING_PAYMENT');
   const payment=order.payment!;
   async function upload() {
    await expect(buyer.getByTestId('proof-form')).toBeVisible();
    await buyer.getByTestId('proof-sender-bank').fill('Fixture');
    await buyer.getByTestId('proof-sender-name').fill('Synthetic Buyer');
    await buyer.getByTestId('proof-date').fill(new Date().toISOString().slice(0,10));
    await buyer.getByTestId('proof-file').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
    await buyer.evaluate(()=>{(window as unknown as {r20ProofDocument:string}).r20ProofDocument='preserved';});
    await buyer.getByTestId('submit-proof-btn').click();
    await expect(buyer.getByTestId('payment-waiting')).toBeVisible();
    await expect(buyer.getByTestId('payment-waiting').getByRole('heading')).toHaveText('Menunggu Verifikasi Pembayaran');
    assert.equal(await buyer.evaluate(()=>(window as unknown as {r20ProofDocument:string}).r20ProofDocument),'preserved','proof status must refresh through RSC without a document reload');
    const fresh=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(fresh.status,'PENDING_PAYMENT');assert.equal(fresh.paymentStatus,'WAITING_VERIFICATION');
   }
   async function surfaces(label:string) {
    await buyer.goto(`${base}/orders`);await expect(buyer.getByTestId(`order-row-${order.orderNumber}`)).toContainText(label);
    await buyer.getByTestId(`order-row-${order.orderNumber}`).click();await expect(buyer.locator('main')).toContainText(label);
    await expect(buyer.locator('main')).toContainText('Desa/Kel. Gambir, Kec. Gambir');
    await admin.goto(`${base}/admin/orders?q=${order.orderNumber}`);await expect(admin.getByTestId(`admin-order-${order.orderNumber}`)).toContainText(label);
    await admin.getByRole('link',{name:order.orderNumber,exact:true}).click();await expect(admin.locator('main')).toContainText(label);
    await expect(admin.locator('address')).toContainText('Desa/Kel. Gambir, Kec. Gambir');
    await dashboard.goto(`${base}/admin`);await expect(dashboard.getByRole('listitem').filter({has:dashboard.getByRole('link',{name:order.orderNumber,exact:true})})).toContainText(label);
    await buyer.goto(`${base}/checkout/payment/${order.id}`);await expect(buyer.locator('main')).toContainText(label);
   }
   async function submitAdmin(label:string,endpoint:string) {
    const form=admin.getByRole('form',{name:label,exact:true});await form.getByRole('button',{name:label,exact:true}).click();
    const response=admin.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===endpoint);
    await form.getByRole('button',{name:`Konfirmasi ${label.toLowerCase()}`,exact:true}).click();assert.equal((await response).status(),200);
   }
   await upload(); await surfaces('Menunggu Verifikasi Pembayaran');
   await admin.getByText('Tolak bukti transfer',{exact:true}).click();await admin.getByLabel('Alasan penolakan *').fill('Synthetic mismatch');
   await submitAdmin('Tolak pembayaran',`/api/v1/admin/payments/${payment.id}/reject`);
   await surfaces('Bukti Pembayaran Ditolak');await expect(buyer.getByTestId('rejection-notice')).toBeVisible();
   await upload(); await expect.poll(()=>db.paymentConfirmation.count({where:{paymentId:payment.id}})).toBe(2);
   const latest=await db.paymentConfirmation.findFirstOrThrow({where:{paymentId:payment.id},orderBy:{createdAt:'desc'}});
   const deadline=new Date(latest.createdAt.getTime()+1);assert.ok(deadline<new Date());
   await db.order.update({where:{id:order.id},data:{expiresAt:deadline}});
   const before=await db.inventory.findUniqueOrThrow({where:{variantId}});
   await expireStaleOrders();
   const preserved=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(preserved.status,'PENDING_PAYMENT');assert.equal(preserved.paymentStatus,'WAITING_VERIFICATION');
   assert.equal((await db.inventory.findUniqueOrThrow({where:{variantId}})).reserved,before.reserved);
   await surfaces('Menunggu Verifikasi Pembayaran');await expect(admin.getByTestId(`payment-verify-${payment.id}`)).toBeVisible();
   await submitAdmin('Setujui pembayaran',`/api/v1/admin/payments/${payment.id}/approve`);
   await surfaces('Pembayaran Berhasil');
   const final=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(final.status,'PAID');assert.equal(final.paymentStatus,'PAID');
   const stock=await db.inventory.findUniqueOrThrow({where:{variantId}});assert.equal(stock.onHand,2);assert.equal(stock.reserved,0);
   assert.equal(await db.inventoryMovement.count({where:{variantId,type:'SALE'}}),1);
   assert.equal(await db.inventoryMovement.count({where:{variantId,type:'RELEASE'}}),0);
   assert.equal(await db.order.count({where:{userId:user.id}}),1);
   console.log(`PASS ${width}px R20 payment: checkout UI→proof→reject→proof→overdue review preserved→approval; buyer/admin/dashboard agree`);
  } finally { await buyer.close();await admin.close();await ctx.close(); }
 }
}
