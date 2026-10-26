import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, mkdir, cp, readdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const migration = "20261024150000_storefront_customize";
test("appearance additive upgrade, bounded lock failure, official retry and role grants", async () => {
  const admin = new PrismaClient({
      datasources: { db: { url: target.toString() } },
    }),
    name = "appearance_" + randomUUID().replaceAll("-", "");
  const url = new URL(target);
  url.pathname = "/" + name;
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } }),
    dir = await mkdtemp(path.join(tmpdir(), "appearance-migration-"));
  const command = (args = ["deploy"]) =>
    spawnSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        ...args,
        "--schema",
        path.join(dir, "schema.prisma"),
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          DIRECT_URL: url.toString(),
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    await mkdir(path.join(dir, "migrations"));
    await cp("prisma/schema.prisma", path.join(dir, "schema.prisma"));
    await cp(
      "prisma/migrations/migration_lock.toml",
      path.join(dir, "migrations/migration_lock.toml"),
      { recursive: true },
    );
    const names = (await readdir("prisma/migrations"))
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    assert.ok(names.length >= 13, 'Expected original 13 migrations plus any additive migrations');
    assert.equal(names[12], migration);
    for (const n of names.slice(0, -1))
      await cp(
        path.join("prisma/migrations", n),
        path.join(dir, "migrations", n),
        { recursive: true },
      );
    let result = command();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await db.$executeRaw`INSERT INTO "Product"(id,name,slug,"basePrice","updatedAt") VALUES('theme-legacy','Legacy','theme-legacy',123456,NOW())`;
    await db.$executeRaw`INSERT INTO "ProductVariant"(id,"productId",sku) VALUES('theme-legacy-sku','theme-legacy','PRESERVE-THEME-SKU')`;
    await db.$executeRaw`INSERT INTO "Role"(id,name,label) VALUES('theme-admin','Admin','Admin'),('theme-customer','Customer','Customer')`;
    await cp(
      path.join("prisma/migrations", migration),
      path.join(dir, "migrations", migration),
      { recursive: true },
    );
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      locked = new Promise<void>((r) => (ready = r));
    const holder = db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'LOCK TABLE "Permission" IN ACCESS EXCLUSIVE MODE',
        );
        ready();
        await gate;
      },
      { timeout: 15000 },
    );
    await locked;
    const start = Date.now();
    result = command();
    release();
    await holder;
    assert.notEqual(result.status, 0);
    assert.ok(Date.now() - start >= 2800 && Date.now() - start < 12000);
    assert.match(
      result.stdout + result.stderr,
      /lock timeout|current transaction is aborted/i,
    );
    const tables = await db.$queryRaw<
      { n: number }[]
    >`SELECT COUNT(*)::int AS n FROM pg_class WHERE relname='StoreAppearance'`;
    assert.equal(tables[0].n, 0);
    assert.equal(command(["resolve", "--rolled-back", migration]).status, 0);
    result = command();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(command().status, 0);
    const product = await db.product.findUniqueOrThrow({
      where: { id: "theme-legacy" },
      include: { variants: true },
    });
    assert.equal(product.basePrice, 123456);
    assert.equal(product.variants[0].sku, "PRESERVE-THEME-SKU");
    const grants = await db.rolePermission.findMany({
      include: { role: true, permission: true },
    });
    assert.equal(
      grants.filter(
        (g) =>
          g.role.name === "Admin" &&
          g.permission.key.startsWith("store.customize."),
      ).length,
      3,
    );
    assert.equal(grants.filter((g) => g.role.name === "Customer").length, 0);
    const rows = await db.$queryRaw<
      { checksum: string }[]
    >`SELECT checksum FROM _prisma_migrations WHERE migration_name=${migration} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(
      rows[0].checksum,
      createHash("sha256")
        .update(
          await readFile(
            path.join("prisma/migrations", migration, "migration.sql"),
          ),
        )
        .digest("hex"),
    );
    await assert.rejects(
      db.storeAppearance.create({
        data: { key: "other", draft: {}, published: {} },
      }),
    );
    await assert.rejects(
      db.storeAppearance.create({
        data: {
          key: "primary",
          draft: { large: "x".repeat(40001) },
          published: {},
        },
      }),
    );
  } finally {
    await db.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
});
