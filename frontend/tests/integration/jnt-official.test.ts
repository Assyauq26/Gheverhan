import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, cp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { PrismaClient, Prisma } from "@prisma/client";
import { PERMISSIONS } from "../../src/lib/auth/permissions";

const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
process.env.DATABASE_URL = target.toString(); process.env.DIRECT_URL = target.toString();
process.env.JNT_API_ENV = "sandbox";
process.env.JNT_INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.JNT_ENABLE_ORDER_CREATE = "yes"; process.env.JNT_ENABLE_CANCELLATION = "yes";
Object.assign(process.env, { JNT_SENDER_NAME: "Synthetic warehouse", JNT_SENDER_CONTACT: "Fixture",
  JNT_SENDER_PHONE: "+6281234567890", JNT_SENDER_ADDRESS: "Synthetic test address", JNT_ORIGIN_CITY_CODE: "JKT" });
const prefix = randomUUID();
let db: PrismaClient, actor: string, buyer: string, variant: string, districtCode: string;
let settings: typeof import("../../src/infrastructure/shipping/jnt/official-config");
let fulfillment: typeof import("../../src/modules/shipping/jnt-fulfillment.service");
let refunds: typeof import("../../src/modules/payments/refund.service");
const originalFetch = globalThis.fetch;
const endpoints = {
  order: "https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/create",
  cancellation: "https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/cancel",
  tariff: "https://demo-general.inuat-jntexpress.id/jandt_track/inquiry.action",
  tracking: "https://demo-general.inuat-jntexpress.id/jandt_track/track/trackAction!tracking.action",
};
const credentials = { orderUsername: "SYNTHETIC", orderApiKey: "SYNTHETIC-API", orderKey: "SYNTHETIC-SIGN",
  tariffCustomer: "SYNTHETIC", tariffKey: "SYNTHETIC-TARIFF", trackingUsername: "SYNTHETIC", trackingPassword: "SYNTHETIC-PASSWORD" };
