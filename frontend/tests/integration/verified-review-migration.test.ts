import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { assertReviewSchema } from "../../src/modules/reviews/review-schema";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
const migration = "20261027090000_verified_purchase_reviews";
for (const blocked of [false, true])
  test(`official verified review upgrade preserves legacy and commerce; lock recovery=${blocked}`, async () => {
    const admin = new PrismaClient({
      datasources: { db: { url: target.toString() } },
    });
    const name = "review_" + randomUUID().replaceAll("-", "");
    const url = new URL(target);
    url.pathname = "/" + name;
    const db = new PrismaClient({
      datasources: { db: { url: url.toString() } },
    });
    const dir = await mkdtemp(path.join(tmpdir(), "review-migration-"));
    let created = false;
    const command = (args: string[] = ["deploy"]) =>
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
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created = true;
      await cp("prisma/schema.prisma", path.join(dir, "schema.prisma"));
      const names = (await readdir("prisma/migrations"))
        .filter((n) => /^\d{14}_/.test(n) && n < migration)
        .sort();
      for (const n of names)
        await cp(
          path.join("prisma/migrations", n),
          path.join(dir, "migrations", n),
          { recursive: true },
        );
      await cp(
        "prisma/migrations/migration_lock.toml",
        path.join(dir, "migrations/migration_lock.toml"),
      );
      let result = command();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      await db.$executeRaw`INSERT INTO "User"(id,name,email,"passwordHash","updatedAt") VALUES('review-user','Legacy buyer','legacy@example.test','isolated',NOW())`;
      await db.$executeRaw`INSERT INTO "Product"(id,name,slug,"basePrice","updatedAt") VALUES('review-product','Legacy product','review-product',100,NOW())`;
      await db.$executeRaw`INSERT INTO "ProductVariant"(id,"productId",sku) VALUES('review-sku','review-product','REVIEW-SKU')`;
      await db.$executeRaw`INSERT INTO "Review"(id,"userId","productId",rating,body) VALUES('old-review','review-user','review-product',5,'Keep historical review')`;
      await cp(
        path.join("prisma/migrations", migration),
        path.join(dir, "migrations", migration),
        { recursive: true },
      );
      if (blocked) {
        await db.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(
              'LOCK TABLE "Review" IN ACCESS EXCLUSIVE MODE',
            );
            result = command();
            assert.notEqual(result.status, 0);
          },
          { timeout: 15000 },
        );
        const cols = await db.$queryRaw<
          { n: bigint }[]
        >`SELECT count(*) AS n FROM information_schema.columns WHERE table_name='Review' AND column_name='orderItemId'`;
        assert.equal(Number(cols[0].n), 0);
        result = command(["resolve", "--rolled-back", migration]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
      result = command();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(command().status, 0);
      await assertReviewSchema(db);
      const old = await db.review.findUniqueOrThrow({
        where: { id: "old-review" },
      });
      assert.equal(old.orderItemId, null);
      assert.equal(old.body, "Keep historical review");
      assert.equal(old.status, "PUBLISHED");
      assert.equal(
        (
          await db.productVariant.findUniqueOrThrow({
            where: { id: "review-sku" },
          })
        ).sku,
        "REVIEW-SKU",
      );
      const o = await db.order.create({
        data: {
          orderNumber: randomUUID(),
          userId: "review-user",
          subtotal: 100,
          total: 100,
          items: {
            create: {
              variantId: "review-sku",
              productName: "Snapshot",
              variantLabel: "M",
              unitPrice: 100,
              quantity: 1,
              lineTotal: 100,
            },
          },
        },
        include: { items: true },
      });
      await db.review.create({
        data: {
          userId: "review-user",
          productId: "review-product",
          orderItemId: o.items[0].id,
          rating: 5,
          body: "Real item relation",
        },
      });
      await assert.rejects(
        db.review.create({
          data: {
            userId: "review-user",
            productId: "review-product",
            orderItemId: o.items[0].id,
            rating: 5,
            body: "Duplicate item",
          },
        }),
      );
      await assert.rejects(
        db.review.create({
          data: {
            userId: "review-user",
            productId: "review-product",
            orderItemId: "missing",
            rating: 5,
            body: "Missing relation",
          },
        }),
      );
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
    } finally {
      await db.$disconnect();
      if (created)
        await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.$disconnect();
      await rm(dir, { recursive: true, force: true });
    }
  });
