import { afterEach, describe, expect, it } from "vitest";
import { X509Certificate } from "node:crypto";
import { readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { rootCertificates } from "node:tls";
import { prismaRuntimeDatasourceUrl } from "../../src/lib/prisma-runtime-tls";

const ref = "bztprltkevacidcpjaam";
const base = "postgresql://postgres." + ref + ":only-a-fixture@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&sslaccept=strict&schema=public";
const ca = rootCertificates.find(pem => {
  const cert = new X509Certificate(pem);
  return cert.ca && Date.now() >= Date.parse(cert.validFrom) && Date.now() <= Date.parse(cert.validTo);
})!;
const created: string[] = [];
afterEach(() => { for (const file of created.splice(0)) rmSync(path.dirname(file), { recursive: true, force: true }); });
const bind = (DATABASE_URL = base, SUPABASE_DB_CA_CERT: string | undefined = ca, VERCEL_ENV = "production") =>
  prismaRuntimeDatasourceUrl({ DATABASE_URL, SUPABASE_DB_CA_CERT, VERCEL_ENV });

describe("Prisma 5 production TLS trust binding", () => {
  it("rejects a missing CA in production before opening a connection", () => {
    expect(() => prismaRuntimeDatasourceUrl({ DATABASE_URL: base, VERCEL_ENV: "production" })).toThrow("Konfigurasi TLS database belum dapat diverifikasi.");
  });
  it("injects a private root CA file only into the Prisma datasource URL", () => {
    const url = new URL(bind()!);
    const file = url.searchParams.get("sslcert")!;
    created.push(file);
    expect(readFileSync(file, "utf8")).toBe(ca.trim() + "\n");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
  });
  it("accepts base64-encoded CA without rewriting credentials or TLS flags", () => {
    const url = new URL(bind(base, Buffer.from(ca).toString("base64"))!);
    created.push(url.searchParams.get("sslcert")!);
    expect(url.username).toBe("postgres." + ref);
    expect(url.password).toBe("only-a-fixture");
  });
  it("does not force Production CA on unconfigured Preview", () => {
    expect(prismaRuntimeDatasourceUrl({ DATABASE_URL: base, VERCEL_ENV: "preview" })).toBeUndefined();
  });
  it.each([
    base.replace("sslaccept=strict", "sslaccept=accept_invalid_certs"),
    base.replace("sslmode=require", "sslmode=disable"),
    base.replace("pgbouncer=true", "pgbouncer=false"),
    base.replace("schema=public", "schema=other"),
    base + "&sslcert=unreviewed.pem",
    base + "&sslrootcert=unreviewed.pem",
    base + "&sslmode=require",
    base + "&host=unexpected.invalid",
    base + "&host=",
    base + "&host=%2Ftmp%2Ffixture-postgres-socket",
    base + "&h%6fst=unexpected.invalid",
    base.replace("." + ref + ":", ".otherproject:"),
  ])("rejects unsafe or off-target datasource bindings", DATABASE_URL => {
    expect(() => bind(DATABASE_URL)).toThrow("Konfigurasi TLS database belum dapat diverifikasi.");
  });
  it("rejects non-certificate data without dumping raw input", () => {
    expect(() => bind(base, "not-a-certificate-secret")).toThrow("Konfigurasi TLS database belum dapat diverifikasi.");
  });
});