const input = () => ({ pickupStart: new Date(Date.now() + 3600000).toISOString(), pickupEnd: new Date(Date.now() + 7200000).toISOString() });
before(async () => {
  db = (await import("../../src/lib/prisma")).prisma;
  settings = await import("../../src/infrastructure/shipping/jnt/official-config");
  fulfillment = await import("../../src/modules/shipping/jnt-fulfillment.service");
  refunds = await import("../../src/modules/payments/refund.service");
  const role = await db.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Admin" }, update: {} });
  for (const key of Object.values(PERMISSIONS)) {
    const p = await db.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
  }
  actor = (await db.user.create({ data: { name: "Jnt test staff", email: `jnt-staff-${prefix}@example.test`, passwordHash: "fixture-not-login", roles: { create: { roleId: role.id } } } })).id;
  buyer = (await db.user.create({ data: { name: "Jnt test buyer", email: `jnt-buyer-${prefix}@example.test`, passwordHash: "fixture-not-login" } })).id;
  const product = await db.product.create({ data: { name: "Jnt fixture", slug: "jnt-" + prefix, basePrice: 50000, variants: { create: { sku: "JNT-" + prefix } } }, include: { variants: true } });
  variant = product.variants[0].id;
  // This guarded disposable database may be reused with a fresh synthetic encryption key.
  await db.jntPlatformIntegration.deleteMany({ where: { environment: "sandbox" } });
  await settings.saveJntSettings({ environment: "sandbox", enabled: true, endpoints, credentials }, actor);
  const release = await db.jntMappingRelease.findUniqueOrThrow({ where: { key: "primary" } });
  districtCode = (await db.jntL3Mapping.findFirstOrThrow({ where: { version: release.activeVersion, matchStatus: "EXACT", approvedAt: { not: null }, emsifaDistrictCode: { not: null } }, orderBy: { sourceRow: "asc" } })).emsifaDistrictCode!;
});
after(async () => { globalThis.fetch = originalFetch; await db?.$disconnect(); });
async function order() {
  return db.order.create({ data: {
    userId: buyer, orderNumber: "JNT-" + randomUUID(), status: "PACKED", paymentStatus: "PAID",
    subtotal: 50000, shippingCost: 10000, total: 60000, shippingCourier: "J&T Express", shippingMode: "official", shippingService: "EZ", shippingWeightGram: 250,
    payment: { create: { amount: 60000, status: "PAID" } },
    address: { create: { recipientName: "Synthetic recipient", phone: "+6281234567891", line: "Synthetic receiver street", city: "Synthetic city", province: "Synthetic province", postalCode: "10110", provinceCode: districtCode.slice(0,2), cityCode: districtCode.slice(0,5), districtCode, villageCode: districtCode + ".1001", village: "Synthetic village", district: "Synthetic district" } },
    items: { create: { variantId: variant, productName: "PAKAIAN", variantLabel: "M", unitPrice: 50000, quantity: 1, lineTotal: 50000 } },
  } });
}
function carrier(reply?: (orderid: string) => unknown) {
  let calls = 0;
  globalThis.fetch = (async (_url: unknown, options: RequestInit) => {
    calls++;
    const payload = JSON.parse(new URLSearchParams(options.body as URLSearchParams).get("data_param")!);
    const orderid = payload.detail[0].orderid;
    return new Response(JSON.stringify(reply ? reply(orderid) : { success: true, detail: [{ orderid, status: "Sukses", awb_no: "JO1234567890" }] }));
  }) as typeof fetch;
  return () => calls;
}
test("official upgrade from existing V5 via Prisma preserves legacy data", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "gheverhan-jnt-upgrade-"));
  const old = target.toString(); const url = new URL(old); url.searchParams.set("schema", "jnt_upgrade_" + prefix.replaceAll("-", ""));
  await cp("prisma/schema.prisma", path.join(temp, "schema.prisma"));
  const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  const additions = migrations.filter(n => /jnt_l3_and_awb|jnt_platform/.test(n));
  assert.equal(additions.length, 2);
  for (const name of migrations.filter(n => !additions.includes(n))) await cp(path.join("prisma/migrations", name), path.join(temp, "migrations", name), { recursive: true });
  await cp("prisma/migrations/migration_lock.toml", path.join(temp, "migrations/migration_lock.toml"));
  const deploy = () => {
    const r = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", path.join(temp, "schema.prisma")], { encoding: "utf8", timeout: 60000, env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() } });
    assert.equal(r.status, 0, r.stderr + r.stdout);
  };
  deploy();
  const { PrismaClient } = await import("@prisma/client"); const upgrade = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const saved = await upgrade.user.create({ data: { name: "Legacy upgrade fixture", email: prefix + "@upgrade.example.test", passwordHash: "synthetic" } });
    for (const name of additions) await cp(path.join("prisma/migrations", name), path.join(temp, "migrations", name), { recursive: true });
    deploy(); deploy();
    assert.deepEqual(await upgrade.user.findUnique({ where: { id: saved.id } }), saved);
    assert.equal(await upgrade.jntPlatformIntegration.count(), 0);
    assert.equal(await upgrade.jntShipmentRequest.count(), 0);
    const rows = await upgrade.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(Number(rows[0].count), migrations.length);
  } finally { await upgrade.$disconnect(); }
});
test("official mapping is unique, activated by exact version, and unresolved districts reject", async () => {
  const { getVerifiedJntDistrict } = await import("../../src/infrastructure/shipping/jnt/verified-mapping");
  const mapping = await getVerifiedJntDistrict(districtCode);
  assert.match(mapping.destinationCityCode, /^[A-Z0-9]{3}$/); assert.match(mapping.receiverArea, /^[A-Z0-9]{3,10}$/);
  await assert.rejects(getVerifiedJntDistrict("99.99.99"), { status: 422 });
  const csv = (await readFile("resources/jnt-l3-official.csv", "utf8")).replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  assert.equal(mapping.version, createHash("sha256").update(csv).digest("hex"));
});
test("settings audit failure rolls back encrypted update in real PostgreSQL", async () => {
  const before = await db.jntPlatformIntegration.findUniqueOrThrow({ where: { environment: "sandbox" } });
  const audit = await db.auditLog.create({ data: { action: "jnt.test", entity: "Fixture" } });
  const original = db.$transaction.bind(db);
  db.$transaction = ((fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(tx => fn(new Proxy(tx, { get(t, key) {
    if (key !== "auditLog") return Reflect.get(t, key);
    return { create: (args: Prisma.AuditLogCreateArgs) => t.auditLog.create({ ...args, data: { ...args.data, id: audit.id } }) };
  } })))) as typeof db.$transaction;
  try { await assert.rejects(settings.saveJntSettings({ environment: "sandbox", enabled: false, endpoints, credentials: {} }, actor), { code: "P2002" }); }
  finally { db.$transaction = original; }
  assert.deepEqual(await db.jntPlatformIntegration.findUnique({ where: { environment: "sandbox" } }), before);
});
test("mapping activation rejects tampering even when version and row counts match", async () => {
  const release = await db.jntMappingRelease.findUniqueOrThrow({ where: { key: "primary" } });
  const row = await db.jntL3Mapping.findFirstOrThrow({ where: { version: release.activeVersion, matchStatus: "EXACT" } });
  await db.jntL3Mapping.update({ where: { id: row.id }, data: { jntDistrict: "TAMPERED TEST FIXTURE" } });
  try {
    const r = spawnSync(process.execPath, ["scripts/jnt/reconcile-l3.mjs", "--activate"], { encoding: "utf8", timeout: 30000,
      env: { ...process.env, JNT_MAPPING_IMPORT_APPROVED: "yes", JNT_MAPPING_APPROVED_VERSION: release.activeVersion, JNT_MAPPING_REVIEWER: "isolated-test" } });
    assert.equal(r.status, 1); assert.match(r.stderr, /differs from the reviewed official source/);
    assert.deepEqual(await db.jntMappingRelease.findUnique({ where: { key: "primary" } }), release);
  } finally { await db.jntL3Mapping.update({ where: { id: row.id }, data: { jntDistrict: row.jntDistrict } }); }
});
test("concurrent blank settings updates preserve a credential rotation", async () => {
  await Promise.all([
    settings.saveJntSettings({ environment: "sandbox", enabled: true, endpoints, credentials: { orderKey: "SYNTHETIC-ROTATED" } }, actor),
    settings.saveJntSettings({ environment: "sandbox", enabled: true, endpoints, credentials: {} }, actor),
  ]);
  assert.equal((await settings.readJntSettings("sandbox"))?.config.credentials.orderKey, "SYNTHETIC-ROTATED");
});
test("unpaid, HBO, missing weight and unauthorized tracking never call carrier", async () => {
  const calls = carrier();
  for (const changes of [{ paymentStatus: "PENDING_PAYMENT" as const }, { shippingService: "HBO" }, { shippingWeightGram: 0 }]) {
    const f = await order(); await db.order.update({ where: { id: f.id }, data: changes });
    await assert.rejects(fulfillment.createJntAwb(f.id, actor, input()));
    assert.equal(await db.jntShipmentRequest.count({ where: { orderId: f.id } }), 0);
  }
  await assert.rejects(fulfillment.getJntTracking((await order()).id, buyer), { status: 403 });
  assert.equal(calls(), 0);
});
test("concurrent create/replay dispatches once and handover is explicit", async () => {
  const f = await order(), calls = carrier();
  const result = await Promise.allSettled([fulfillment.createJntAwb(f.id, actor, input()), fulfillment.createJntAwb(f.id, actor, input())]);
  assert.ok(result.some(r => r.status === "fulfilled")); assert.equal(calls(), 1);
  assert.equal((await fulfillment.createJntAwb(f.id, actor, input())).replayed, true); assert.equal(calls(), 1);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.id } })).status, "PACKED");
  assert.equal((await db.shipment.findUniqueOrThrow({ where: { orderId: f.id } })).status, "PENDING");
  await fulfillment.handoverJntPackage(f.id, actor); assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.id } })).status, "SHIPPED");
  await assert.rejects(fulfillment.cancelJntAwb(f.id, actor), { status: 409 }); assert.equal(calls(), 1);
});
test("ambiguous timeout is durable UNKNOWN and never retries", async () => {
  const f = await order(); let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("Synthetic timeout with secret-like text"); }) as typeof fetch;
  await assert.rejects(fulfillment.createJntAwb(f.id, actor, input()), { status: 409 });
  await assert.rejects(fulfillment.createJntAwb(f.id, actor, input()), { status: 409 });
  assert.equal(calls, 1); assert.equal((await db.jntShipmentRequest.findUniqueOrThrow({ where: { orderId: f.id } })).state, "UNKNOWN");
  assert.equal(await db.shipment.count({ where: { orderId: f.id } }), 0);
});
test("refund cannot race in-flight or uncertain external dispatch", async () => {
  const f = await order(); let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(r => { entered = r; }); const gate = new Promise<void>(r => { release = r; });
  globalThis.fetch = (async () => { entered(); await gate; throw new Error("Synthetic unknown result"); }) as typeof fetch;
  const create = fulfillment.createJntAwb(f.id, actor, input());
  const rejected = assert.rejects(create, { status: 409 });
  await ready;
  try { await assert.rejects(refunds.requestRefund(f.id, actor, { requestId: randomUUID(), amount: f.total, reason: "Synthetic refund" }), { status: 409 }); }
  finally { release(); }
  await rejected;
  await assert.rejects(refunds.requestRefund(f.id, actor, { requestId: randomUUID(), amount: f.total, reason: "Synthetic refund" }), { status: 409 });
});
test("cancellation confirms per-detail ID, is idempotent and never refunds", async () => {
  const f = await order(); const calls = carrier(); await fulfillment.createJntAwb(f.id, actor, input());
  await fulfillment.cancelJntAwb(f.id, actor); await fulfillment.cancelJntAwb(f.id, actor);
  assert.equal(calls(), 2); assert.equal((await db.payment.findUniqueOrThrow({ where: { orderId: f.id } })).status, "PAID");
  assert.equal((await db.jntShipmentRequest.findUniqueOrThrow({ where: { orderId: f.id } })).state, "CANCELLED");
  await assert.rejects(fulfillment.handoverJntPackage(f.id, actor), { status: 409 });
});
