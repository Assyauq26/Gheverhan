import { describe, expect, it } from "vitest";
import { assertPreviewDatabaseIsolation } from "@/lib/preview-db-guard";

const approved = "bztprltkevacidcpjaam";
const unapproved = "abcdefghijklmnopqrst";
const direct = `postgresql://postgres:secret@db.${approved}.supabase.co:5432/postgres`;
const pool = `postgresql://postgres.${approved}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const other = `postgresql://postgres.${unapproved}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
const allowed = {
  VERCEL_ENV: "preview",
  GHEVERHAN_SHARED_DEV_DATABASE: "true",
  DATABASE_URL: pool,
  DIRECT_URL: direct,
};

describe("shared dummy-data Preview DB guard", () => {
  it("keeps production and local DB connections unchanged", () => {
    expect(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: "production", DATABASE_URL: direct })).not.toThrow();
    expect(() => assertPreviewDatabaseIsolation({ DATABASE_URL: direct })).not.toThrow();
  });
  it("requires an intentional Preview opt-in (not truthy aliases)", () => {
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, GHEVERHAN_SHARED_DEV_DATABASE: undefined })).toThrow(/ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, GHEVERHAN_SHARED_DEV_DATABASE: "1" })).toThrow(/ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, GHEVERHAN_SHARED_DEV_DATABASE: "TRUE" })).toThrow(/ditolak/);
  });
  it("accepts only the existing approved Supabase development project", () => {
    expect(() => assertPreviewDatabaseIsolation(allowed)).not.toThrow();
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: direct, DIRECT_URL: pool })).not.toThrow();
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: other })).toThrow(/ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DIRECT_URL: other })).toThrow(/ditolak/);
  });
  it("rejects missing, generic or malformed connection strings", () => {
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DIRECT_URL: undefined })).toThrow(/ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: "postgresql://postgres:secret@evil.example/db" })).toThrow(/ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: "file:///tmp/anything" })).toThrow(/ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: "not-a-url" })).toThrow(/ditolak/);
  });
  it("rejects incorrect usernames even at approved hosts", () => {
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: `postgresql://wrong:secret@db.${approved}.supabase.co/postgres` })).toThrow(/ditolak/);
    expect(() => assertPreviewDatabaseIsolation({ ...allowed, DIRECT_URL: `postgresql://postgres.${unapproved}:secret@aws-0-ap-southeast-1.pooler.supabase.com/postgres` })).toThrow(/ditolak/);
  });
  it("never reveals DSN credentials or reference in errors", () => {
    try { assertPreviewDatabaseIsolation({ ...allowed, DATABASE_URL: other }); }
    catch (error) { expect(String(error)).not.toContain("secret"); expect(String(error)).not.toContain(approved); expect(String(error)).not.toContain(unapproved); }
  });
});
