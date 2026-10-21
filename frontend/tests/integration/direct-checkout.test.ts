import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { PERMISSIONS } from "../../src/lib/auth/permissions";

const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
let db: PrismaClient;
let intents: typeof import("../../src/modules/checkout/checkout-intent");
let checkout: typeof import("../../src/modules/checkout/checkout.service");
let cart: typeof import("../../src/modules/cart/cart.service");
let bank: string;
const prefix = randomUUID();
let sequence = 0;
const shipping = { courier: "JNE", service: "REG", cost: 1 };
const address = { recipientName: "Dummy Buyer", phone: "0800000000", line: "Dummy local address", city: "Test", province: "Test", postalCode: "00000" };
before(async () => {
  db = (await import("../../src/lib/prisma")).prisma;
  intents = await import("../../src/modules/checkout/checkout-intent");
  checkout = await import("../../src/modules/checkout/checkout.service");
  cart = await import("../../src/modules/cart/cart.service");
  bank = (await db.bankAccount.create({ data: { bankName: "Dummy", accountNumber: "dummy", accountHolder: "Dummy", displayName: "Dummy direct checkout" } })).id;
});
after(async () => { await db?.$disconnect(); });
async function fixture(stock = 10) {
  const id = `${prefix}-${++sequence}`;
  const product = await db.product.create({ data: { name: "Dummy Buy Now", slug: `direct-${id}`, status: "PUBLISHED", basePrice: 100000, variants: { create: { sku: `DIRECT-${id}`, color: "Merah", size: "M", inventory: { create: { onHand: stock } } } } }, include: { variants: true } });
  const buyer = await db.user.create({ data: { name: "Dummy Buyer", email: `direct-${id}@example.test`, passwordHash: "dummy-never-used" } });
  return { buyer, variant: product.variants[0], product };
}
async function orderInput(userId: string, intentId?: string) {
  const quote = await checkout.previewCheckout(userId, { shipping, intentId });
  return { address, shipping, bankAccountId: bank, requestId: randomUUID(), intentId, expectedLines: quote.lines, expectedQuote: { subtotal: quote.subtotal, shippingCost: quote.shippingCost, discount: quote.discount, total: quote.total } };
}

test("direct order buys exactly selected quantity while preserving an existing cart, payment and reservation invariants", async () => {
  const { buyer, variant } = await fixture();
  await cart.addItem(buyer.id, variant.id, 3);
  const before = await cart.getCartView(buyer.id);
  const intent = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 2 });
  const input = await orderInput(buyer.id, intent.id);
  assert.equal(input.expectedQuote.total, 220000);
  const order = await checkout.createOrder(buyer.id, input);
  const items = await db.orderItem.findMany({ where: { orderId: order.id } });
  assert.equal(items.length, 1); assert.equal(items[0].quantity, 2); assert.equal(items[0].variantId, variant.id);
  assert.equal(items[0].variantLabel, "Merah / M");
  assert.deepEqual(await cart.getCartView(buyer.id), { ...before, lines: before.lines.map(line => ({ ...line, availableStock: 8 })) });
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).reserved, 2);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { orderId: order.id } })).status, "PENDING_PAYMENT");
  assert.equal((await checkout.createOrder(buyer.id, { ...input, requestId: randomUUID() })).id, order.id);
  await assert.rejects(checkout.previewCheckout(buyer.id, { intentId: intent.id }), /Checkout tidak tersedia/);
  const cartOrder = await checkout.createOrder(buyer.id, await orderInput(buyer.id));
  assert.equal((await db.orderItem.findFirstOrThrow({ where: { orderId: cartOrder.id } })).quantity, 3);
  assert.equal((await cart.getCartView(buyer.id)).count, 0);
});

