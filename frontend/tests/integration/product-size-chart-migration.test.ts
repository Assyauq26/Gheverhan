import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
const target = new URL(process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const migration = "20261024140000_product_size_chart";
test("size chart additive migration upgrades legacy product, preserves SKU and retries safely", async () => {
  const admin = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  const name = "size_chart_" + randomUUID().replaceAll("-", "");
  const url = new URL(target); url.pathname = "/" + name;
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const directory = await mkdtemp(path.join(tmpdir(), "size-chart-migration-"));
  const command = () => spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", path.join(directory, "schema.prisma")], { env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() }, encoding: "utf8", timeout: 30000 });
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    await cp("prisma/schema.prisma", path.join(directory, "schema.prisma"));
    const names = (await readdir("prisma/migrations")).filter(n => /^\d{14}_/.test(n)).sort();
    assert.equal(names.at(-1), migration);
    for (const n of names.slice(0, -1)) await cp(path.join("prisma/migrations", n), path.join(directory, "migrations", n), { recursive: true });
    await cp("prisma/migrations/migration_lock.toml", path.join(directory, "migrations/migration_lock.toml"));
    let result = command(); assert.equal(result.status, 0, result.stdout + result.stderr);
    await db.$executeRaw`INSERT INTO "Product"(id,name,slug,"basePrice","updatedAt","careInstruction") VALUES('legacy-chart','Legacy chart','legacy-chart',100,NOW(),'Preserve care')`;
    await db.$executeRaw`INSERT INTO "ProductVariant"(id,"productId",sku) VALUES('legacy-chart-sku','legacy-chart','LEGACY-CHART')`;
    await cp(path.join("prisma/migrations", migration), path.join(directory, "migrations", migration), { recursive: true });
    result = command(); assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(command().status, 0);
    const product = await db.product.findUniqueOrThrow({ where: { id: "legacy-chart" }, include: { variants: true } });
    assert.equal(product.sizeChart, null); assert.equal(product.careInstruction, "Preserve care"); assert.equal(product.basePrice, 100);
    assert.equal(product.variants[0].id, "legacy-chart-sku"); assert.equal(product.variants[0].sku, "LEGACY-CHART");
    const checksum = await db.$queryRaw<{ checksum: string }[]>`SELECT checksum FROM _prisma_migrations WHERE migration_name=${migration} AND finished_at IS NOT NULL`;
    assert.equal(checksum[0].checksum, createHash("sha256").update(await readFile(path.join("prisma/migrations", migration, "migration.sql"))).digest("hex"));
    await assert.rejects(db.product.update({ where: { id: product.id }, data: { sizeChart: { oversized: "x".repeat(100001) } } }));
  } finally {
    await db.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect(); await rm(directory, { recursive: true, force: true });
  }
});
