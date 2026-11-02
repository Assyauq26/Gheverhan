import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadinessCheck } from "@/lib/self-hosted/readiness";
import { probeStorage, verifyMigrationLedger } from "@/lib/self-hosted/readiness-probes";
import { parseSelfHostedConfig } from "@/lib/self-hosted/config";
import { chmod, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const id = "550e8400-e29b-41d4-a716-446655440000";
const db = "js_" + id.replace(/-/g, "");
const valid = () => ({
  JETSELLER_STORE_PROFILE: "self-hosted", JETSELLER_INSTALLATION_ID: id,
  JETSELLER_INSTALLATION_MODE: "new", JETSELLER_STORE_DOMAIN: "fashion.example",
  APP_ORIGIN: "https://fashion.example", STORAGE_PROVIDER: "local", STORAGE_APP_NAME: "js_550e8400",
  STORAGE_LOCAL_ROOT: "/data/jetseller/media",
  DATABASE_URL: `postgresql://js_runtime:runtime-sentinel@db:5432/${db}?schema=public`,
  DIRECT_URL: `postgresql://js_migration:migration-sentinel@db:5432/${db}?schema=public`,
  JWT_SECRET: "a".repeat(64), AUTH_COOKIE_NAME: "js_550e8400_session",
  PASSWORD_RESET_FROM: "JetSeller <noreply@fashion.example>", PASSWORD_RESET_BASE_URL: "https://fashion.example",
});
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
afterEach(() => vi.useRealTimers());

describe("self-hosted readiness boundary", () => {
  it("keeps legacy disabled without probing any dependency", async () => {
    const database = vi.fn(); const storage = vi.fn();
    const check = createReadinessCheck({ database, storage });
    expect(await check({})).toEqual({ status: "not_enabled" });
    expect(database).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  });
  it.each([
    { APP_ORIGIN: "http://fashion.example" },
    { JETSELLER_STORE_DOMAIN: "other.example" },
    { JWT_SECRET: "missing" },
    { STORAGE_PROVIDER: "supabase" },
    { JETSELLER_STORE_PROFILE: "invalid" },
  ])("fails invalid configuration before dependencies %j", async bad => {
    const database = vi.fn(); const storage = vi.fn();
    expect(await createReadinessCheck({ database, storage })({ ...valid(), ...bad })).toEqual({ status: "not_ready" });
    expect(database).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  });
  it("requires both local dependencies and does not contact providers", async () => {
    const database = vi.fn().mockResolvedValue(undefined); const storage = vi.fn().mockResolvedValue(undefined);
    expect(await createReadinessCheck({ database, storage })(valid())).toEqual({ status: "ready" });
    expect(database).toHaveBeenCalledOnce(); expect(storage).toHaveBeenCalledOnce();
  });
  it.each(["database", "storage"] as const)("sanitizes %s errors", async failed => {
    const deps = { database: vi.fn().mockResolvedValue(undefined), storage: vi.fn().mockResolvedValue(undefined) };
    deps[failed].mockRejectedValue(new Error("postgresql://private-password@db/orders /private/media runtime-sentinel"));
    const result = await createReadinessCheck(deps)(valid());
    expect(result).toEqual({ status: "not_ready" });
    expect(JSON.stringify(result)).not.toContain("sentinel");
  });
  it("bounds timeout, aborts and retains one slot until underlying work settles", async () => {
    vi.useFakeTimers(); const pending = deferred();
    const database = vi.fn().mockImplementation(() => pending.promise); const storage = vi.fn().mockResolvedValue(undefined);
    const check = createReadinessCheck({ database, storage }, { timeoutMs: 50, cacheMs: 10 });
    const first = check(valid()); const second = check(valid());
    await vi.advanceTimersByTimeAsync(51);
    expect(await first).toEqual({ status: "not_ready" }); expect(await second).toEqual({ status: "not_ready" });
    expect(database.mock.calls[0][1].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(await check(valid())).toEqual({ status: "not_ready" });
    expect(database).toHaveBeenCalledOnce(); pending.resolve(); await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(await check(valid())).toEqual({ status: "ready" }); expect(database).toHaveBeenCalledTimes(2);
  });
  it("does not release concurrency slot when one dependency fails and the other hangs", async () => {
    vi.useFakeTimers(); const pending = deferred();
    const database = vi.fn().mockRejectedValue(new Error("unreachable")); const storage = vi.fn().mockImplementation(() => pending.promise);
    const check = createReadinessCheck({ database, storage }, { timeoutMs: 50, cacheMs: 1 });
    const first = check(valid()); await vi.advanceTimersByTimeAsync(51); expect(await first).toEqual({ status: "not_ready" });
    await vi.advanceTimersByTimeAsync(2); expect(await check(valid())).toEqual({ status: "not_ready" }); expect(database).toHaveBeenCalledOnce();
    pending.resolve(); await vi.advanceTimersByTimeAsync(1);
  });
  it("caches bounded success but invalidates it when credentials rotate", async () => {
    let now = 100; const database = vi.fn().mockResolvedValue(undefined); const storage = vi.fn().mockResolvedValue(undefined);
    const check = createReadinessCheck({ database, storage }, { cacheMs: 10, now: () => now });
    await check(valid()); await check(valid()); expect(database).toHaveBeenCalledOnce();
    await check({ ...valid(), JWT_SECRET: "b".repeat(64) }); expect(database).toHaveBeenCalledTimes(2);
    now = 111; await check(valid()); expect(database).toHaveBeenCalledTimes(3);
  });
});

describe("migration compatibility", () => {
  const expected = new Map([["first", new Set(["checksum"])]]);
  const row = { migration_name: "first", checksum: "checksum", finished: true, rolled_back: false };
  it("accepts completed exact history and ignores explicitly rolled-back attempts", () => {
    expect(() => verifyMigrationLedger(expected, [{ ...row, finished: false, rolled_back: true }, row])).not.toThrow();
  });
  it.each([
    [], [{ ...row, finished: false }], [{ ...row, checksum: "changed" }], [row, row],
    [row, { ...row, migration_name: "future_schema" }],
  ].map(rows => [rows] as const))("rejects missing/unfinished/changed/duplicate/future migration history", rows => {
    expect(() => verifyMigrationLedger(expected, rows)).toThrow();
  });
  it("refuses absent trusted manifest", () => expect(() => verifyMigrationLedger(new Map(), [])).toThrow());
});

describe.skipIf(process.platform !== "linux")("real Linux media mount probe", () => {
  it("writes, reads, syncs and removes only its exclusive temporary sentinel", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jetseller-ready-"));
    try {
      const config = { ...parseSelfHostedConfig(valid()), storageRoot: root };
      await writeFile(path.join(root, ".jetseller-installation-id"), id + "\n", { mode: 0o600 });
      await probeStorage(config, new AbortController().signal);
      expect(await readdir(root)).toEqual([".jetseller-installation-id"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("fails absent/read-only/symlinked roots and ancestors without creating media", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jetseller-ready-")); const media = path.join(root, "media");
    try {
      await mkdir(media); await symlink(media, path.join(root, "link"));
      for (const name of ["absent", "link", "link/child"]) {
        await expect(probeStorage({ ...parseSelfHostedConfig(valid()), storageRoot: path.join(root, name) }, new AbortController().signal)).rejects.toThrow();
      }
      await chmod(media, 0o500);
      await expect(probeStorage({ ...parseSelfHostedConfig(valid()), storageRoot: media }, new AbortController().signal)).rejects.toThrow();
      expect(await readdir(media)).toEqual([]);
    } finally { await chmod(media, 0o700); await rm(root, { recursive: true, force: true }); }
  });
  it("rejects missing, wrong, symlinked or publicly readable volume identity", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jetseller-ready-"));
    const marker = path.join(root, ".jetseller-installation-id");
    const config = { ...parseSelfHostedConfig(valid()), storageRoot: root };
    try {
      await expect(probeStorage(config, new AbortController().signal)).rejects.toThrow();
      await writeFile(marker, "a32cc632-e749-4be8-9a4d-27c50d6bb780\n", { mode: 0o600 });
      await expect(probeStorage(config, new AbortController().signal)).rejects.toThrow();
      await writeFile(marker, id + "\n"); await chmod(marker, 0o644);
      await expect(probeStorage(config, new AbortController().signal)).rejects.toThrow();
      await rm(marker); await writeFile(path.join(root, "other"), id + "\n", { mode: 0o600 });
      await symlink(path.join(root, "other"), marker);
      await expect(probeStorage(config, new AbortController().signal)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("rejects a FIFO marker immediately and recovers after valid marker replacement", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jetseller-ready-"));
    const marker = path.join(root, ".jetseller-installation-id");
    const config = { ...parseSelfHostedConfig(valid()), storageRoot: root };
    try {
      execFileSync("mkfifo", ["-m", "600", marker]);
      await expect(probeStorage(config, new AbortController().signal)).rejects.toThrow();
      await rm(marker); await writeFile(marker, id + "\n", { mode: 0o600 });
      await expect(probeStorage(config, new AbortController().signal)).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("honors cancellation without touching the mount", async () => {
    const signal = AbortSignal.abort();
    await expect(probeStorage(parseSelfHostedConfig(valid()), signal)).rejects.toThrow();
  });
});
