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
let refunds: typeof import("../../src/modules/payments/refund.service");
let shipments: typeof import("../../src/modules/shipping/shipping.service");
let verifierId: string;
let warehouseId: string;
let cart: typeof import("../../src/modules/cart/cart.service");
let adminId: string;
const prefix = randomUUID().slice(0, 8);
let seq = 0;
const address = { recipientName: "Fixture", phone: "0800000000", line: "Local test", city: "Test", province: "Test", postalCode: "00000" };
let bankId: string;
const tracked: string[] = [];
before(async () => {
  db = (await import("../../src/lib/prisma")).prisma;
  checkout = await import("../../src/modules/checkout/checkout.service"); payments = await import("../../src/modules/payments/payments.service"); orders = await import("../../src/modules/orders/orders.service");
  refunds = await import("../../src/modules/payments/refund.service"); shipments = await import("../../src/modules/shipping/shipping.service"); cart = await import("../../src/modules/cart/cart.service");
  const role = await db.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Admin" }, update: {} });
  for (const key of Object.values(PERMISSIONS)) {
    const p = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
  }
  adminId = (await db.user.create({ data: { name: "Test staff", email: `staff-${prefix}@test.example`, passwordHash: "fixture-not-for-login", roles: { create: { roleId: role.id } } } })).id;
  async function staff(name: "Finance" | "Warehouse", keys: string[]) {
    const role = await db.role.upsert({ where: { name }, create: { name, label: name }, update: {} });
    for (const key of keys) {
      const p = await db.permission.findUniqueOrThrow({ where: { key } });
      await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
    }
    return (await db.user.create({ data: { name, email: `${name}-${prefix}@test.example`, passwordHash: "fixture-not-for-login", roles: { create: { roleId: role.id } } } })).id;
  }
  verifierId = await staff("Finance", [PERMISSIONS.PAYMENT_VERIFY, PERMISSIONS.PAYMENT_READ]);
  warehouseId = await staff("Warehouse", [PERMISSIONS.SHIPPING_UPDATE, PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_ADJUST]);
  bankId = (await db.bankAccount.create({ data: { bankName: "Fixture", accountNumber: "fixture-only", accountHolder: "Fixture", displayName: "Fixture" } })).id;
});
after(async () => { await db?.$disconnect(); });
async function product(stock = 1) {
  const p = await db.product.create({ data: { name: "Local product", slug: `m2b-${prefix}-${++seq}`, basePrice: 100000, status: "PUBLISHED", images: { create: { url: "https://example.test/fixture.png", alt: "Fixture" } }, variants: { create: { sku: `M2B-${prefix}-${seq}`, inventory: { create: { onHand: stock } } } } }, include: { variants: true } });
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
async function auditFailure<T>(run: () => Promise<T>, expected: { code: string } | { status: number } = { code: "P2002" }) {
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
  try { await assert.rejects(run(), expected); }
  finally { db.$transaction = original; }
}

async function paid() {
  const f = await pending(); await payments.approvePayment(f.payment.id, adminId); return f;
}
async function requested(f: Awaited<ReturnType<typeof paid>>) {
  return refunds.requestRefund(f.order.id, adminId, { requestId: randomUUID(), amount: f.order.total, reason: "Customer requests full refund" });
}
const confirmation = (amount = 120000) => ({ amount, sourceAccountId: bankId, evidenceReference: `BANK-${randomUUID()}`, settledAt: new Date(), verificationKind: "MANUAL_BANK_REVIEW", attested: true });
const shippingInput = (status: "PENDING" | "PROCESSING" | "SHIPPED" | "IN_TRANSIT" | "DELIVERED") => ({
  courier: "Fixture", service: "REG", cost: 20000, status,
  ...(status === "PENDING" || status === "PROCESSING" ? {} : { trackingNumber: "FIXTURE-TRACKING" }),
  requestId: randomUUID(),
});
async function pack(orderId: string) {
  await orders.transitionOrder(orderId, "PROCESSING", adminId); await orders.transitionOrder(orderId, "PACKED", adminId);
}
async function status(orderId: string) {
  return db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, shipment: true } });
}

