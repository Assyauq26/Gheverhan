/** Official Prisma CLI recovery drills on uniquely named local disposable databases. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const migration = "20261020070000_custom_product_variations";
type Fixture = {
  db: PrismaClient;
  command: (args: string[]) => ReturnType<typeof spawnSync>;
  add: () => Promise<void>;
};
async function disposable(count: number, run: (f: Fixture) => Promise<void>) {
  const admin = new PrismaClient({
    datasources: { db: { url: target.toString() } },
  });
  const name = "custom_variation_" + randomUUID().replaceAll("-", "");
  assert.match(name, /^custom_variation_[a-f0-9]+$/);
  const url = new URL(target);
  url.pathname = "/" + name;
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const directory = await mkdtemp(path.join(tmpdir(), "custom-variation-"));
  let created = false;
  const command = (args: string[]) =>
    spawnSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        ...args,
        "--schema",
        path.join(directory, "schema.prisma"),
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          DIRECT_URL: url.toString(),
        },
        encoding: "utf8" as const,
        timeout: 30000,
      },
    );
  const add = () =>
    cp(
      path.join("prisma/migrations", migration),
      path.join(directory, "migrations", migration),
      { recursive: true },
    );
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    await cp("prisma/schema.prisma", path.join(directory, "schema.prisma"));
    const names = (await readdir("prisma/migrations"))
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    assert.equal(names.length, 11);
    assert.equal(names[8], migration);
    for (const n of names.slice(0, count))
      await cp(
        path.join("prisma/migrations", n),
        path.join(directory, "migrations", n),
        { recursive: true },
      );
    await cp(
      "prisma/migrations/migration_lock.toml",
      path.join(directory, "migrations/migration_lock.toml"),
    );
    assert.equal(command(["deploy"]).status, 0);
    await run({ db, command, add });
  } finally {
    await db.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await admin.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
async function legacy(db: PrismaClient) {
  await db.$executeRaw`INSERT INTO "Product"(id,name,slug,"basePrice","updatedAt") VALUES('legacy-product','Dummy legacy','dummy-legacy',1000,NOW())`;
  await db.$executeRaw`INSERT INTO "ProductVariant"(id,"productId",sku,color,size) VALUES('legacy-red','legacy-product','LEGACY-RED','Merah','M'),('legacy-green','legacy-product','LEGACY-GREEN','Hijau','L')`;
  await db.inventory.createMany({
    data: [
      { variantId: "legacy-red", onHand: 7, reserved: 2 },
      { variantId: "legacy-green", onHand: 3, reserved: 0 },
    ],
  });
  const user = await db.user.create({
    data: { name: "Dummy", email: "dummy@example.test", passwordHash: "dummy" },
  });
  const cart = await db.cart.create({ data: { userId: user.id } });
  await db.cartItem.create({
    data: { cartId: cart.id, variantId: "legacy-red", quantity: 1 },
  });
  await db.order.create({
    data: {
      orderNumber: "DUMMY-HISTORICAL",
      userId: user.id,
      subtotal: 1000,
      total: 1000,
      items: {
        create: {
          variantId: "legacy-red",
          productName: "Snapshot nama lama",
          variantLabel: "Merah / M",
          imageUrl: "/dummy-historical.png",
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
        },
      },
    },
  });
  await db.inventoryMovement.create({
    data: {
      variantId: "legacy-red",
      type: "ADJUSTMENT",
      quantity: 7,
      note: "Dummy history",
    },
  });
  return snapshot(db);
}
const snapshot = (db: PrismaClient) => db.$queryRaw`SELECT json_build_object(
 'product',(SELECT json_build_object('id',id,'name',name,'slug',slug,'basePrice',"basePrice",'status',status,'updatedAt',"updatedAt") FROM "Product" WHERE id='legacy-product'),
 'variants',(SELECT json_agg(json_build_object('id',id,'sku',sku,'color',color,'size',size,'price',price,'salePrice',"salePrice") ORDER BY id) FROM "ProductVariant"),
 'inventory',(SELECT json_agg(row_to_json(i) ORDER BY i.id) FROM "Inventory" i),
 'cart',(SELECT json_agg(row_to_json(c) ORDER BY c.id) FROM "CartItem" c),
 'orders',(SELECT json_agg(row_to_json(o) ORDER BY o.id) FROM "OrderItem" o),
 'movements',(SELECT json_agg(row_to_json(m) ORDER BY m.id) FROM "InventoryMovement" m)) AS facts`;

test("custom variation migration preserves legacy data and supports bounded official recovery", async (t) => {
  await t.test(
    "fresh install records the exact checksum, RLS, partial index and deferred constraints",
    async () =>
      disposable(10, async ({ db, command }) => {
        assert.equal(command(["status"]).status, 0);
        assert.equal(command(["deploy"]).status, 0);
        const ledger = await db.$queryRaw<
          { checksum: string }[]
        >`SELECT checksum FROM _prisma_migrations WHERE migration_name=${migration} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
        assert.equal(
          ledger[0].checksum,
          createHash("sha256")
            .update(
              await readFile(
                path.join("prisma/migrations", migration, "migration.sql"),
              ),
            )
            .digest("hex"),
        );
        const facts = await db.$queryRaw<
          {
            rls: number;
            policies: number;
            triggers: number;
            imageIndex: boolean;
          }[]
        >`SELECT
   (SELECT count(*)::int FROM pg_class WHERE relname IN ('ProductOptionGroup','ProductOptionValue','ProductVariantOptionValue') AND relrowsecurity) AS rls,
   (SELECT count(*)::int FROM pg_policies WHERE tablename IN ('ProductOptionGroup','ProductOptionValue','ProductVariantOptionValue')) AS policies,
   (SELECT count(*)::int FROM pg_trigger WHERE tgname IN ('Product_options_integrity','ProductOptionGroup_integrity','ProductOptionValue_integrity','ProductVariant_options_integrity','ProductVariantOptionValue_integrity') AND tgdeferrable AND tginitdeferred) AS triggers,
   EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='ProductOptionGroup_one_image_group' AND i.indisvalid AND i.indisunique AND i.indpred IS NOT NULL) AS "imageIndex"`;
        assert.deepEqual(facts, [
          { rls: 3, policies: 0, triggers: 5, imageIndex: true },
        ]);
      }),
  );
  await t.test(
    "upgrade and repeated backfill preserve variant IDs, raw fields, inventory, reservations, cart and order snapshots",
    async () =>
      disposable(8, async ({ db, command, add }) => {
        const before = await legacy(db);
        await add();
        assert.equal(command(["deploy"]).status, 0);
        for (let n = 0; n < 2; n++)
          await db.$queryRaw`SELECT gheverhan_backfill_legacy_options()::text`;
        assert.deepEqual(await snapshot(db), before);
        assert.equal(await db.productOptionGroup.count(), 2);
        assert.equal(await db.productOptionValue.count(), 4);
        assert.equal(await db.productVariantOptionValue.count(), 4);
        assert.equal(
          (
            await db.product.findUniqueOrThrow({
              where: { id: "legacy-product" },
              select: { optionsEnabled: true },
            })
          ).optionsEnabled,
          false,
        );
        assert.equal(command(["deploy"]).status, 0);
      }),
  );
  await t.test(
    "lock timeout rolls back and resolves/retries only after the local blocker is released",
    async () =>
      disposable(8, async ({ db, command, add }) => {
        const before = await legacy(db);
        await add();
        let release!: () => void, ready!: () => void;
        const hold = new Promise<void>((r) => (release = r)),
          locked = new Promise<void>((r) => (ready = r));
        const holder = db.$transaction(
          async (tx) => {
            await tx.$executeRaw`LOCK TABLE "Product" IN ROW EXCLUSIVE MODE`;
            ready();
            await hold;
          },
          { timeout: 20000 },
        );
        let failed!: ReturnType<typeof command>;
        const start = Date.now();
        try {
          await locked;
          failed = command(["deploy"]);
        } finally {
          release();
          await holder;
        }
        assert.equal(failed.status, 1);
        assert.match(
          String(failed.stdout) + String(failed.stderr),
          /lock timeout|transaction is aborted/,
        );
        assert.ok(Date.now() - start < 20000);
        const state = await db.$queryRaw<
          { absent: boolean }[]
        >`SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='Product' AND column_name='optionsEnabled') AND to_regclass('"ProductOptionGroup"') IS NULL AS absent`;
        assert.equal(state[0].absent, true);
        assert.deepEqual(await snapshot(db), before);
        assert.equal(
          command(["resolve", "--rolled-back", migration]).status,
          0,
        );
        assert.equal(command(["deploy"]).status, 0);
        assert.deepEqual(await snapshot(db), before);
      }),
  );
  await t.test(
    "a later DDL failure rolls back earlier ALTERs and can be recovered without false ledger completion",
    async () =>
      disposable(8, async ({ db, command, add }) => {
        const before = await legacy(db);
        await db.$executeRaw`CREATE TABLE "ProductOptionValue"(sentinel text)`;
        await db.$executeRaw`INSERT INTO "ProductOptionValue" VALUES('dummy-fixture-only')`;
        await add();
        assert.equal(command(["deploy"]).status, 1);
        const state = await db.$queryRaw<
          { absent: boolean }[]
        >`SELECT to_regclass('"ProductOptionGroup"') IS NULL AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ProductVariant' AND column_name='combinationKey') AS absent`;
        assert.equal(state[0].absent, true);
        assert.deepEqual(await snapshot(db), before);
        // Remove only the intentionally created conflict in this uniquely named disposable DB.
        await db.$executeRaw`DROP TABLE "ProductOptionValue"`;
        assert.equal(
          command(["resolve", "--rolled-back", migration]).status,
          0,
        );
        assert.equal(command(["deploy"]).status, 0);
        assert.deepEqual(await snapshot(db), before);
      }),
  );
});
