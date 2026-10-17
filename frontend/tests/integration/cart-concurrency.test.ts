import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("Explicit isolated test database required");
const parsed = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/gheverhan_sprint1_test") throw new Error("Cart regression refuses non-local/test databases");
process.env.DATABASE_URL = target; process.env.DIRECT_URL = target;
const db = new PrismaClient({ datasources: { db: { url: target } } });
let cart: typeof import("../../src/modules/cart/cart.service");
let checkout: typeof import("../../src/modules/checkout/checkout.service");
let bankId: string;
const prefix = randomUUID();
before(async () => {
  process.env.PAYMENT_PROVIDER = "manual"; process.env.SHIPPING_PROVIDER = "manual";
  cart = await import("../../src/modules/cart/cart.service");
  checkout = await import("../../src/modules/checkout/checkout.service");
  bankId = (await db.bankAccount.create({ data: { bankName: "Local fixture", accountNumber: prefix, accountHolder: "Fixture", displayName: "Fixture" } })).id;
});
after(async () => {
  await db.auditLog.deleteMany({ where: { user: { email: { endsWith: `@${prefix}.example.test` } } } });
  await db.order.deleteMany({ where: { user: { email: { endsWith: `@${prefix}.example.test` } } } });
  await db.inventoryMovement.deleteMany({ where: { variant: { product: { slug: { startsWith: prefix } } } } });
  await db.bankAccount.delete({ where: { id: bankId } });
  await db.user.deleteMany({ where: { email: { endsWith: `@${prefix}.example.test` } } });
  await db.inventory.deleteMany({ where: { variant: { product: { slug: { startsWith: prefix } } } } });
  await db.productVariant.deleteMany({ where: { product: { slug: { startsWith: prefix } } } });
  await db.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.$disconnect();
});
let seq = 0;
async function fixture(stock = 100, existing = true) {
  const id = `${prefix}-${++seq}`;
  const product = await db.product.create({ data: { name: id, slug: id, status: "PUBLISHED", basePrice: 10000,
    variants: { create: { sku: id, inventory: { create: { onHand: stock } } } },
  }, include: { variants: true } });
  const variantId = product.variants[0].id;
  const user = await db.user.create({ data: { name: "Concurrency buyer", email: `${seq}@${prefix}.example.test`, passwordHash: "local-fixture",
    ...(existing ? { cart: { create: { items: { create: { variantId, quantity: 1 } } } } } : {}),
  } });
  return { userId: user.id, variantId };
}
test("concurrent regular and quick adds preserve every acknowledged increment", async () => {
  const { userId, variantId } = await fixture();
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => i % 2 ? cart.addItem(userId, variantId) : cart.quickAddItem(userId, variantId)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 8);
  assert.equal((await cart.getCartView(userId)).count, 9);
});
test("concurrent first adds create one cart without losing accepted increments", async () => {
  const { userId, variantId } = await fixture(100, false);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => i % 2 ? cart.addItem(userId, variantId) : cart.quickAddItem(userId, variantId)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 8);
  assert.equal((await cart.getCartView(userId)).count, 8);
  assert.equal(await db.cart.count({ where: { userId } }), 1);
});
test("concurrent last-stock adds acknowledge only the available quantity", async () => {
  const { userId, variantId } = await fixture(2);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => cart.quickAddItem(userId, variantId)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await cart.getCartView(userId)).count, 2);
  for (const result of results) if (result.status === "rejected") assert.equal(result.reason.status, 409);
});


test("an add racing checkout is retained in either the order or the remaining cart", async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { userId, variantId } = await fixture();
    const expectedLines = (await cart.getCartView(userId)).lines.map(({ variantId, quantity, unitPrice }) => ({ variantId, quantity, unitPrice }));
    const results = await Promise.allSettled([
      cart.quickAddItem(userId, variantId),
      checkout.createOrder(userId, {
        address: { recipientName: "Local fixture", phone: "0800000000", line: "Local", city: "Test", province: "Test", postalCode: "00000" },
        shipping: { courier: "JNE", service: "REG", cost: 20000 }, bankAccountId: bankId,
        expectedLines, requestId: randomUUID(),
      }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    if (results[1].status === "rejected") assert.equal(results[1].reason.status, 409);
    const ordered = await db.orderItem.aggregate({ where: { order: { userId } }, _sum: { quantity: true } });
    assert.equal((ordered._sum.quantity ?? 0) + (await cart.getCartView(userId)).count, 2);
  }
});
