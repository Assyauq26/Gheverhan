import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
const migration = "20261030090000_checkout_indonesia_regions_jnt";
for (const blocked of [false, true]) test(`V5 official additive address upgrade preserves legacy snapshots; bounded lock recovery=${blocked}`, async () => {
  const admin = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  const name = "v5_" + randomUUID().replaceAll("-", ""), url = new URL(target); url.pathname = "/" + name;
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const dir = await mkdtemp(path.join(tmpdir(), "v5-address-migration-"));
  let created = false;
  const command = (args: string[] = ["deploy"]) => spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", ...args, "--schema", path.join(dir, "schema.prisma")], { env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() }, encoding: "utf8", timeout: 40000 });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    await cp("prisma/schema.prisma", path.join(dir, "schema.prisma"));
    await cp("prisma/migrations/migration_lock.toml", path.join(dir, "migrations/migration_lock.toml"), { recursive: true });
    for (const m of (await readdir("prisma/migrations")).filter(m => /^\d{14}_/.test(m) && m < migration).sort()) await cp(path.join("prisma/migrations", m), path.join(dir, "migrations", m), { recursive: true });
    let result = command(); assert.equal(result.status, 0, result.stdout + result.stderr);
    const user = await db.user.create({ data: { name: "Legacy", email: "legacy@example.test", passwordHash: "test-only" } });
    const customer = await db.customer.create({ data: { userId: user.id, fullName: "Legacy" } });
    await db.$executeRaw`INSERT INTO "CustomerAddress" (id,"customerId","recipientName",phone,line,city,province,"postalCode") VALUES ('legacy-address',${customer.id},'Legacy','0800000000','Old immutable street','Old city','Old province','00000')`;
    await db.$executeRaw`INSERT INTO "Order" (id,"orderNumber","userId",subtotal,total,"updatedAt") VALUES ('legacy-order','LEGACY-V5',${user.id},100000,100000,NOW())`;
    await db.$executeRaw`INSERT INTO "OrderAddress" (id,"orderId","recipientName",phone,line,city,province,"postalCode") VALUES ('legacy-order-address','legacy-order','Legacy','0800000000','Historical street','Historical city','Historical province','00000')`;
    await cp(path.join("prisma/migrations", migration), path.join(dir, "migrations", migration), { recursive: true });
    if (blocked) {
      let enter!: () => void, release!: () => void;
      const ready = new Promise<void>(r => { enter = r; }), gate = new Promise<void>(r => { release = r; });
      const holder = db.$transaction(async tx => { await tx.$executeRaw`LOCK TABLE "CustomerAddress" IN ACCESS EXCLUSIVE MODE`; enter(); await gate; }, { timeout: 20000 });
      await ready;
      try { result = command(); assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /lock timeout/i); }
      finally { release(); await holder; }
      result = command(["resolve", "--rolled-back", migration]); assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    result = command(); assert.equal(result.status, 0, result.stdout + result.stderr);
    const address = await db.customerAddress.findUniqueOrThrow({ where: { id: "legacy-address" } });
    assert.equal(address.line, "Old immutable street"); assert.equal(address.city, "Old city"); assert.equal(address.villageCode, null);
    const historical = await db.orderAddress.findUniqueOrThrow({ where: { id: "legacy-order-address" } });
    assert.equal(historical.city, "Historical city"); assert.equal(historical.villageCode, null);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: "legacy-order" } })).shippingCourier, null);
    result = command(); assert.equal(result.status, 0, "Official deploy is repeatable");
  } finally {
    await db.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect(); await rm(dir, { recursive: true, force: true });
  }
});
