import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { PERMISSIONS } from "../../src/lib/auth/permissions";

const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("Explicit disposable local test database required");
const url = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/gheverhan_sprint1_test") throw new Error("Refusing non-local/non-test database");
url.searchParams.set("connection_limit", "8");
process.env.DATABASE_URL = url.toString(); process.env.DIRECT_URL = url.toString(); process.env.SHIPPING_PROVIDER = "manual";
let db: PrismaClient;
let checkout: typeof import("../../src/modules/checkout/checkout.service");
let payments: typeof import("../../src/modules/payments/payments.service");
let orders: typeof import("../../src/modules/orders/orders.service");
let inventory: typeof import("../../src/modules/inventory/inventory.service");
let cart: typeof import("../../src/modules/cart/cart.service");
let catalog: typeof import("../../src/modules/catalog/product-management.service");
let shipping: typeof import("../../src/infrastructure/shipping");
let adminId: string;
const prefix = randomUUID().slice(0, 8);
let seq = 0;
const address = { recipientName: "Fixture", phone: "0800000000", line: "Local test", city: "Test", province: "Test", postalCode: "00000" };
let bankId: string;
const tracked: string[] = [];
before(async () => {
  db = (await import("../../src/lib/prisma")).prisma;
  checkout = await import("../../src/modules/checkout/checkout.service"); payments = await import("../../src/modules/payments/payments.service"); orders = await import("../../src/modules/orders/orders.service");
  inventory = await import("../../src/modules/inventory/inventory.service"); cart = await import("../../src/modules/cart/cart.service"); catalog = await import("../../src/modules/catalog/product-management.service"); shipping = await import("../../src/infrastructure/shipping");
  const role = await db.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Admin" }, update: {} });
  for (const key of Object.values(PERMISSIONS)) {
    const p = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
  }
  adminId = (await db.user.create({ data: { name: "Test staff", email: `staff-${prefix}@test.example`, passwordHash: "fixture-not-for-login", roles: { create: { roleId: role.id } } } })).id;
  bankId = (await db.bankAccount.create({ data: { bankName: "Fixture", accountNumber: "fixture-only", accountHolder: "Fixture", displayName: "Fixture" } })).id;
});
after(async () => { await db?.$disconnect(); });
async function product(stock = 1) {
  const p = await db.product.create({ data: { name: "Local product", slug: `m2a-${prefix}-${++seq}`, basePrice: 100000, status: "PUBLISHED", images: { create: { url: "https://example.test/fixture.png", alt: "Fixture" } }, variants: { create: { sku: `M2A-${prefix}-${seq}`, inventory: { create: { onHand: stock } } } } }, include: { variants: true } });
  tracked.push(p.variants[0].id); return p;
}
async function buyer(variantId: string) {
  return db.user.create({ data: { name: "Test buyer", email: `buyer-${prefix}-${++seq}@test.example`, passwordHash: "fixture-not-for-login", cart: { create: { items: { create: { variantId, quantity: 1 } } } } } });
}
async function input(userId: string) {
  return { address, shipping: { courier: "JNE", service: "REG", cost: 20000 }, bankAccountId: bankId, requestId: randomUUID(), expectedLines: (await cart.getCartView(userId)).lines.map(({ variantId, quantity, unitPrice }) => ({ variantId, quantity, unitPrice })) };
}
const proof = { senderBank: "Fixture", senderName: "Fixture", amount: 120000, transferDate: new Date(), proofPath: "nonproduction/fixture.png", proofMime: "image/png" };
async function pending() {
  const p = await product(); const b = await buyer(p.variants[0].id);
  const order = await checkout.createOrder(b.id, await input(b.id));
  await payments.submitConfirmation(b.id, order.id, proof);
  return { p, b, order, payment: await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }) };
}
async function invariant() {
  const rows = await db.inventory.findMany({ where: { variantId: { in: tracked } } });
  for (const row of rows) assert.ok(row.reserved >= 0 && row.reserved <= row.onHand, `Invariant violated for ${row.variantId}`);
}
async function movements(id: string, type: "RESERVATION" | "RELEASE" | "SALE") { return db.inventoryMovement.count({ where: { variantId: id, type } }); }

