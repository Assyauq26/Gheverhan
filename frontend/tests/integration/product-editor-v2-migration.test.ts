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
const migration = "20261021093000_product_editor_staged_media_shipping";
type Fixture = {
  db: PrismaClient;
  command: (args: string[]) => ReturnType<typeof spawnSync>;
  add: () => Promise<void>;
};
async function disposable(count: number, run: (f: Fixture) => Promise<void>) {
  const admin = new PrismaClient({
    datasources: { db: { url: target.toString() } },
  });
  const name = "direct_checkout_" + randomUUID().replaceAll("-", "");
  assert.match(name, /^direct_checkout_[a-f0-9]+$/);
  const url = new URL(target);
  url.pathname = "/" + name;
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const directory = await mkdtemp(path.join(tmpdir(), "editor-v2-"));
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
    assert.equal(names.length, 12);
    assert.equal(names[10], migration);
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
test("editor V2 migration fresh/upgrade/retry and lock rollback", async (t) => {
  await t.test(
    "fresh install has nullable legacy fields, constraints, RLS and checksum",
    async () =>
      disposable(11, async ({ db, command }) => {
        assert.equal(command(["status"]).status, 0);
        const p = await db.product.create({
          select: { id: true, weightGrams: true, packageLengthMm: true },
          data: {
            name: "Legacy nullable",
            slug: "legacy-nullable",
            basePrice: 100,
          },
        });
        assert.equal(p.weightGrams, null);
        assert.equal(p.packageLengthMm, null);
        await assert.rejects(
          db.product.update({
            where: { id: p.id },
            data: { packageLengthMm: 12 },
          }),
        );
        const facts = await db.$queryRaw<
          { rls: boolean; policies: bigint }[]
        >`SELECT bool_and(relrowsecurity) AS rls,(SELECT count(*) FROM pg_policies WHERE tablename IN ('StagedProductMedia','ProductEditorSave')) AS policies FROM pg_class WHERE oid IN ('"StagedProductMedia"'::regclass,'"ProductEditorSave"'::regclass)`;
        assert.equal(facts[0].rls, true);
        assert.equal(Number(facts[0].policies), 0);
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
      }),
  );
  await t.test(
    "upgrade/retry preserve old product and policy without fake default weight",
    async () =>
      disposable(10, async ({ db, command, add }) => {
        await db.$executeRaw`INSERT INTO "Product" (id,name,slug,"basePrice","updatedAt","shippingReturn") VALUES ('legacy-v2','Legacy','legacy-v2',100,NOW(),'Existing policy')`;
        await add();
        assert.equal(command(["deploy"]).status, 0);
        assert.equal(command(["deploy"]).status, 0);
        const p = await db.product.findUniqueOrThrow({
          where: { id: "legacy-v2" },
          select: { shippingReturn: true, weightGrams: true, packageWidthMm: true },
        });
        assert.equal(p.shippingReturn, "Existing policy");
        assert.equal(p.weightGrams, null);
        assert.equal(p.packageWidthMm, null);
      }),
  );
  await t.test(
    "lock timeout rolls back DDL; verified official resolve then retry",
    async () =>
      disposable(10, async ({ db, command, add }) => {
        await add();
        let entered!: () => void, release!: () => void;
        const ready = new Promise<void>((r) => (entered = r)),
          gate = new Promise<void>((r) => (release = r));
        const blocker = db.$transaction(
          async (tx) => {
            await tx.$executeRaw`LOCK TABLE "Product" IN ROW EXCLUSIVE MODE`;
            entered();
            await gate;
          },
          { timeout: 20000 },
        );
        let result!: ReturnType<typeof command>;
        try {
          await ready;
          result = command(["deploy"]);
        } finally {
          release();
          await blocker;
        }
        assert.equal(result.status, 1);
        assert.match(
          String(result.stdout) + String(result.stderr),
          /lock timeout|transaction is aborted/,
        );
        const facts = await db.$queryRaw<
          { absent: boolean; columns: bigint }[]
        >`SELECT to_regclass('public."StagedProductMedia"') IS NULL AS absent,(SELECT count(*) FROM information_schema.columns WHERE table_name='Product' AND column_name='weightGrams') AS columns`;
        assert.equal(facts[0].absent, true);
        assert.equal(Number(facts[0].columns), 0);
        assert.equal(
          command(["resolve", "--rolled-back", migration]).status,
          0,
        );
        assert.equal(command(["deploy"]).status, 0);
        assert.equal(command(["status"]).status, 0);
      }),
  );
});
