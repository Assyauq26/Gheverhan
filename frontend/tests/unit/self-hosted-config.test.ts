import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getStoreProfile, parseSelfHostedConfig } from "@/lib/self-hosted/config";
import { assertExistingLocalStorageRoot } from "@/lib/self-hosted/storage-root";

const id = "550e8400-e29b-41d4-a716-446655440000";
const db = "js_" + id.replace(/-/g, "");
const valid = () => ({
  JETSELLER_STORE_PROFILE: "self-hosted",
  JETSELLER_INSTALLATION_ID: id,
  JETSELLER_INSTALLATION_MODE: "new",
  JETSELLER_STORE_DOMAIN: "fashion.example",
  APP_ORIGIN: "https://fashion.example",
  STORAGE_PROVIDER: "local",
  STORAGE_APP_NAME: "js_550e8400",
  STORAGE_LOCAL_ROOT: "/data/jetseller/media",
  DATABASE_URL: `postgresql://js_runtime:runtime-fixture@db:5432/${db}?schema=public`,
  DIRECT_URL: `postgresql://js_migration:migration-fixture@db:5432/${db}?schema=public`,
  JWT_SECRET: "a".repeat(64),
  AUTH_COOKIE_NAME: "js_550e8400_session",
  PASSWORD_RESET_FROM: "JetSeller <noreply@fashion.example>",
  PASSWORD_RESET_BASE_URL: "https://fashion.example",
  JNT_ENABLE_ORDER_CREATE: "no",
});

afterEach(() => vi.unstubAllEnvs());