test("guest continuation needs the original browser secret, is claimed once, and rejects another user", async () => {
  const { buyer, variant } = await fixture();
  const other = await fixture();
  const intent = await intents.createCheckoutIntent(null, { variantId: variant.id, quantity: 1 });
  const saved = await db.checkoutIntent.findUniqueOrThrow({ where: { id: intent.id } });
  assert.notEqual(saved.guestSecretHash, intent.secret);
  await assert.rejects(intents.claimCheckoutIntent(intent.id, buyer.id), /Checkout tidak tersedia/);
  await assert.rejects(intents.claimCheckoutIntent(intent.id, other.buyer.id, "0".repeat(64)), /Checkout tidak tersedia/);
  await intents.claimCheckoutIntent(intent.id, buyer.id, intent.secret);
  assert.equal((await db.checkoutIntent.findUniqueOrThrow({ where: { id: intent.id } })).guestSecretHash, null);
  await assert.rejects(intents.claimCheckoutIntent(intent.id, other.buyer.id, intent.secret), /Checkout tidak tersedia/);
  await assert.rejects(checkout.previewCheckout(other.buyer.id, { intentId: intent.id }), /Checkout tidak tersedia/);
  assert.equal((await intents.getIntentCheckoutView(intent.id, buyer.id)).count, 1);
});

test("expired, malformed and invalid selection fails closed without orders or cart changes", async () => {
  const { buyer, variant } = await fixture(1);
  for (const quantity of [0, -1, 0.5, 1000, NaN]) await assert.rejects(intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity }));
  await assert.rejects(intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 2 }), /stok/);
  const intent = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  await db.checkoutIntent.update({ where: { id: intent.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(intents.claimCheckoutIntent(intent.id, buyer.id), /kedaluwarsa/);
  await assert.rejects(intents.readCheckoutIntent("invalid", buyer.id), /Checkout/);
  assert.equal(await db.order.count({ where: { userId: buyer.id } }), 0);
  assert.equal(await db.cart.count({ where: { userId: buyer.id } }), 0);
});

test("server rejects price, quantity and quote tampering then rechecks product availability at commit", async () => {
  const { buyer, variant, product } = await fixture();
  const intent = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  const input = await orderInput(buyer.id, intent.id);
  await assert.rejects(checkout.createOrder(buyer.id, { ...input, expectedLines: [{ ...input.expectedLines[0], quantity: 2 }] }), /konfirmasi ulang/);
  await assert.rejects(checkout.createOrder(buyer.id, { ...input, expectedQuote: { subtotal: 1, shippingCost: 0, discount: 0, total: 1 } }), /konfirmasi ulang/);
  await db.product.update({ where: { id: product.id }, data: { basePrice: 200000 } });
  await assert.rejects(checkout.createOrder(buyer.id, input), /konfirmasi ulang/);
  await db.product.update({ where: { id: product.id }, data: { status: "ARCHIVED" } });
  await assert.rejects(checkout.createOrder(buyer.id, await orderInput(buyer.id, intent.id)), /tidak tersedia/);
  assert.equal(await db.order.count({ where: { userId: buyer.id } }), 0);
});

test("parallel duplicate submissions consume one intent and reserve stock once", async () => {
  const { buyer, variant } = await fixture(1);
  const intent = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  const input = await orderInput(buyer.id, intent.id);
  const orders = await Promise.all([checkout.createOrder(buyer.id, input), checkout.createOrder(buyer.id, { ...input, requestId: randomUUID() })]);
  assert.equal(orders[0].id, orders[1].id);
  assert.equal(await db.order.count({ where: { userId: buyer.id } }), 1);
  assert.equal(await db.inventoryMovement.count({ where: { variantId: variant.id, type: "RESERVATION" } }), 1);
  await assert.rejects(checkout.createOrder(buyer.id, { ...input, note: "Different order" }), /Request ID/);
});

test("two intents competing for final stock cannot oversell or partially consume losing intent", async () => {
  const { buyer, variant } = await fixture(1);
  const other = await fixture();
  const first = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  const second = await intents.createCheckoutIntent(other.buyer.id, { variantId: variant.id, quantity: 1 });
  const a = await orderInput(buyer.id, first.id), b = await orderInput(other.buyer.id, second.id);
  const results = await Promise.allSettled([checkout.createOrder(buyer.id, a), checkout.createOrder(other.buyer.id, b)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).reserved, 1);
  assert.equal(await db.checkoutIntent.count({ where: { id: { in: [first.id, second.id] }, consumedAt: { not: null } } }), 1);
});

test("direct checkout coupon uses selected subtotal and still enforces usage limit", async () => {
  const { buyer, variant } = await fixture();
  const code = `DIRECT-${randomUUID()}`.toUpperCase();
  await db.coupon.create({ data: { code, discountType: "PERCENT", discountValue: 10, usageLimit: 1 } });
  await cart.addItem(buyer.id, variant.id, 5);
  const intent = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  const quote = await checkout.previewCheckout(buyer.id, { intentId: intent.id, shipping, couponCode: code });
  assert.equal(quote.discount, 10000); assert.equal(quote.subtotal, 100000);
  const input = { ...await orderInput(buyer.id, intent.id), couponCode: code, expectedQuote: { subtotal: quote.subtotal, shippingCost: quote.shippingCost, discount: quote.discount, total: quote.total } };
  await checkout.createOrder(buyer.id, input);
  const next = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  const after = await checkout.previewCheckout(buyer.id, { intentId: next.id, couponCode: code });
  assert.equal(after.discount, 0);
  assert.equal((await cart.getCartView(buyer.id)).count, 5);
});

test("audit failure rolls back order, intent consumption and reservation atomically", async () => {
  const { buyer, variant } = await fixture();
  const intent = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  const input = await orderInput(buyer.id, intent.id);
  const original = db.$transaction.bind(db);
  db.$transaction = ((fn: (tx: Prisma.TransactionClient) => Promise<unknown>, opts?: object) => original(tx => fn(new Proxy(tx, {
    get(target, key) {
      if (key !== "auditLog") return Reflect.get(target, key);
      return new Proxy(target.auditLog, { get(delegate, method) {
        if (method === "create") return async () => { throw new Error("dummy audit failure"); };
        return Reflect.get(delegate, method);
      } });
    },
  })), opts)) as typeof db.$transaction;
  try { await assert.rejects(checkout.createOrder(buyer.id, input), /dummy audit failure/); }
  finally { db.$transaction = original; }
  assert.equal(await db.order.count({ where: { userId: buyer.id } }), 0);
  assert.equal((await db.checkoutIntent.findUniqueOrThrow({ where: { id: intent.id } })).consumedAt, null);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).reserved, 0);
  await checkout.createOrder(buyer.id, input);
});

