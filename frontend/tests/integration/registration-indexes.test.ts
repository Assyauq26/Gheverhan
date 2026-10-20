/** Official Prisma migration drills; uniquely named local disposable databases only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { registrationIdentityQuery, recoveryIdentityQuery } from "../../src/modules/auth/registration-identity";

const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
const migrationName = "20261019054922_registration_identity_lookup_indexes";
const indexNames = [
  "User_registration_email_normalized_idx",
  "User_registration_phone_normalized_idx",
];

type Fixture = {
  db: PrismaClient;
  url: URL;
  directory: string;
  command: (args: string[]) => ReturnType<typeof spawnSync>;
  addIndexMigration: () => Promise<void>;
};
async function disposable(
  count: number,
  run: (fixture: Fixture) => Promise<void>,
) {
  const admin = new PrismaClient({
    datasources: { db: { url: target.toString() } },
  });
  const name = "registration_index_" + randomUUID().replaceAll("-", "");
  assert.match(name, /^registration_index_[a-f0-9]+$/);
  const url = new URL(target);
  url.pathname = "/" + name;
  const directory = await mkdtemp(path.join(tmpdir(), "registration-index-"));
  let created = false;
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
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
        timeout: 30000,
      },
    );
  const addIndexMigration = () =>
    cp(
      path.join("prisma/migrations", migrationName),
      path.join(directory, "migrations", migrationName),
      { recursive: true },
    );
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    await cp("prisma/schema.prisma", path.join(directory, "schema.prisma"));
    const names = (await readdir("prisma/migrations"))
      .filter((name) => /^\d{14}_/.test(name))
      .sort();
    assert.equal(names.length, 8);
    assert.equal(names[7], migrationName);
    for (const entry of names.slice(0, count))
      await cp(
        path.join("prisma/migrations", entry),
        path.join(directory, "migrations", entry),
        { recursive: true },
      );
    await cp(
      "prisma/migrations/migration_lock.toml",
      path.join(directory, "migrations/migration_lock.toml"),
    );
    assert.equal(
      command(["deploy"]).status,
      0,
      "Disposable schema must migrate before testing",
    );
    await run({ db, url, directory, command, addIndexMigration });
  } finally {
    await db.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await admin.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
async function indexes(db: PrismaClient) {
  return db.$queryRaw<
    { name: string; valid: boolean; expression: string | null }[]
  >`
    SELECT c.relname AS name, (i.indisvalid AND i.indisready AND NOT i.indisunique) AS valid,
      pg_get_expr(i.indexprs,i.indrelid) AS expression
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid='public."User"'::regclass AND c.relname IN ('User_registration_email_normalized_idx','User_registration_phone_normalized_idx') ORDER BY c.relname`;
}
async function legacy(db: PrismaClient) {
  await db.$executeRaw`INSERT INTO "User" (id,name,email,phone,"passwordHash","updatedAt") VALUES
    ('legacy-a','Dummy','LEGACY@example.test','0812 34567890','unused-dummy-hash',NOW()),
    ('legacy-b','Dummy','legacy@example.test','+6281234567890','unused-dummy-hash',NOW())`;
  return db.user.findMany({ orderBy: { id: "asc" } });
}

test("registration identity indexes: fresh, upgrade, transaction recovery and generic query plan", async (t) => {
  await t.test(
    "fresh eight migrations and retry preserve checksums and non-unique expressions",
    async () =>
      disposable(8, async ({ db, command }) => {
        assert.equal(command(["deploy"]).status, 0);
        const facts = await indexes(db);
        assert.deepEqual(
          facts.map((row) => row.name),
          indexNames,
        );
        assert.ok(facts.every((row) => row.valid && row.expression));
        const ledger = await db.$queryRaw<
          { migration_name: string; checksum: string }[]
        >`SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
        assert.equal(ledger.length, 8);
        for (const row of ledger)
          assert.equal(
            row.checksum,
            createHash("sha256")
              .update(
                await readFile(
                  path.join(
                    "prisma/migrations",
                    row.migration_name,
                    "migration.sql",
                  ),
                ),
              )
              .digest("hex"),
          );
      }),
  );
  await t.test(
    "seven-to-eight lock failure is bounded and officially resolves/retries without changing legacy users",
    async () =>
      disposable(7, async ({ db, command, addIndexMigration }) => {
        const before = await legacy(db);
        await addIndexMigration();
        let release!: () => void, ready!: () => void;
        const wait = new Promise<void>((resolve) => {
          release = resolve;
        });
        const locked = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const holder = db.$transaction(
          async (tx) => {
            await tx.$executeRaw`LOCK TABLE "User" IN ROW EXCLUSIVE MODE`;
            ready();
            await wait;
          },
          { timeout: 20000 },
        );
        let failed!: ReturnType<typeof command>,
          elapsed = 0;
        try {
          await locked;
          const started = Date.now();
          failed = command(["deploy"]);
          elapsed = Date.now() - started;
        } finally {
          release();
          await holder;
        }
        assert.equal(failed.status, 1);
        assert.match(
          String(failed.stdout) + String(failed.stderr),
          /lock timeout|current transaction is aborted/,
        );
        assert.ok(elapsed >= 4500 && elapsed < 20000);
        assert.equal((await indexes(db)).length, 0);
        assert.deepEqual(
          await db.user.findMany({ orderBy: { id: "asc" } }),
          before,
        );
        assert.equal(
          command(["resolve", "--rolled-back", migrationName]).status,
          0,
        );
        assert.equal(command(["deploy"]).status, 0);
        assert.equal(command(["deploy"]).status, 0);
        assert.deepEqual(
          await db.user.findMany({ orderBy: { id: "asc" } }),
          before,
        );
        assert.ok((await indexes(db)).every((row) => row.valid));
      }),
  );
  await t.test(
    "a failure in the second DDL rolls back the first index and can recover using official Prisma",
    async () =>
      disposable(7, async ({ db, command, addIndexMigration }) => {
        const before = await legacy(db);
        // Deliberate local fixture conflict; never a Production operation.
        await db.$executeRaw`CREATE INDEX "User_registration_phone_normalized_idx" ON "User"(phone)`;
        await addIndexMigration();
        assert.equal(command(["deploy"]).status, 1);
        const failed = await indexes(db);
        assert.deepEqual(
          failed.map((row) => row.name),
          [indexNames[1]],
        );
        assert.equal(
          failed[0].expression,
          null,
          "The pre-existing fixture remains; the first migration DDL rolled back",
        );
        assert.deepEqual(
          await db.user.findMany({ orderBy: { id: "asc" } }),
          before,
        );
        assert.equal(
          command(["resolve", "--rolled-back", migrationName]).status,
          0,
        );
        await db.$executeRaw`DROP INDEX "User_registration_phone_normalized_idx"`;
        assert.equal(command(["deploy"]).status, 0);
        assert.equal((await indexes(db)).length, 2);
        assert.deepEqual(
          await db.user.findMany({ orderBy: { id: "asc" } }),
          before,
        );
      }),
  );
  await t.test(
    "the actual lookup uses both expression indexes with a generic prepared plan and representative dummy rows",
    async () =>
      disposable(8, async ({ db }) => {
        await db.$executeRaw`INSERT INTO "User" (id,name,email,phone,"passwordHash","updatedAt") SELECT 'index-benchmark-' || g,'Dummy','benchmark-' || g || '@example.test','+6281' || lpad(g::text,10,'0'),'unused-dummy-hash',NOW() FROM generate_series(1,10000) AS g`;
        await db.$executeRaw`ANALYZE "User"`;
        const lookup = registrationIdentityQuery(
          "absent@example.test",
          "+62999999999999",
        );
        assert.deepEqual(
          lookup.values,
          ["absent@example.test", "+62999999999999"],
          "User inputs remain bound while normalization literals match generic-plan indexes",
        );
        type Plan = {
          "Node Type": string;
          "Index Name"?: string;
          "Relation Name"?: string;
          Plans?: Plan[];
        };
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL plan_cache_mode = force_generic_plan`;
          await tx.$executeRawUnsafe(
            "PREPARE registration_identity_lookup(text,text) AS " + lookup.text,
          );
          const rows = await tx.$queryRawUnsafe<
            { "QUERY PLAN": { Plan: Plan }[] }[]
          >(
            "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE registration_identity_lookup('absent@example.test','+62999999999999')",
          );
          const nodes: Plan[] = [];
          const visit = (node: Plan) => {
            nodes.push(node);
            node.Plans?.forEach(visit);
          };
          visit(rows[0]["QUERY PLAN"][0].Plan);
          assert.deepEqual(
            nodes
              .flatMap((node) =>
                node["Index Name"] ? [node["Index Name"]] : [],
              )
              .sort(),
            indexNames,
          );
          assert.ok(
            !nodes.some(
              (node) =>
                node["Node Type"] === "Seq Scan" &&
                node["Relation Name"] === "User",
            ),
          );
          await tx.$executeRaw`DEALLOCATE registration_identity_lookup`;
        });
      }),
  );
  await t.test("identity and recovery queries follow Prisma target schema without consulting public users", async () =>
    disposable(8, async ({ db, url }) => {
      await legacy(db);
      await db.$executeRaw`CREATE SCHEMA recovery_fixture`;
      await db.$executeRaw`CREATE TABLE recovery_fixture."User" (LIKE public."User" INCLUDING ALL)`;
      await db.$executeRaw`INSERT INTO recovery_fixture."User" (id,name,email,phone,"passwordHash","updatedAt") VALUES
        ('target-only','Dummy','TARGET@example.test','0812 00000000','dummy',NOW())`;
      const scopedUrl = new URL(url);
      scopedUrl.searchParams.set('schema', 'recovery_fixture');
      const scoped = new PrismaClient({ datasources: { db: { url: scopedUrl.toString() } } });
      try {
        const query = (email: string, phone: string) => scoped.$queryRaw<{ filtered: boolean; conflict: boolean }[]>(registrationIdentityQuery(email, phone));
        assert.deepEqual(await query('legacy@example.test', '+6281234567890'), [{ filtered: false, conflict: false }]);
        assert.deepEqual(await query('target@example.test', '+6281200000000'), [{ filtered: false, conflict: true }]);
        const found = await scoped.$queryRaw<{ filtered: boolean; ids: string[] }[]>(recoveryIdentityQuery('target@example.test', null, ''));
        assert.deepEqual(found, [{ filtered: false, ids: ['target-only'] }]);
        assert.deepEqual(await scoped.$queryRaw(recoveryIdentityQuery('legacy@example.test', null, '')), [{ filtered: false, ids: [] }]);
      } finally { await scoped.$disconnect(); }
      assert.equal(await db.user.count(), 2);
    }),
  );

});