// Verify actual overlapping PostgreSQL lock waiters, then release the held Order row.
async function parallelOrder(id: string, calls: Array<() => Promise<unknown>>, table: "Order" | "Inventory" = "Order") {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => { entered = r; }); const gate = new Promise<void>(r => { release = r; });
  const holder = db.$transaction(async tx => {
    if (table === "Order") await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${id} FOR UPDATE`;
    entered(); await gate;
  }, { timeout: 10000 });
  await ready;
  const results = Promise.allSettled(calls.map(fn => fn()));
  try {
    let count = 0;
    for (let i = 0; i < 80; i++) {
      const rows = await db.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${`%${table}%`}`;
      count = rows[0].count; if (count >= calls.length) break; await new Promise(r => setTimeout(r, 20));
    }
    assert.ok(count >= calls.length, "Both real transactions must overlap while waiting for the Order row");
  } finally { release(); await holder; }
  return results;
}
async function gatedShipping<T>(run: () => Promise<T>, between: () => Promise<void>, arrivals = 1) {
  const provider = shipping.getShippingProvider("manual"); const original = provider.getRates!;
  let enter!: () => void, release!: () => void, n = 0;
  const ready = new Promise<void>(r => { enter = r; }); const gate = new Promise<void>(r => { release = r; });
  provider.getRates = async params => { if (++n === arrivals) enter(); await gate; return original.call(provider, params); };
  const timer = setTimeout(() => { enter(); release(); }, 4000);
  const result = run();
  try { await ready; assert.equal(n, arrivals); await between(); release(); return await result; }
  finally { release(); clearTimeout(timer); provider.getRates = original; }
}
async function auditFailure<T>(run: () => Promise<T>) {
  const audit = await db.auditLog.create({ data: { action: "test.fixture", entity: "Test" } });
  const original = db.$transaction.bind(db);
  const replacement = ((fn: (tx: Prisma.TransactionClient) => Promise<T>, opts?: object) => original(tx => fn(new Proxy(tx, { get(t, k) {
    if (k !== "auditLog") return Reflect.get(t, k);
    return new Proxy(t.auditLog, { get(delegate, method) {
      if (method !== "create") return Reflect.get(delegate, method);
      return (args: Prisma.AuditLogCreateArgs) => delegate.create({ ...args, data: { ...args.data, id: audit.id } });
    } });
  } })), opts)) as typeof db.$transaction;
  db.$transaction = replacement;
  try { await assert.rejects(run(), { code: "P2002" }); }
  finally { db.$transaction = original; }
}