test("direct orders retain rejection/resubmission, review expiry protection and idempotent payment sale", async () => {
  const { buyer, variant } = await fixture();
  const role = await db.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Admin" }, update: {} });
  const permission = await db.permission.upsert({ where: { key: PERMISSIONS.PAYMENT_VERIFY }, create: { key: PERMISSIONS.PAYMENT_VERIFY, label: "Verify" }, update: {} });
  await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  const staff = await db.user.create({ data: { name: "Dummy staff", email: `direct-staff-${randomUUID()}@example.test`, passwordHash: "dummy", roles: { create: { roleId: role.id } } } });
  await cart.addItem(buyer.id, variant.id, 3);
  const intent = await intents.createCheckoutIntent(buyer.id, { variantId: variant.id, quantity: 1 });
  const order = await checkout.createOrder(buyer.id, await orderInput(buyer.id, intent.id));
  const payments = await import("../../src/modules/payments/payments.service");
  const orders = await import("../../src/modules/orders/orders.service");
  const proof = { senderBank: "Dummy", senderName: "Dummy", amount: order.total, transferDate: new Date(), proofPath: "dummy/never-real.png", proofMime: "image/png" };
  const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } });
  await payments.submitConfirmation(buyer.id, order.id, proof);
  await payments.rejectPayment(payment.id, staff.id, "Dummy rejection");
  await payments.submitConfirmation(buyer.id, order.id, proof);
  await db.paymentConfirmation.updateMany({ where: { paymentId: payment.id }, data: { createdAt: new Date(0) } });
  await db.order.update({ where: { id: order.id }, data: { expiresAt: new Date(1) } });
  await orders.expireStaleOrders();
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PENDING_PAYMENT");
  await payments.approvePayment(payment.id, staff.id);
  await payments.approvePayment(payment.id, staff.id);
  const stock = await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert.equal(stock.onHand, 9); assert.equal(stock.reserved, 0);
  assert.equal(await db.inventoryMovement.count({ where: { variantId: variant.id, type: "SALE" } }), 1);
  assert.equal((await cart.getCartView(buyer.id)).count, 3);
});
