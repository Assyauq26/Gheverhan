import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
const migration = "20261029090000_flash_sale_campaign";
for (const blocked of [false, true])
  test(`official campaign upgrade archives conflicting legacy without activation; lock recovery=${blocked}`, async () => {
    const admin = new PrismaClient({
      datasources: { db: { url: target.toString() } },
    });
    const name = "flash_" + randomUUID().replaceAll("-", "");
    const url = new URL(target);
    url.pathname = "/" + name;
    const db = new PrismaClient({
      datasources: { db: { url: url.toString() } },
    });
    const dir = await mkdtemp(path.join(tmpdir(), "flash-migration-"));
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
          timeout: 40000,
        },
      );
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created = true;
      await cp("prisma/schema.prisma", path.join(dir, "schema.prisma"));
      for (const n of (await readdir("prisma/migrations"))
        .filter((n) => /^\d{14}_/.test(n) && n < migration)
        .sort())
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
      await db.$executeRaw`INSERT INTO "Product"(id,name,slug,"basePrice","salePrice","isFlashSale","updatedAt") VALUES('manual','Legacy manual','legacy-manual',100000,80000,true,NOW())`;
      await db.$executeRaw`INSERT INTO "Product"(id,name,slug,"basePrice","flashSalePrice","flashSaleStartsAt","flashSaleEndsAt","updatedAt") VALUES('window-a','Legacy A','legacy-a',100000,70000,'2030-01-01T00:00:00','2030-01-01T12:00:00',NOW()),('window-b','Legacy B','legacy-b',100000,60000,'2030-01-01T06:00:00','2030-01-01T18:00:00',NOW())`;
      await db.$executeRaw`INSERT INTO "Product"(id,name,slug,"basePrice","updatedAt") VALUES('ordinary','Ordinary','ordinary',200000,NOW())`;
      const before = await db.product.findMany({ orderBy: { id: "asc" } });
      await cp(
        path.join("prisma/migrations", migration),
        path.join(dir, "migrations", migration),
        { recursive: true },
      );
      if (blocked) {
        await db.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(
              'LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE',
            );
            result = command();
            assert.notEqual(result.status, 0);
          },
          { timeout: 15000 },
        );
        const [row] = await db.$queryRaw<
          { n: bigint }[]
        >`SELECT count(*) AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('FlashSaleCampaign','FlashSaleCampaignItem','FlashSaleControl','FlashSaleLegacy')`;
        assert.equal(
          Number(row.n),
          0,
          "transactional DDL/archive must entirely roll back on lock timeout",
        );
        result = command(["resolve", "--rolled-back", migration]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
      result = command();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(command().status, 0);
      assert.deepEqual(
        await db.product.findMany({ orderBy: { id: "asc" } }),
        before,
        "no legacy/master fields may be rewritten by schema migration",
      );
      const archived = await db.flashSaleLegacy.findMany({
        orderBy: { productId: "asc" },
      });
      assert.equal(archived.length, 3);
      assert.equal(
        (
          archived.find((r) => r.productId === "manual")!.snapshot as {
            salePrice: number;
          }
        ).salePrice,
        80000,
      );
      assert.notDeepEqual(
        archived.find((r) => r.productId === "window-a")!.snapshot,
        archived.find((r) => r.productId === "window-b")!.snapshot,
      );
      assert.equal(
        await db.flashSaleCampaign.count(),
        0,
        "conflicting/different legacy periods must never be coalesced or auto-activated",
      );
      const [rls] = await db.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('FlashSaleCampaign','FlashSaleCampaignItem','FlashSaleControl','FlashSaleLegacy') AND relrowsecurity`;
      assert.equal(Number(rls.n), 4);
      assert.ok(
        await db.flashSaleControl.findUnique({ where: { key: "primary" } }),
      );
      const [ledger] = await db.$queryRaw<
        { checksum: string }[]
      >`SELECT checksum FROM _prisma_migrations WHERE migration_name=${migration} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      assert.equal(
        ledger.checksum,
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
