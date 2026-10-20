import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Reject inherited remote credentials before running ANY database command.
const target = process.env.SPRINT1_TEST_DATABASE_URL;
if (!target) throw new Error("Explicit isolated test database required");
const url = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/gheverhan_sprint1_test" || process.env.GHEVERHAN_ISOLATED_TESTS !== "1") {
  throw new Error("Database entrypoint regression refuses non-local/test databases");
}
const schema = `entrypoints_${randomUUID().replaceAll("-", "")}`;
url.searchParams.set("schema", schema);
const isolated = url.toString();
const db = new PrismaClient({ datasources: { db: { url: isolated } } });
function run(args: string[], preview: boolean) {
  return spawnSync(process.execPath, args, {
    env: {
      PATH: `${path.resolve("node_modules/.bin")}${path.delimiter}${process.env.PATH || ""}`, NODE_ENV: "test",
      DATABASE_URL: isolated, DIRECT_URL: isolated,
      VERCEL_ENV: preview ? "preview" : "development",
      GHEVERHAN_SHARED_DEV_DATABASE: "true",
      ADMIN_EMAIL: "bootstrap@entrypoints.example.test",
      ADMIN_PASSWORD: "isolated-entrypoint-fixture-only",
    },
    encoding: "utf8", timeout: 60000,
  });
}

test("direct scripts and managed migrations obey policy in a disposable local schema", async () => {
  try {
    const publicIndexes = () => db.$queryRaw<{ name: string; definition: string }[]>`
      SELECT indexname AS name,indexdef AS definition FROM pg_catalog.pg_indexes
      WHERE schemaname='public' AND tablename='User' ORDER BY indexname`;
    const before = await publicIndexes();
    const migration = run(["node_modules/prisma/build/index.js", "migrate", "deploy"], false);
    assert.equal(migration.status, 0, "isolated fixture migrations must succeed");
    assert.deepEqual(await publicIndexes(), before, "An isolated Prisma schema must never change public indexes");
    const scoped = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM pg_catalog.pg_indexes WHERE schemaname=${schema}
      AND indexname IN ('User_registration_email_normalized_idx','User_registration_phone_normalized_idx')`;
    assert.equal(Number(scoped[0].count), 2, "Both expression indexes belong to the Prisma target schema");
    for (const args of [
      ["--import", "tsx", "prisma/seed.ts"],
      ["--import", "tsx", "prisma/bootstrap-admin.ts"],
      ["node_modules/prisma/build/index.js", "db", "seed"],
    ]) {
      const result = run(args, true);
      assert.notEqual(result.status, 0);
      assert.equal(result.error, undefined);
      assert.match(result.stderr, /disabled from Vercel Preview/);
      assert.ok(!result.stderr.includes(isolated));
      assert.equal(await db.user.count(), 0, "Preview must leave schema empty");
      assert.equal(await db.role.count(), 0);
    }
    // Exercise the actual npm wrappers, not just their guard module.
    for (const name of ["seed", "prisma:bootstrap-admin", "prisma:migrate", "prisma:deploy"]) {
      const wrapped = spawnSync("npm", ["run", name], {
        env: { PATH: `${path.resolve("node_modules/.bin")}${path.delimiter}${process.env.PATH || ""}`, NODE_ENV: "test", VERCEL_ENV: "preview", DATABASE_URL: isolated, DIRECT_URL: isolated },
        encoding: "utf8", timeout: 10000,
      });
      assert.equal(wrapped.error, undefined);
      assert.notEqual(wrapped.status, 0);
      assert.match(wrapped.stderr, /disabled from Vercel Preview/);
      assert.equal(await db.user.count(), 0);
    }
    assert.equal(run(["--import", "tsx", "prisma/seed.ts"], false).status, 0, "local seed remains functional");
    assert.ok(await db.product.count() > 0);
    assert.equal(run(["--import", "tsx", "prisma/bootstrap-admin.ts"], false).status, 0, "local bootstrap remains functional");
    const admin = await db.user.findUniqueOrThrow({ where: { email: "bootstrap@entrypoints.example.test" }, include: { roles: true } });
    assert.ok(admin.roles.length > 0);
    assert.equal(run(["--import", "tsx", "prisma/bootstrap-admin.ts"], false).status, 0, "bootstrap remains idempotent");
  } finally {
    // Identifier is generated solely from a UUID, and target has been checked above.
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