test("real PostgreSQL refund and shipment correctness", async t => {
  await t.test("managed adjustment requires real permissions and expected stock, with movement and audit", async () => {
    const { adjustManagedInventory } = await import("../../src/modules/inventory/inventory-management.service");
    const p = await product(3); const id = p.variants[0].id;
    await assert.rejects(adjustManagedInventory(id, verifierId, { expectedOnHand: 3, newOnHand: 4, reason: "Count verified" }), { status: 403 });
    await assert.rejects(adjustManagedInventory(id, warehouseId, { newOnHand: 4, reason: "Count verified" }));
    const result = await adjustManagedInventory(id, warehouseId, { expectedOnHand: 3, newOnHand: 4, reason: "Count verified" });
    assert.equal(result.onHand, 4); assert.equal(result.reserved, 0);
    assert.equal(await db.inventoryMovement.count({ where: { variantId: id, type: "ADJUSTMENT" } }), 1);
    assert.equal(await db.auditLog.count({ where: { action: "inventory.adjust", entityId: result.id, userId: warehouseId } }), 1);
    await assert.rejects(adjustManagedInventory(id, warehouseId, { expectedOnHand: 3, newOnHand: 9, reason: "Stale count" }), { status: 409 });
  });
  await t.test("parallel expected-stock adjustments commit one effect and rollback audit failures", async () => {
    const { adjustManagedInventory } = await import("../../src/modules/inventory/inventory-management.service");
    const p = await product(3); const id = p.variants[0].id; const inventory = await db.inventory.findUniqueOrThrow({ where: { variantId: id } });
    const outcomes = await parallelOrder(inventory.id, [() => adjustManagedInventory(id, warehouseId, { expectedOnHand: 3, newOnHand: 5, reason: "Count A" }), () => adjustManagedInventory(id, warehouseId, { expectedOnHand: 3, newOnHand: 6, reason: "Count B" })], "Inventory");
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
    const current = await db.inventory.findUniqueOrThrow({ where: { variantId: id } });
    await auditFailure(() => adjustManagedInventory(id, warehouseId, { expectedOnHand: current.onHand, newOnHand: 10, reason: "Rollback" }));
    assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: id } })).onHand, current.onHand);
    assert.equal(await db.inventoryMovement.count({ where: { variantId: id, type: "ADJUSTMENT" } }), 1);
  });
  await t.test("additive enum supports both legacy PAID and verified REFUNDED states", async () => {
    const rows = await db.$queryRaw<Array<{ enumlabel: string }>>`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname = 'PaymentStatus'`;
    assert.ok(rows.some(r => r.enumlabel === "REFUNDED")); assert.ok(rows.some(r => r.enumlabel === "PAID"));
    const f = await paid(); assert.equal((await status(f.order.id)).payment!.status, "PAID");
  });
  await t.test("refund intent parallel/replay is one event and does not claim settlement", async () => {
    const f = await paid(); const body = { requestId: randomUUID(), amount: f.order.total, reason: "Full refund requested" };
    const results = await parallelOrder(f.order.id, [() => refunds.requestRefund(f.order.id, adminId, body), () => refunds.requestRefund(f.order.id, adminId, body)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2); assert.equal(await db.paymentEvent.count({ where: { paymentId: f.payment.id, type: "REFUND_REQUESTED" } }), 1);
    assert.equal((await status(f.order.id)).payment!.status, "PAID"); assert.equal(await movements(f.p.variants[0].id, "SALE"), 1); await invariant();
    await assert.rejects(refunds.requestRefund(f.order.id, adminId, { ...body, reason: "Different payload" }), { status: 409 });
  });
  await t.test("refund confirmation parallel/replay records one manual settlement, without restock", async () => {
    const f = await paid(); const request = await requested(f); const body = confirmation();
    const results = await parallelOrder(f.order.id, [() => refunds.confirmManualRefund(request.id, verifierId, body), () => refunds.confirmManualRefund(request.id, verifierId, body)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2); await refunds.confirmManualRefund(request.id, verifierId, body);
    assert.equal(await db.paymentEvent.count({ where: { paymentId: f.payment.id, type: "REFUND_CONFIRMED" } }), 1);
    const state = await status(f.order.id); assert.equal(state.status, "REFUNDED"); assert.equal(state.paymentStatus, "REFUNDED"); assert.equal(state.payment!.status, "REFUNDED");
    assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.p.variants[0].id } })).onHand, 0); assert.equal(await db.inventoryMovement.count({ where: { variantId: f.p.variants[0].id, type: "RETURN" } }), 0); await invariant();
    await assert.rejects(refunds.confirmManualRefund(request.id, verifierId, { ...body, evidenceReference: "OTHER-REFERENCE" }), { status: 409 });
  });
  await t.test("manual settlement requires independent verifier, evidence, date, account and full amount", async () => {
    const f = await paid(); const request = await requested(f); const body = confirmation();
    await assert.rejects(refunds.confirmManualRefund(request.id, adminId, body), { status: 403 });
    await assert.rejects(refunds.confirmManualRefund(request.id, verifierId, { ...body, attested: false }), { name: "ZodError" });
    await assert.rejects(refunds.confirmManualRefund(request.id, verifierId, { ...body, evidenceReference: "" }), { name: "ZodError" });
    await assert.rejects(refunds.confirmManualRefund(request.id, verifierId, { ...body, settledAt: new Date(Date.now() + 60000) }), { name: "ZodError" });
    await assert.rejects(refunds.confirmManualRefund(request.id, verifierId, { ...body, amount: 1 }), { status: 422 });
    await assert.rejects(refunds.confirmManualRefund(request.id, verifierId, { ...body, sourceAccountId: "missing" }), { status: 422 });
    assert.equal((await status(f.order.id)).paymentStatus, "PAID"); await invariant();
  });
  await t.test("one bank transfer reference cannot settle two orders in parallel", async () => {
    const [a, b] = await Promise.all([paid(), paid()]); const [ar, br] = await Promise.all([requested(a), requested(b)]); const body = confirmation();
    const results = await Promise.allSettled([refunds.confirmManualRefund(ar.id, verifierId, body), refunds.confirmManualRefund(br.id, verifierId, body)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length, 1);
    assert.equal(await db.payment.count({ where: { id: { in: [a.payment.id, b.payment.id] }, status: "REFUNDED" } }), 1); await invariant();
  });
  await t.test("pending cancellation versus refund rejects refund and releases once", async () => {
    const f = await pending(); const results = await parallelOrder(f.order.id, [() => refunds.requestRefund(f.order.id, adminId, { requestId: randomUUID(), amount: f.order.total, reason: "Not paid refund" }), () => orders.transitionOrder(f.order.id, "CANCELLED", adminId)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await status(f.order.id)).status, "CANCELLED"); assert.equal(await movements(f.p.variants[0].id, "RELEASE"), 1); await invariant();
  });
  await t.test("verified refund versus paid cancellation never releases sale inventory", async () => {
    const f = await paid(); const request = await requested(f); const body = confirmation();
    const results = await parallelOrder(f.order.id, [() => refunds.confirmManualRefund(request.id, verifierId, body), () => orders.transitionOrder(f.order.id, "CANCELLED", adminId)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await status(f.order.id)).status, "REFUNDED"); assert.equal(await movements(f.p.variants[0].id, "RELEASE"), 0); await invariant();
  });
  await t.test("active refund freezes generic fulfillment and new dispatch", async () => {
    const f = await paid(); await pack(f.order.id); await requested(f);
    await assert.rejects(shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("SHIPPED")), { status: 409 });
    await assert.rejects(orders.transitionOrder(f.order.id, "SHIPPED", adminId), { status: 409 }); assert.equal(await db.shipment.count({ where: { orderId: f.order.id } }), 0); await invariant();
  });
  await t.test("refund request versus shipment preserves whichever physical event committed first", async () => {
    const f = await paid(); await pack(f.order.id);
    const results = await parallelOrder(f.order.id, [() => requested(f), () => shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("SHIPPED"))]);
    const state = await status(f.order.id); assert.equal(state.paymentStatus, "PAID");
    assert.equal(await db.paymentEvent.count({ where: { paymentId: f.payment.id, type: "REFUND_REQUESTED" } }), 1);
    if (state.shipment) { assert.equal(state.status, "SHIPPED"); assert.equal(state.shipment.status, "SHIPPED"); }
    else { assert.equal(state.status, "PACKED"); assert.ok(results.some(r => r.status === "rejected" && r.reason.status === 409)); } await invariant();
  });
  await t.test("refund confirmation versus dispatch is serialized and prevents dispatch", async () => {
    const f = await paid(); await pack(f.order.id); const request = await requested(f); const body = confirmation();
    const results = await parallelOrder(f.order.id, [() => refunds.confirmManualRefund(request.id, verifierId, body), () => shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("SHIPPED"))]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await status(f.order.id)).status, "REFUNDED"); assert.equal(await db.shipment.count({ where: { orderId: f.order.id } }), 0); await invariant();
  });
  await t.test("refund confirm versus decline creates only one resolution", async () => {
    const f = await paid(); const request = await requested(f); const body = confirmation();
    const results = await parallelOrder(f.order.id, [() => refunds.confirmManualRefund(request.id, verifierId, body), () => refunds.declineRefund(request.id, verifierId, "Evidence rejected")]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(await db.paymentEvent.count({ where: { paymentId: f.payment.id, type: { in: ["REFUND_CONFIRMED", "REFUND_DECLINED"] } } }), 1); await invariant();
  });
  await t.test("declining refund is idempotent and releases the fulfillment hold", async () => {
    const f = await paid(); const request = await requested(f); const result = await refunds.declineRefund(request.id, verifierId, "Transfer was not settled");
    assert.equal((await refunds.declineRefund(request.id, verifierId, "Transfer was not settled")).id, result.id);
    await orders.transitionOrder(f.order.id, "PROCESSING", adminId); assert.equal((await status(f.order.id)).status, "PROCESSING"); await invariant();
  });
  await t.test("AWB cannot mark un-packed order as dispatched", async () => {
    const f = await paid();
    const attempt = { ...shippingInput("PROCESSING"), trackingNumber: "JNT-NOT-PACKED" };
    await assert.rejects(shipments.upsertManualShipment(f.order.id, warehouseId, attempt), { status: 409 });
    assert.equal((await status(f.order.id)).status, "PAID");
    assert.equal(await db.shipment.count({ where: { orderId: f.order.id } }), 0);
    assert.equal(await db.orderStatusHistory.count({ where: { orderId: f.order.id, toStatus: "SHIPPED" } }), 0);
    await invariant();
  });
  await t.test("seller enters AWB on PACKED order: atomic SHIPPED, date, audit and retries", async () => {
    const f = await paid();
    const processing = await shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("PROCESSING"));
    assert.equal(processing.status, "PROCESSING");
    assert.equal(processing.trackingNumber, null);
    await orders.transitionOrder(f.order.id, "PACKED", adminId);
    const request = { ...shippingInput("PROCESSING"), trackingNumber: "JNT-HANDOVER-12345" };
    const dispatched = await shipments.upsertManualShipment(f.order.id, warehouseId, request);
    assert.equal(dispatched.status, "SHIPPED");
    assert.equal(dispatched.trackingNumber, "JNT-HANDOVER-12345");
    assert.ok(dispatched.shippedDate instanceof Date);
    assert.equal((await status(f.order.id)).status, "SHIPPED");
    assert.equal(await db.shipmentEvent.count({ where: { shipmentId: dispatched.id, status: "SHIPPED" } }), 1);
    assert.equal(await db.orderStatusHistory.count({ where: { orderId: f.order.id, toStatus: "SHIPPED" } }), 1);
    const initialAudit = await db.auditLog.count({ where: { action: "shipping.update", entityId: dispatched.id } });
    const repeatKey = await shipments.upsertManualShipment(f.order.id, warehouseId, request);
    assert.equal(repeatKey.id, dispatched.id);
    const repeatNoKey = await shipments.upsertManualShipment(f.order.id, warehouseId, { ...request, requestId: undefined });
    assert.equal(repeatNoKey.status, "SHIPPED");
    assert.equal(await db.shipmentEvent.count({ where: { shipmentId: dispatched.id, status: "SHIPPED" } }), 1);
    assert.equal(await db.auditLog.count({ where: { action: "shipping.update", entityId: dispatched.id } }), initialAudit);
    await invariant();
  });
  await t.test("existing legacy PROCESSING AWB is reconciled on next seller save", async () => {
    const f = await paid();
    await pack(f.order.id);
    const shippedDate = new Date("2026-09-20T00:00:00.000Z");
    const legacy = await db.shipment.create({ data: {
      orderId: f.order.id, provider: "manual", courier: "JNT", service: "REG",
      cost: 20000, status: "PROCESSING", trackingNumber: "LEGACY-JNT-123", shippedDate,
    } });
    const updated = await shipments.upsertManualShipment(f.order.id, warehouseId, {
      courier: "JNT", service: "REG", cost: 20000,
      status: "PROCESSING", trackingNumber: "LEGACY-JNT-123", shippedDate,
      requestId: randomUUID(),
    });
    assert.equal(updated.id, legacy.id);
    assert.equal(updated.status, "SHIPPED");
    assert.equal(updated.shippedDate?.getTime(), shippedDate.getTime());
    assert.equal((await status(f.order.id)).status, "SHIPPED");
    assert.equal(await db.shipmentEvent.count({ where: { shipmentId: legacy.id, status: "SHIPPED" } }), 1);
    await invariant();
  });
  await t.test("shipment parallel/key replay and identical keyless repeats have one effect", async () => {
    const f = await paid(); const body = shippingInput("PROCESSING");
    const results = await parallelOrder(f.order.id, [() => shipments.upsertManualShipment(f.order.id, warehouseId, body), () => shipments.upsertManualShipment(f.order.id, warehouseId, body)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2); const record = await shipments.upsertManualShipment(f.order.id, warehouseId, body);
    await shipments.upsertManualShipment(f.order.id, warehouseId, { ...body, requestId: undefined });
    assert.equal(await db.shipmentEvent.count({ where: { shipmentId: record.id } }), 1); assert.equal((await status(f.order.id)).status, "PROCESSING");
    await assert.rejects(shipments.upsertManualShipment(f.order.id, warehouseId, { ...body, cost: 21000 }), { status: 409 }); await invariant();
  });
  await t.test("invalid order transition rolls back all shipment database operations", async () => {
    const f = await paid(); await assert.rejects(shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("SHIPPED")), { status: 409 });
    assert.equal((await status(f.order.id)).status, "PAID"); assert.equal(await db.shipment.count({ where: { orderId: f.order.id } }), 0); await invariant();
  });
  await t.test("shipment DB failure after order update rolls back order/history/events", async () => {
    const f = await paid(); await auditFailure(() => shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("PROCESSING")));
    assert.equal((await status(f.order.id)).status, "PAID"); assert.equal(await db.shipment.count({ where: { orderId: f.order.id } }), 0); assert.equal(await db.orderStatusHistory.count({ where: { orderId: f.order.id, toStatus: "PROCESSING" } }), 0); await invariant();
  });
  await t.test("refund DB failure rolls back financial status/history/settlement event", async () => {
    const f = await paid(); const request = await requested(f); await auditFailure(() => refunds.confirmManualRefund(request.id, verifierId, confirmation()), { status: 409 });
    const state = await status(f.order.id); assert.equal(state.status, "PAID"); assert.equal(state.payment!.status, "PAID"); assert.equal(await db.paymentEvent.count({ where: { paymentId: f.payment.id, type: "REFUND_CONFIRMED" } }), 0); await invariant();
  });
  await t.test("explicit physical return parallel/replay restores stock exactly once", async () => {
    const f = await paid(); const request = await requested(f); await refunds.confirmManualRefund(request.id, verifierId, confirmation());
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: f.order.id } });
    const body = { requestId: randomUUID(), receivedAt: new Date(), receiptReference: "WAREHOUSE-RECEIPT", physicalReturnVerified: true, reason: "Physical item received and inspected", items: [{ orderItemId: item.id, quantity: 1 }] };
    const results = await parallelOrder(f.order.id, [() => refunds.receiveRefundReturn(request.id, warehouseId, body), () => refunds.receiveRefundReturn(request.id, warehouseId, body)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2); await refunds.receiveRefundReturn(request.id, warehouseId, body);
    assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.p.variants[0].id } })).onHand, 1); assert.equal(await db.inventoryMovement.count({ where: { variantId: f.p.variants[0].id, type: "RETURN" } }), 1);
    await assert.rejects(refunds.receiveRefundReturn(request.id, warehouseId, { ...body, requestId: randomUUID() }), { status: 409 }); await invariant();
  });
  await t.test("return receipt DB failure rolls back stock and return event", async () => {
    const f = await paid(); const request = await requested(f); await refunds.confirmManualRefund(request.id, verifierId, confirmation());
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: f.order.id } }); const body = { requestId: randomUUID(), receivedAt: new Date(), receiptReference: "WAREHOUSE-RECEIPT", physicalReturnVerified: true, reason: "Physical receipt", items: [{ orderItemId: item.id, quantity: 1 }] };
    await auditFailure(() => refunds.receiveRefundReturn(request.id, warehouseId, body), { status: 409 }); assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.p.variants[0].id } })).onHand, 0); assert.equal(await db.inventoryMovement.count({ where: { variantId: f.p.variants[0].id, type: "RETURN" } }), 0); await invariant();
  });
  await t.test("authorization prevents every unauthorized financial, stock and shipment action", async () => {
    const f = await paid(); const request = await requested(f); const body = confirmation();
    await assert.rejects(refunds.requestRefund(f.order.id, f.b.id, { requestId: randomUUID(), amount: 120000, reason: "Invalid actor" }), { status: 403 });
    await assert.rejects(refunds.confirmManualRefund(request.id, f.b.id, body), { status: 403 }); await assert.rejects(refunds.declineRefund(request.id, f.b.id, "Invalid actor"), { status: 403 });
    await assert.rejects(shipments.upsertManualShipment(f.order.id, f.b.id, shippingInput("PENDING")), { status: 403 });
    await refunds.confirmManualRefund(request.id, verifierId, body); const item = await db.orderItem.findFirstOrThrow({ where: { orderId: f.order.id } });
    await assert.rejects(refunds.receiveRefundReturn(request.id, verifierId, { requestId: randomUUID(), receivedAt: new Date(), receiptReference: "WAREHOUSE-RECEIPT", physicalReturnVerified: true, reason: "No stock permission", items: [{ orderItemId: item.id, quantity: 1 }] }), { status: 403 }); await invariant();
  });
  await t.test("partial physical receipts cap cumulative returns and mask financial evidence", async () => {
    const p = await product(2); const b = await buyer(p.variants[0].id);
    await db.cartItem.updateMany({ where: { cart: { userId: b.id } }, data: { quantity: 2 } });
    const order = await checkout.createOrder(b.id, await input(b.id)); await payments.submitConfirmation(b.id, order.id, { ...proof, amount: order.total });
    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }); await payments.approvePayment(payment.id, adminId);
    const request = await refunds.requestRefund(order.id, adminId, { requestId: randomUUID(), amount: order.total, reason: "Full refund for two items" }); await refunds.confirmManualRefund(request.id, verifierId, confirmation(order.total));
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const body = { requestId: randomUUID(), receivedAt: new Date(), receiptReference: "WAREHOUSE-PARTIAL", physicalReturnVerified: true, reason: "First physical item", items: [{ orderItemId: item.id, quantity: 1 }] };
    await refunds.receiveRefundReturn(request.id, warehouseId, body);
    const projection = await refunds.refundReturnEligibility(order.id, warehouseId); assert.equal(projection.items[0].returnableQuantity, 1); assert.equal("evidenceReference" in projection, false);
    await refunds.receiveRefundReturn(request.id, warehouseId, { ...body, requestId: randomUUID(), reason: "Second physical item" });
    await assert.rejects(refunds.receiveRefundReturn(request.id, warehouseId, { ...body, requestId: randomUUID() }), { status: 409 });
    assert.equal((await refunds.refundReturnEligibility(order.id, warehouseId)).items[0].returnableQuantity, 0); await invariant();
  });
  await t.test("nonmanual providers and partial financial refunds fail closed", async () => {
    const f = await paid(); await assert.rejects(refunds.requestRefund(f.order.id, adminId, { requestId: randomUUID(), amount: 1, reason: "Unsupported partial refund" }), { status: 422 });
    await db.payment.update({ where: { id: f.payment.id }, data: { provider: "midtrans" } });
    await assert.rejects(requested(f), { status: 409 }); assert.equal((await status(f.order.id)).paymentStatus, "PAID");
    assert.equal(await db.paymentEvent.count({ where: { paymentId: f.payment.id } }), 0); await invariant();
  });
  await t.test("read projections enforce separate financial and warehouse permissions", async () => {
    const f = await paid(); await assert.rejects(refunds.listRefundLedger(f.order.id, f.b.id), { status: 403 });
    await assert.rejects(refunds.refundReturnEligibility(f.order.id, verifierId), { status: 403 });
    assert.equal((await refunds.refundReturnEligibility(f.order.id, warehouseId)).eligible, false);
    const request = await requested(f); assert.equal((await refunds.listRefundLedger(f.order.id, verifierId)).events[0].id, request.id); await invariant();
  });
  await t.test("post-refund tracking preserves physical history and financial REFUNDED state", async () => {
    const f = await paid(); await pack(f.order.id); await shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("SHIPPED"));
    const request = await requested(f); await refunds.confirmManualRefund(request.id, verifierId, confirmation());
    await shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("IN_TRANSIT")); await shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("DELIVERED"));
    const state = await status(f.order.id); assert.equal(state.status, "REFUNDED"); assert.equal(state.payment!.status, "REFUNDED"); assert.equal(state.shipment!.status, "DELIVERED");
    await assert.rejects(shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("SHIPPED")), { status: 409 }); await invariant();
  });
  await t.test("paid shipment progresses atomically without extra stock deduction", async () => {
    const f = await paid(); await shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("PROCESSING")); await orders.transitionOrder(f.order.id, "PACKED", adminId);
    const body = shippingInput("SHIPPED"); await shipments.upsertManualShipment(f.order.id, warehouseId, body); await shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("IN_TRANSIT")); await shipments.upsertManualShipment(f.order.id, warehouseId, shippingInput("DELIVERED"));
    const replay = await shipments.upsertManualShipment(f.order.id, warehouseId, body); assert.equal(replay.status, "DELIVERED"); assert.equal((await status(f.order.id)).status, "DELIVERED");
    await orders.transitionOrder(f.order.id, "COMPLETED", adminId); assert.equal(await movements(f.p.variants[0].id, "SALE"), 1); await invariant();
  });
});