test("PostgreSQL transaction correctness", async t => {
  await t.test("two checkouts for stock 1: exactly one order and reservation", async () => {
    const p = await product(); const [a, b] = await Promise.all([buyer(p.variants[0].id), buyer(p.variants[0].id)]); const [ai, bi] = await Promise.all([input(a.id), input(b.id)]);
    const results = await gatedShipping(() => Promise.allSettled([checkout.createOrder(a.id, ai), checkout.createOrder(b.id, bi)]), async () => {}, 2);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length, 1);
    assert.equal(await db.orderItem.count({ where: { variantId: p.variants[0].id } }), 1); assert.equal(await movements(p.variants[0].id, "RESERVATION"), 1); await invariant();
  });
  await t.test("two payment approvals and sequential replay: exactly one sale", async () => {
    const f = await pending(); const results = await parallelOrder(f.order.id, [() => payments.approvePayment(f.payment.id, adminId), () => payments.approvePayment(f.payment.id, adminId)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2); await payments.approvePayment(f.payment.id, adminId);
    assert.equal(await movements(f.p.variants[0].id, "SALE"), 1); assert.equal((await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status, "PAID");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status, "PAID"); assert.equal(await db.orderStatusHistory.count({ where: { orderId: f.order.id, toStatus: "PAID" } }), 1); await invariant();
  });
  await t.test("two cancellations and sequential replay: exactly one release", async () => {
    const f = await pending(); const results = await parallelOrder(f.order.id, [() => orders.transitionOrder(f.order.id, "CANCELLED", adminId), () => orders.transitionOrder(f.order.id, "CANCELLED", adminId)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2); await orders.transitionOrder(f.order.id, "CANCELLED", adminId);
    assert.equal(await movements(f.p.variants[0].id, "RELEASE"), 1); assert.equal((await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status, "EXPIRED"); await invariant();
  });
  await t.test("approval versus cancellation: only one lifecycle wins", async () => {
    const f = await pending(); const results = await parallelOrder(f.order.id, [() => payments.approvePayment(f.payment.id, adminId), () => orders.transitionOrder(f.order.id, "CANCELLED", adminId)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length, 1);
    const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id } }); const payment = await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } });
    assert.ok(["PAID", "CANCELLED"].includes(order.status)); assert.equal(payment.status, order.status === "PAID" ? "PAID" : "EXPIRED");
    assert.equal(await movements(f.p.variants[0].id, "SALE") + await movements(f.p.variants[0].id, "RELEASE"), 1); await invariant();
  });
  await t.test("cancelled and expired orders cannot be approved or receive proofs", async () => {
    for (const status of ["CANCELLED", "EXPIRED"] as const) {
      const f = await pending(); await orders.transitionOrder(f.order.id, status, adminId);
      await assert.rejects(payments.approvePayment(f.payment.id, adminId), { status: 409 }); await assert.rejects(payments.submitConfirmation(f.b.id, f.order.id, proof), { status: 409 });
      assert.equal(await movements(f.p.variants[0].id, "SALE"), 0);
    } await invariant();
  });
  await t.test("generic PAID/REFUNDED and paid cancellation are forbidden", async () => {
    const f = await pending(); await assert.rejects(orders.transitionOrder(f.order.id, "PAID", adminId), { status: 409 });
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status, "WAITING_VERIFICATION");
    await payments.approvePayment(f.payment.id, adminId); await assert.rejects(orders.transitionOrder(f.order.id, "REFUNDED", adminId), { status: 409 }); await assert.rejects(orders.transitionOrder(f.order.id, "CANCELLED", adminId), { status: 409 }); await invariant();
  });
  await t.test("payment verification and order writes check real DB permissions", async () => {
    const f = await pending(); await assert.rejects(payments.approvePayment(f.payment.id, f.b.id), { status: 403 }); await assert.rejects(payments.rejectPayment(f.payment.id, f.b.id, "Test"), { status: 403 }); await assert.rejects(orders.transitionOrder(f.order.id, "CANCELLED", f.b.id), { status: 403 });
    assert.equal(await movements(f.p.variants[0].id, "SALE"), 0); await invariant();
  });
  await t.test("a cancellation winner remains terminal for later approval", async () => {
    const f = await pending(); await orders.transitionOrder(f.order.id, "CANCELLED", adminId);
    await assert.rejects(payments.approvePayment(f.payment.id, adminId), { status: 409 });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status, "CANCELLED");
    assert.equal(await movements(f.p.variants[0].id, "SALE"), 0); await invariant();
  });
  await t.test("an approval winner cannot subsequently release stock through cancellation", async () => {
    const f = await pending(); await payments.approvePayment(f.payment.id, adminId);
    await assert.rejects(orders.transitionOrder(f.order.id, "CANCELLED", adminId), { status: 409 });
    assert.equal(await movements(f.p.variants[0].id, "RELEASE"), 0); await invariant();
  });
  await t.test("price edit during checkout produces conflict and explicit reconfirmation", async () => {
    const p = await product(3); const b = await buyer(p.variants[0].id); const confirmed = await input(b.id);
    const result = await gatedShipping(() => Promise.allSettled([checkout.createOrder(b.id, confirmed)]), async () => {
      const actor = { id: adminId, isAdmin: true, permissions: Object.values(PERMISSIONS) }; const view = await catalog.getManagedProduct(actor, p.id);
      await catalog.updateManagedProduct(actor, p.id, view.updatedAt, { ...view, basePrice: 200000 });
    });
    assert.equal(result[0].status, "rejected"); if (result[0].status === "rejected") assert.equal(result[0].reason.status, 409);
    assert.equal(await db.order.count({ where: { userId: b.id } }), 0); assert.equal(await movements(p.variants[0].id, "RESERVATION"), 0);
    const accepted = await checkout.createOrder(b.id, await input(b.id)); assert.equal(accepted.subtotal, 200000); await invariant();
  });
  await t.test("price changed before submit and missing/tampered quotes are rejected", async () => {
    const p = await product(3); const b = await buyer(p.variants[0].id); const confirmed = await input(b.id);
    await db.product.update({ where: { id: p.id }, data: { basePrice: 200000 } });
    await assert.rejects(checkout.createOrder(b.id, confirmed), { status: 409 }); await assert.rejects(checkout.createOrder(b.id, { ...confirmed, expectedLines: undefined }), { status: 409 });
    await assert.rejects(checkout.createOrder(b.id, { ...confirmed, expectedLines: confirmed.expectedLines.map(l => ({ ...l, unitPrice: 1 })) }), { status: 409 }); assert.equal(await db.order.count({ where: { userId: b.id } }), 0);
  });
  await t.test("same checkout request parallel/replay returns one durable order", async () => {
    const p = await product(5); const b = await buyer(p.variants[0].id); const request = await input(b.id);
    const results = await gatedShipping(() => Promise.all([checkout.createOrder(b.id, request), checkout.createOrder(b.id, request)]), async () => {}, 2);
    assert.equal(results[0].id, results[1].id); assert.equal((await checkout.createOrder(b.id, request)).id, results[0].id);
    await cart.addItem(b.id, p.variants[0].id); assert.equal((await checkout.createOrder(b.id, request)).id, results[0].id); assert.equal((await cart.getCartView(b.id)).count, 1);
    await assert.rejects(checkout.createOrder(b.id, { ...request, note: "Different payload" }), { status: 409 });
    assert.equal(await db.order.count({ where: { userId: b.id } }), 1); assert.equal(await movements(p.variants[0].id, "RESERVATION"), 1); await invariant();
  });
  await t.test("two request IDs against the same cart cannot double-checkout", async () => {
    const p = await product(5); const b = await buyer(p.variants[0].id); const request = await input(b.id);
    const results = await gatedShipping(() => Promise.allSettled([checkout.createOrder(b.id, request), checkout.createOrder(b.id, { ...request, requestId: randomUUID() })]), async () => {}, 2);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(await db.order.count({ where: { userId: b.id } }), 1); await invariant();
  });
  await t.test("checkout rollback after reservations/payment/cart consumption on DB failure", async () => {
    const p = await product(); const b = await buyer(p.variants[0].id); const request = await input(b.id);
    await auditFailure(() => checkout.createOrder(b.id, request));
    assert.equal(await db.order.count({ where: { userId: b.id } }), 0); assert.equal(await db.payment.count({ where: { order: { userId: b.id } } }), 0); assert.equal(await movements(p.variants[0].id, "RESERVATION"), 0); assert.equal((await cart.getCartView(b.id)).count, 1);
    assert.equal((await checkout.createOrder(b.id, request)).subtotal, 100000); await invariant();
  });
  await t.test("approval rollback restores payment/order/proof/inventory on DB failure", async () => {
    const f = await pending(); await auditFailure(() => payments.approvePayment(f.payment.id, adminId));
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status, "PENDING_PAYMENT"); assert.equal((await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status, "WAITING_VERIFICATION");
    assert.equal((await db.paymentConfirmation.findFirstOrThrow({ where: { paymentId: f.payment.id } })).status, "SUBMITTED"); assert.equal(await movements(f.p.variants[0].id, "SALE"), 0); await invariant();
  });
  await t.test("cancel rollback restores reservation and lifecycle on DB failure", async () => {
    const f = await pending(); await auditFailure(() => orders.transitionOrder(f.order.id, "CANCELLED", adminId));
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status, "PENDING_PAYMENT"); assert.equal((await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status, "WAITING_VERIFICATION"); assert.equal(await movements(f.p.variants[0].id, "RELEASE"), 0); await invariant();
  });
  await t.test("reject/resubmit/approve and fulfillment preserve the existing happy path", async () => {
    const f = await pending(); await payments.rejectPayment(f.payment.id, adminId, "Upload again");
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status, "REJECTED");
    await payments.submitConfirmation(f.b.id, f.order.id, proof); await payments.approvePayment(f.payment.id, adminId);
    await assert.rejects(payments.submitConfirmation(f.b.id, f.order.id, proof), { status: 409 });
    for (const state of ["PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "COMPLETED"] as const) await orders.transitionOrder(f.order.id, state, adminId);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status, "COMPLETED"); assert.equal(await movements(f.p.variants[0].id, "SALE"), 1); await invariant();
  });
  await t.test("system expiry releases once and uses a valid nullable audit actor", async () => {
    const f = await pending(); await db.order.update({ where: { id: f.order.id }, data: { expiresAt: new Date(0) } }); await assert.rejects(payments.approvePayment(f.payment.id, adminId), { status: 409 });
    await orders.expireStaleOrders(); await orders.expireStaleOrders(); assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status, "EXPIRED"); assert.equal(await movements(f.p.variants[0].id, "RELEASE"), 1); await invariant();
  });
  await t.test("adjustment versus reservation preserves the invariant under real row contention", async () => {
    const p = await product(); const row = await db.inventory.findUniqueOrThrow({ where: { variantId: p.variants[0].id } });
    const results = await parallelOrder(row.id, [
      () => db.$transaction(tx => inventory.reserveStock(tx, p.variants[0].id, 1, "concurrent-fixture")),
      () => inventory.adjustStock(p.variants[0].id, 0, "Concurrent fixture", { expectedOnHand: 1 }),
    ], "Inventory");
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length, 1); await invariant();
  });
  await t.test("inconsistent legacy inventory is rejected without silent repair", async () => {
    const p = await product(); await db.inventory.update({ where: { variantId: p.variants[0].id }, data: { reserved: -1 } });
    try {
      await assert.rejects(inventory.adjustStock(p.variants[0].id, 2, "Must not mutate corrupt stock"), { status: 409 });
      assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: p.variants[0].id } })).onHand, 1);
    } finally { await db.inventory.update({ where: { variantId: p.variants[0].id }, data: { reserved: 0 } }); }
    await invariant();
  });
  await t.test("negative/zero movement quantities and insufficient reserves cannot mutate stock", async () => {
    const p = await product();
    for (const quantity of [0, -1, 1.5]) await assert.rejects(db.$transaction(tx => inventory.reserveStock(tx, p.variants[0].id, quantity, "fixture")), { status: 400 });
    await assert.rejects(db.$transaction(tx => inventory.releaseStock(tx, p.variants[0].id, 1, "fixture")), { status: 409 }); await assert.rejects(db.$transaction(tx => inventory.commitSale(tx, p.variants[0].id, 1, "fixture")), { status: 409 }); await invariant();
  });
});
