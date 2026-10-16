import { describe, expect, it } from "vitest";
import { assertPreviewDatabaseIsolation } from "@/lib/preview-db-guard";

const prod = "bztprltkevacidcpjaam";
const preview = "abcdefghijklmnopqrst";
const refEnv = {
  VERCEL_ENV: "preview",
  GHEVERHAN_PRODUCTION_SUPABASE_REF: prod,
  GHEVERHAN_PREVIEW_SUPABASE_REF: preview,
};
const productionUrl = `postgresql://postgres.${prod}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const previewUrl = `postgresql://postgres.${preview}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

describe("Vercel preview database guard", () => {
  it("does not affect production/local test environments", () => {
    expect(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: "production", DATABASE_URL: productionUrl, DIRECT_URL: productionUrl })).not.toThrow();
    expect(() => assertPreviewDatabaseIsolation({ DATABASE_URL: productionUrl, DIRECT_URL: productionUrl })).not.toThrow();
  });
  it("blocks preview when shared production credentials are present", () => {
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, DATABASE_URL: productionUrl, DIRECT_URL: productionUrl })).toThrow(/koneksi ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, DATABASE_URL: previewUrl, DIRECT_URL: productionUrl })).toThrow(/koneksi ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, DATABASE_URL: productionUrl, DIRECT_URL: previewUrl })).toThrow(/koneksi ditolak/);
  });
  it("blocks preview with missing, malformed or equal project references", () => {
    expect(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: "preview", DATABASE_URL: previewUrl, DIRECT_URL: previewUrl })).toThrow();
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, GHEVERHAN_PREVIEW_SUPABASE_REF: prod, DATABASE_URL: previewUrl, DIRECT_URL: previewUrl })).toThrow();
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, GHEVERHAN_PREVIEW_SUPABASE_REF: "invalid", DATABASE_URL: previewUrl, DIRECT_URL: previewUrl })).toThrow();
  });
  it("accepts a separate approved project through supported direct and pooler URLs", () => {
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, DATABASE_URL: previewUrl,
      DIRECT_URL: `postgresql://postgres:secret@db.${preview}.supabase.co:5432/postgres` })).not.toThrow();
  });
  it("refuses generic host or missing DIRECT_URL that cannot prove isolation", () => {
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, DATABASE_URL: "postgresql://user:pw@example.com:5432/db", DIRECT_URL: previewUrl })).toThrow();
    expect(() => assertPreviewDatabaseIsolation({ ...refEnv, DATABASE_URL: previewUrl })).toThrow();
  });
  it("never exposes connection strings in errors", () => {
    try { assertPreviewDatabaseIsolation({ ...refEnv, DATABASE_URL: productionUrl, DIRECT_URL: productionUrl }); }
    catch (error) { expect(String(error)).not.toContain("secret"); expect(String(error)).not.toContain(prod); }
  });
});
