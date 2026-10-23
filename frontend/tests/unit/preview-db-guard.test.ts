import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { assertPreviewDatabaseIsolation } from "@/lib/preview-db-guard";

const productionRef = "bztprltkevacidcpjaam";
const previewRef = "abcdefghijklmnopqrst";
const otherRef = "qrstabcdefghijklmnop";
const pool = (ref: string) =>
  "postgresql://postgres." + ref + ":fixture-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&sslaccept=strict";
const direct = (ref: string) =>
  "postgresql://postgres:fixture-password@db." + ref + ".supabase.co:5432/postgres?sslmode=require&sslaccept=strict";
const allowed = {
  VERCEL_ENV: "preview",
  GHEVERHAN_PREVIEW_SUPABASE_REF: previewRef,
  DATABASE_URL: pool(previewRef),
  DIRECT_URL: direct(previewRef),
};

describe("strict Preview database isolation", () => {
  it("does not change Production or standalone local behavior", () => {
    for (const VERCEL_ENV of ["production", "development", undefined]) {
      expect(() => assertPreviewDatabaseIsolation({
        VERCEL_ENV, DATABASE_URL: pool(productionRef), DIRECT_URL: direct(productionRef),
      })).not.toThrow();
    }
  });
  it("accepts only a distinct explicitly configured Preview project with two matching DSNs", () => {
    expect(() => assertPreviewDatabaseIsolation(allowed)).not.toThrow();
    expect(() => assertPreviewDatabaseIsolation({
      ...allowed, DATABASE_URL: direct(previewRef), DIRECT_URL: pool(previewRef),
    })).not.toThrow();
  });
  it("rejects the previously approved shared dummy database, even with the legacy opt-in", () => {
    for (const value of [undefined, "true", "false"]) {
      expect(() => assertPreviewDatabaseIsolation({
        ...allowed,
        GHEVERHAN_PREVIEW_SUPABASE_REF: productionRef,
        GHEVERHAN_SHARED_DEV_DATABASE: value,
        DATABASE_URL: pool(productionRef),
        DIRECT_URL: direct(productionRef),
      })).toThrow(/ditolak/);
    }
    expect(() => assertPreviewDatabaseIsolation({
      ...allowed, GHEVERHAN_SHARED_DEV_DATABASE: "true",
    })).toThrow(/ditolak/);
  });
  it("refuses missing and inconsistent isolated project settings", () => {
    const cases = [
      { GHEVERHAN_PREVIEW_SUPABASE_REF: undefined },
      { GHEVERHAN_PREVIEW_SUPABASE_REF: "preview" },
      { GHEVERHAN_PREVIEW_SUPABASE_REF: productionRef },
      { DATABASE_URL: undefined },
      { DIRECT_URL: undefined },
      { DATABASE_URL: pool(productionRef) },
      { DIRECT_URL: direct(otherRef) },
      { DATABASE_URL: "not-a-database-url" },
      { DIRECT_URL: "postgresql://user:password@outside.invalid/db" },
    ];
    for (const testCase of cases) {
      expect(() => assertPreviewDatabaseIsolation({ ...allowed, ...testCase })).toThrow(/ditolak/);
    }
  });
  it("rejects unsafe query overrides and missing strict TLS/pooler settings", () => {
    const cases = [
      pool(previewRef) + "&host=another.invalid",
      pool(previewRef) + "&host=%2Ftmp%2Fpostgres.sock",
      pool(previewRef) + "&pgbouncer=true",
      pool(previewRef).replace("pgbouncer=true", "pgbouncer=false"),
      pool(previewRef).replace("sslaccept=strict", "sslaccept=accept_invalid_certs"),
      pool(previewRef).replace("sslmode=require", "sslmode=disable"),
      pool(previewRef).replace(":6543", ":5432"),
      pool(previewRef).replace("/postgres?", "/wrong?"),
      pool(previewRef).replace("postgres." + previewRef, "postgres." + otherRef),
      pool(previewRef).replace("aws-0-ap-southeast-1.pooler.supabase.com", "attacker.pooler.supabase.com.evil.test"),
    ];
    for (const DATABASE_URL of cases) {
      expect(() => assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL })).toThrow(/ditolak/);
    }
  });
  it("blocks the real Prisma entrypoint before a shared Preview can query", () => {
    const script = "try { await import('./src/lib/prisma.ts'); console.log('UNEXPECTED_ALLOW'); } catch (error) { console.log(error.message.includes('Akses database Preview ditolak') ? 'PREVIEW_BLOCKED' : 'UNEXPECTED_ERROR'); process.exitCode = 1; }";
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      encoding: "utf8", timeout: 5000,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GHEVERHAN_SHARED_DEV_DATABASE: "true",
        GHEVERHAN_PREVIEW_SUPABASE_REF: productionRef,
        DATABASE_URL: pool(productionRef),
        DIRECT_URL: direct(productionRef),
      },
    });
    expect(child.status).toBe(1);
    expect(child.stdout.trim()).toBe("PREVIEW_BLOCKED");
    expect(child.stdout + child.stderr).not.toContain("fixture-password");
    expect(child.stdout + child.stderr).not.toContain(productionRef);
    expect(child.stdout + child.stderr).not.toContain("postgresql://");
  });
  it("never exposes secret or project references in rejected errors", () => {
    try { assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: pool(productionRef) }); }
    catch (error) {
      expect(String(error)).not.toContain("fixture-password");
      expect(String(error)).not.toContain(previewRef);
      expect(String(error)).not.toContain(productionRef);
      expect(String(error)).not.toContain("postgresql://");
    }
  });
});
