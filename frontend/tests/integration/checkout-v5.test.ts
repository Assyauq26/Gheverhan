import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { configureTestJnt, testAddress, shippingConfirmation } from "../fixtures/jnt-checkout";
configureTestJnt();
process.env.DATABASE_URL = process.env.SPRINT1_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.SPRINT1_TEST_DATABASE_URL;
let db: PrismaClient;
let checkout: typeof import("../../src/modules/checkout/checkout.service");
before(async () => { db = (await import("../../src/lib/prisma")).prisma; checkout = await import("../../src/modules/checkout/checkout.service"); });
after(async () => { await db?.$disconnect(); });
async function fixture() {
  const suffix = randomUUID();
  const p = await db.product.create({ data: { name: "V5 synthetic", slug: "v5-" + suffix, basePrice: 100000, weightGrams: 250, status: "PUBLISHED", variants: { create: { sku: "V5-" + suffix, inventory: { create: { onHand: 20 } } } } }, include: { variants: true } });
  const user = await db.user.create({ data: { name: "Synthetic", email: suffix + "@example.test", passwordHash: "not-for-login", cart: { create: { items: { create: { variantId: p.variants[0].id, quantity: 2 } } } } } });
  const bank = await db.bankAccount.create({ data: { displayName: "Synthetic", bankName: "Dummy", accountHolder: "Dummy", accountNumber: suffix } });
  const quote = await checkout.previewCheckout(user.id, {});
  return { user, p, bank, input: { ...(await shippingConfirmation(user.id)), expectedLines: quote.lines, bankAccountId: bank.id, requestId: randomUUID() } };
}
test("new checkout preserves canonical address, actual weight and approved J&T service snapshot", async () => {
  const f = await fixture();
  const order = await checkout.createOrder(f.user.id, { ...f.input, address: { ...f.input.address, province: "Forged", city: "Forged" }, shipping: { ...f.input.shipping, cost: 0 } });
  assert.equal(order.shippingCost, 20000); assert.equal(order.shippingWeightGram, 500);
  assert.equal(order.shippingCourier, "J&T Express"); assert.equal(order.shippingService, "EZ"); assert.equal(order.shippingMode, "manual");
  const address = await db.orderAddress.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(address.villageCode, testAddress.villageCode); assert.equal(address.village, "Gambir"); assert.notEqual(address.province, "Forged");
  assert.equal(address.regionSource, "emsifa-v2");
  const saved = await db.customerAddress.findFirstOrThrow({ where: { customer: { userId: f.user.id }, isDefault: true } });
  assert.equal(saved.villageCode, address.villageCode);
});
test("forged carrier, route, quote and missing tariff never mutate stock/cart/order", async () => {
  const f = await fixture();
  for (const input of [
    { ...f.input, shipping: { ...f.input.shipping, courier: "JNE" } },
    { ...f.input, shipping: { ...f.input.shipping, quoteToken: "forged" } },
    { ...f.input, address: { ...f.input.address, cityCode: "32.71" } },
    { ...f.input, address: { ...f.input.address, villageCode: "31.71.01.1002", postalCode: "10150" } },
  ]) await assert.rejects(checkout.createOrder(f.user.id, input));
  const config = process.env.JNT_MANUAL_RATE_CONFIG;
  try { delete process.env.JNT_MANUAL_RATE_CONFIG;
    const noRates = await checkout.previewCheckout(f.user.id, { address: testAddress });
    assert.deepEqual(noRates.shippingRates, []); assert.equal(noRates.shippingValid, false);
    await assert.rejects(checkout.createOrder(f.user.id, f.input), { status: 422 });
  } finally { process.env.JNT_MANUAL_RATE_CONFIG = config; }
  assert.equal(await db.order.count({ where: { userId: f.user.id } }), 0);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.p.variants[0].id } })).reserved, 0);
  assert.equal(await db.cartItem.count({ where: { cart: { userId: f.user.id } } }), 1);
});
test("weight, dimensions, quantity, customer and configured tariff changes invalidate a held quote", async () => {
  const f = await fixture();
  await db.product.update({ where: { id: f.p.id }, data: { weightGrams: 251 } });
  await assert.rejects(checkout.createOrder(f.user.id, f.input), { status: 409 });
  await db.product.update({ where: { id: f.p.id }, data: { weightGrams: 250, packageLengthMm: 100, packageWidthMm: 100, packageHeightMm: 100 } });
  await assert.rejects(checkout.createOrder(f.user.id, f.input), { status: 409 });
  const other = await fixture();
  await assert.rejects(checkout.createOrder(other.user.id, { ...other.input, shipping: f.input.shipping }), { status: 409 });
  const config = process.env.JNT_MANUAL_RATE_CONFIG!;
  try { const changed = JSON.parse(config); changed.rates[0].cost++; process.env.JNT_MANUAL_RATE_CONFIG = JSON.stringify(changed);
    await assert.rejects(checkout.createOrder(other.user.id, other.input), { status: 409 });
  } finally { process.env.JNT_MANUAL_RATE_CONFIG = config; }
  await db.product.update({ where: { id: f.p.id }, data: { weightGrams: null } });
  await assert.rejects(checkout.previewCheckout(f.user.id, { address: testAddress }), { status: 422 });
});