describe("self-hosted opt-in configuration", () => {
  it("preserves legacy startup but fails invalid opt-in before the runtime becomes ready", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("JETSELLER_STORE_PROFILE", "");
    await expect(register()).resolves.toBeUndefined();
    vi.stubEnv("JETSELLER_STORE_PROFILE", "self-hosted");
    vi.stubEnv("JETSELLER_INSTALLATION_ID", "");
    await expect(register()).rejects.toThrow("JETSELLER_INSTALLATION_ID");
  });
  it("preserves legacy profile when the explicit selector is absent", () => {
    expect(getStoreProfile({})).toBe("legacy");
    expect(getStoreProfile({ APP_ORIGIN: "https://gheverhan.store" })).toBe("legacy");
    expect(() => getStoreProfile({ JETSELLER_STORE_PROFILE: "multi-tenant" })).toThrow("JETSELLER_STORE_PROFILE");
    expect(() => parseSelfHostedConfig({})).toThrow("JETSELLER_STORE_PROFILE");
  });

  it("validates an independent local store without network and without returning secrets", () => {
    const env = valid();
    const config = parseSelfHostedConfig(env);
    expect(config).toMatchObject({
      profile: "self-hosted",
      installationId: id,
      installationMode: "new",
      appOrigin: "https://fashion.example",
      domain: "fashion.example",
      storageProvider: "local",
      storageRoot: "/data/jetseller/media",
      storageApp: "js_550e8400",
      databaseHost: "db",
      databaseName: db,
      databaseRuntimeUser: "js_runtime",
      databaseMigrationUser: "js_migration",
      cookieName: "js_550e8400_session",
      sessionIssuer: "jetseller-store:" + id,
      sessionAudience: "jetseller-storefront:" + id,
    });
    const serial = JSON.stringify(config);
    for (const secret of ["runtime-fixture", "migration-fixture", "a".repeat(64)]) {
      expect(serial).not.toContain(secret);
    }
  });

  it.each([
    ["APP_ORIGIN", "http://fashion.example"],
    ["APP_ORIGIN", "https://user:secret@fashion.example"],
    ["APP_ORIGIN", "https://fashion.example/checkout"],
    ["APP_ORIGIN", "https://fashion.example?x=1"],
    ["APP_ORIGIN", "https://localhost"],
    ["JETSELLER_STORE_DOMAIN", "different.example"],
    ["JETSELLER_INSTALLATION_ID", "not-a-uuid"],
    ["JETSELLER_INSTALLATION_MODE", "existing"],
    ["STORAGE_PROVIDER", "supabase"],
    ["STORAGE_APP_NAME", "gheverhan"],
    ["STORAGE_APP_NAME", "javascript/../"],
    ["STORAGE_LOCAL_ROOT", "/"],
    ["STORAGE_LOCAL_ROOT", "/etc/ssl"],
    ["STORAGE_LOCAL_ROOT", "/data/../secret"],
    ["STORAGE_LOCAL_ROOT", "../data"],
    ["STORAGE_LOCAL_ROOT", "C:\\data"],
    ["STORAGE_LOCAL_ROOT", "/data//media"],
    ["AUTH_COOKIE_NAME", "gh_session"],
    ["JWT_SECRET", "short"],
    ["PASSWORD_RESET_BASE_URL", "https://other.example"],
    ["PASSWORD_RESET_FROM", "bad\r\nFrom: attacker"],
    ["JNT_ENABLE_ORDER_CREATE", "yes"],
    ["VERCEL_ENV", "production"],
    ["SUPABASE_SERVICE_ROLE_KEY", "do-not-leak"],
  ])("rejects unsafe field %s", (field, value) => {
    const config = { ...valid(), [field]: value };
    const serialized = JSON.stringify(config);
    expect(() => parseSelfHostedConfig(config)).toThrow();
    try { parseSelfHostedConfig(config); } catch (error) {
      expect(String(error)).not.toContain("do-not-leak");
      expect(String(error)).not.toContain("runtime-fixture");
      expect(String(error)).not.toContain("migration-fixture");
      expect(String(error)).not.toContain("attacker");
      expect(serialized).toContain(field);
    }
  });

  it.each([
    ["DATABASE_URL", "postgresql://user:secret@outside.example:5432/js_test"],
    ["DATABASE_URL", "postgresql://user:secret@db:5432/postgres"],
    ["DATABASE_URL", `postgresql://user:secret@db:5432/${db}?host=%2Ftmp%2Fsock`],
    ["DATABASE_URL", `postgresql://user:secret@db:5432/${db}?sslmode=disable`],
    ["DATABASE_URL", `postgresql://user:secret@db:5432/${db}?schema=public&schema=public`],
    ["DIRECT_URL", "not-a-url"],
  ])("rejects unsafe %s without echoing credentials", (field, value) => {
    const env = { ...valid(), [field]: value };
    expect(() => parseSelfHostedConfig(env)).toThrow(field);
    try { parseSelfHostedConfig(env); } catch (error) {
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain("runtime-fixture");
    }
  });

  it("requires distinct runtime/migration principals", () => {
    const env = valid();
    expect(() => parseSelfHostedConfig({ ...env, DIRECT_URL: env.DATABASE_URL })).toThrow("database role separation");
    const samePassword = env.DIRECT_URL.replace("migration-fixture", "runtime-fixture");
    expect(() => parseSelfHostedConfig({ ...env, DIRECT_URL: samePassword })).toThrow("database role separation");
  });

  it("validates an existing local mount and refuses symlinks, files or missing roots", () => {
    const root = mkdtempSync(path.join(tmpdir(), "jetseller-m1-"));
    try {
      const media = path.join(root, "media");
      mkdirSync(media, { mode: 0o700 });
      expect(() => assertExistingLocalStorageRoot(media)).not.toThrow();
      expect(() => assertExistingLocalStorageRoot(path.join(root, "absent"))).toThrow("STORAGE_LOCAL_ROOT");
      const link = path.join(root, "linked-media");
      symlinkSync(media, link);
      expect(() => assertExistingLocalStorageRoot(link)).toThrow("STORAGE_LOCAL_ROOT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("separates issuer, audience, database and cookie between installations", () => {
    const a = parseSelfHostedConfig(valid());
    const other = "a32cc632-e749-4be8-9a4d-27c50d6bb780";
    const bName = "js_" + other.replace(/-/g, "");
    const b = parseSelfHostedConfig({
      ...valid(),
      JETSELLER_INSTALLATION_ID: other,
      STORAGE_APP_NAME: "js_a32cc632",
      AUTH_COOKIE_NAME: "js_a32cc632_session",
      JETSELLER_STORE_DOMAIN: "newfashion.example",
      APP_ORIGIN: "https://newfashion.example",
      PASSWORD_RESET_BASE_URL: "https://newfashion.example",
      DATABASE_URL: `postgresql://other_runtime:other-pass@db:5432/${bName}`,
      DIRECT_URL: `postgresql://other_migration:migration-pass@db:5432/${bName}`,
      JWT_SECRET: "b".repeat(64),
      STORAGE_LOCAL_ROOT: "/data/second-store/media",
    });
    expect(b.databaseName).not.toBe(a.databaseName);
    expect(b.sessionIssuer).not.toBe(a.sessionIssuer);
    expect(b.cookieName).not.toBe(a.cookieName);
    expect(b.storageRoot).not.toBe(a.storageRoot);
  });
});
