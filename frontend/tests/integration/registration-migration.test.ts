/** Upgrade/lock-failure/retry drill. Creates only a uniquely named LOCAL disposable database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
test("six-to-seven upgrade preserves legacy accounts, rolls back lock failure, and retries safely", async () => {
  const admin = new PrismaClient({
    datasources: { db: { url: target.toString() } },
  });
  const name = "otp_migration_" + randomUUID().replaceAll("-", "");
  assert.match(name, /^otp_migration_[a-f0-9]+$/);
  const url = new URL(target);
  url.pathname = "/" + name;
  const directory = await mkdtemp(path.join(tmpdir(), "otp-migration-"));
  let db: PrismaClient | undefined,
    created = false;
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
        encoding: "utf8",
        timeout: 25000,
      },
    );
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await cp("prisma/schema.prisma", path.join(directory, "schema.prisma"));
    const migrations = (await readdir("prisma/migrations"))
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    assert.equal(migrations.length, 12);
    // Keep the historical six-to-seven OTP drill independent of the additive index migration.
    assert.equal(
      migrations[7],
      "20261019054922_registration_identity_lookup_indexes",
    );
    for (const migration of migrations.slice(0, 6))
      await cp(
        path.join("prisma/migrations", migration),
        path.join(directory, "migrations", migration),
        { recursive: true },
      );
    await cp(
      "prisma/migrations/migration_lock.toml",
      path.join(directory, "migrations/migration_lock.toml"),
    );
    assert.equal(command(["deploy"]).status, 0);
    await db.$executeRaw`INSERT INTO "User" ("id","name","email","passwordHash","updatedAt") VALUES ('legacy-dummy','Dummy','legacy@example.test','unused-dummy-hash',NOW())`;
    await cp(
      path.join("prisma/migrations", migrations[6]),
      path.join(directory, "migrations", migrations[6]),
      { recursive: true },
    );
    let release!: () => void, ready!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const hold = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE`;
        ready();
        await wait;
      },
      { timeout: 20000 },
    );
    let failed: ReturnType<typeof command>;
    let elapsed = 0;
    try {
      await locked;
      const started = Date.now();
      failed = command(["deploy"]);
      elapsed = Date.now() - started;
    } finally {
      release();
      await hold;
    }
    assert.equal(failed.status, 1);
    // Prisma 5 may mask SQLSTATE55P03 with its subsequent failed-ledger write
    // inside the aborted explicit transaction. Still prove the lock deadline and rollback.
    assert.match(
      failed.stdout + failed.stderr,
      /lock timeout|current transaction is aborted/,
    );
    assert.ok(elapsed >= 4500 && elapsed < 20000);
    const absent = await db.$queryRaw<{ pending: boolean; column: boolean }[]>`
      SELECT to_regclass('public."PendingRegistration"') IS NULL AS pending,
      NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='emailVerifiedAt') AS column`;
    assert.deepEqual(absent, [{ pending: true, column: true }]);
    assert.equal(
      command(["resolve", "--rolled-back", migrations[6]]).status,
      0,
    );
    assert.equal(command(["deploy"]).status, 0);
    assert.equal(command(["deploy"]).status, 0); // idempotent deploy retry
    const users = await db.$queryRaw<
      { phone: string | null; emailVerifiedAt: Date | null }[]
    >`
      SELECT "phone","emailVerifiedAt" FROM "User" WHERE id='legacy-dummy'`;
    assert.deepEqual(users, [{ phone: null, emailVerifiedAt: null }]);
    const ledger = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(Number(ledger[0].count), 7);
  } finally {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await admin.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
