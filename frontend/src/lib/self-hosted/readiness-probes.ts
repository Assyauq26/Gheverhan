import { constants } from "node:fs";
import { open, readFile, readdir, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { SelfHostedStoreConfig } from "./config";

export interface MigrationRow { migration_name: string; checksum: string; finished: boolean; rolled_back: boolean }
export function verifyMigrationLedger(expected: ReadonlyMap<string, ReadonlySet<string>>, rows: readonly MigrationRow[]) {
  const applied = new Set<string>();
  if (!expected.size || rows.length > 128) throw new Error("Schema unavailable");
  for (const row of rows) {
    if (row.rolled_back) continue;
    if (!row.finished || applied.has(row.migration_name) || !expected.get(row.migration_name)?.has(row.checksum)) throw new Error("Schema incompatible");
    applied.add(row.migration_name);
  }
  if (applied.size !== expected.size) throw new Error("Schema incomplete");
}

async function migrationManifest(signal: AbortSignal) {
  const directory = path.join(process.cwd(), "prisma/migrations");
  const entries = (await readdir(directory)).filter(name => /^\d{14}_[a-z0-9_]+$/.test(name));
  if (!entries.length || entries.length > 128) throw new Error("Schema unavailable");
  const expected = new Map<string, Set<string>>();
  for (const name of entries) {
    signal.throwIfAborted();
    const bytes = await readFile(path.join(directory, name, "migration.sql"), { signal });
    const original = bytes.toString("utf8");
    const lf = original.replace(/\r\n/g, "\n");
    expected.set(name, new Set([original, lf, lf.replace(/\n/g, "\r\n")].map(value => createHash("sha256").update(value).digest("hex"))));
  }
  return expected;
}

let client: { url: string; db: PrismaClient } | undefined;
export async function probeDatabase(config: SelfHostedStoreConfig, signal: AbortSignal) {
  signal.throwIfAborted();
  const expected = await migrationManifest(signal);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "1");
  url.searchParams.set("pool_timeout", "1");
  const value = url.toString();
  if (!client || client.url !== value) {
    if (client) await client.db.$disconnect();
    client = { url: value, db: new PrismaClient({ log: [], datasources: { db: { url: value } } }) };
  }
  signal.throwIfAborted();
  await client.db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
    await tx.$executeRaw`SET LOCAL lock_timeout = '500ms'`;
    const identity = await tx.$queryRaw<{ database: string; role: string; tables: boolean }[]>`
      SELECT current_database() AS database, current_user AS role,
      (to_regclass('public."User"') IS NOT NULL AND to_regclass('public."Product"') IS NOT NULL
       AND to_regclass('public."Order"') IS NOT NULL AND to_regclass('public."SessionRevocation"') IS NOT NULL) AS tables`;
    if (identity.length !== 1 || identity[0].database !== config.databaseName || identity[0].role !== config.databaseRuntimeUser || !identity[0].tables) throw new Error("Schema incompatible");
    const rows = await tx.$queryRaw<MigrationRow[]>`
      SELECT migration_name, checksum, finished_at IS NOT NULL AS finished,
      rolled_back_at IS NOT NULL AS rolled_back
      FROM public._prisma_migrations ORDER BY migration_name LIMIT 129`;
    verifyMigrationLedger(expected, rows);
    signal.throwIfAborted();
  }, { maxWait: 500, timeout: 1500 });
}

/** Ubuntu runtime only. Anchor the sentinel to an opened directory descriptor,
 * not a path that could be replaced after validation. Never create media roots. */
export async function probeStorage(config: SelfHostedStoreConfig, signal: AbortSignal) {
  const root = config.storageRoot;
  let directory = await open("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    for (const segment of root.split("/").filter(Boolean)) {
      signal.throwIfAborted();
      const next = await open(`/proc/self/fd/${directory.fd}/${segment}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      await directory.close();
      directory = next;
    }
  } catch (error) { await directory.close(); throw error; }
  const sentinel = `/proc/self/fd/${directory.fd}/.jetseller-readiness-${randomUUID()}`;
  let created = false;
  try {
    const info = await directory.stat();
    // Access checks under root can otherwise mask a read-only-permission fixture.
    if (!info.isDirectory() || !(info.mode & 0o444) || !(info.mode & 0o222) || !(info.mode & 0o111)) throw new Error("Storage unavailable");
    signal.throwIfAborted();
    const marker = await open(`/proc/self/fd/${directory.fd}/.jetseller-installation-id`, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await marker.stat();
      if (!info.isFile() || info.size !== config.installationId.length + 1 || (info.mode & 0o077)) throw new Error("Storage unavailable");
      const bytes = Buffer.alloc(info.size);
      const read = await marker.read(bytes, 0, bytes.length, 0);
      if (read.bytesRead !== bytes.length || bytes.toString() !== config.installationId + "\n") throw new Error("Storage unavailable");
    } finally { await marker.close(); }
    signal.throwIfAborted();
    const file = await open(sentinel, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    try {
      await file.writeFile("jetseller-readiness-v1", { signal });
      signal.throwIfAborted();
      await file.sync();
      const value = Buffer.alloc(Buffer.byteLength("jetseller-readiness-v1"));
      const read = await file.read(value, 0, value.length, 0);
      if (read.bytesRead !== value.length || value.toString() !== "jetseller-readiness-v1") throw new Error("Storage unavailable");
      signal.throwIfAborted();
    } finally { await file.close(); }
  } finally {
    try { if (created) await unlink(sentinel); } finally { await directory.close(); }
  }
}
