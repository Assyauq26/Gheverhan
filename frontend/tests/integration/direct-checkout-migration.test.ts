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
const migration = "20261020120000_direct_checkout_intents";
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
  const directory = await mkdtemp(path.join(tmpdir(), "direct-checkout-"));
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
    assert.equal(names[9], migration);
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
test("direct checkout migration: fresh, upgrade preservation and official retry", async (t) => {
  await t.test(
    "fresh install has exact checksum, RLS without public policies, constraints and valid indexes",
    async () =>
      disposable(10, async ({ db, command }) => {
        assert.equal(command(["status"]).status, 0);
        const facts = await db.$queryRaw<
          {
            ready: boolean;
            policies: number;
            indexes: number;
            checks: number;
          }[]
        >`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='"CheckoutIntent"'::regclass) AS ready,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='CheckoutIntent') AS policies,
      (SELECT count(*)::int FROM pg_index WHERE indrelid='"CheckoutIntent"'::regclass AND indisvalid AND indisready) AS indexes,
      (SELECT count(*)::int FROM pg_constraint WHERE conrelid='"CheckoutIntent"'::regclass AND contype='c' AND convalidated) AS checks`;
        assert.deepEqual(facts, [
          { ready: true, policies: 0, indexes: 4, checks: 3 },
        ]);
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
        await assert.rejects(
          db.$executeRaw`INSERT INTO "CheckoutIntent" (id,"variantId",quantity,"expiresAt") VALUES('invalid-owner','dummy',1,NOW())`,
        );
      }),
  );
  await t.test("upgrade and retry preserve existing user rows", async () =>
    disposable(9, async ({ db, command, add }) => {
      const user = await db.user.create({
        data: {
          name: "Dummy",
          email: "dummy@example.test",
          passwordHash: "not-for-login",
        },
      });
      await add();
      assert.equal(command(["deploy"]).status, 0);
      assert.equal(command(["deploy"]).status, 0);
      assert.deepEqual(
        await db.user.findUnique({ where: { id: user.id } }),
        user,
      );
      assert.equal(await db.checkoutIntent.count(), 0);
    }),
  );
  await t.test(
    "bounded lock failure leaves no partial table, permits official rollback and retry after state verification",
    async () =>
      disposable(9, async ({ db, command, add }) => {
        await add();
        let entered!: () => void, release!: () => void;
        const ready = new Promise<void>((r) => (entered = r)),
          gate = new Promise<void>((r) => (release = r));
        const blocker = db.$transaction(
          async (tx) => {
            await tx.$executeRaw`LOCK TABLE "User" IN ROW EXCLUSIVE MODE`;
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
          { absent: boolean }[]
        >`SELECT to_regclass('public."CheckoutIntent"') IS NULL AS absent`;
        assert.equal(facts[0].absent, true);
        assert.equal(
          command(["resolve", "--rolled-back", migration]).status,
          0,
        );
        assert.equal(command(["deploy"]).status, 0);
        assert.equal(command(["status"]).status, 0);
      }),
  );
});
