/**
 * Bind a reviewed Supabase server CA to Prisma 5.x's Rust query engine at runtime.
 * NODE_EXTRA_CA_CERTS and libpq sslrootcert are not substitutes for Prisma 5 sslcert.
 * Only the PrismaClient datasource override is changed; stored env values remain intact.
 */
import { X509Certificate } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type Env = Readonly<Record<string, string | undefined>>;
const PROJECT_REF = "bztprltkevacidcpjaam";
const SHARED_POOLER = "aws-0-ap-southeast-1.pooler.supabase.com";
const failure = (): never => {
  // Never include URLs, certificate contents, filesystem paths or credentials in errors.
  throw new Error("Konfigurasi TLS database belum dapat diverifikasi.");
};

function checkedCa(input: string | undefined): string {
  if (!input || input.length > 100_000) return failure();
  let pem = input.trim();
  if (!pem.startsWith("-----BEGIN CERTIFICATE-----")) {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(pem)) return failure();
    pem = Buffer.from(pem, "base64").toString("utf8").trim();
  }
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks?.length || blocks.length > 8 || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, "").trim()) return failure();
  try {
    const now = Date.now();
    for (const block of blocks) {
      const cert = new X509Certificate(block);
      if (!cert.ca || now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) return failure();
    }
  } catch { return failure(); }
  return blocks.join("\n") + "\n";
}

function checkedDatabaseUrl(raw: string | undefined, ref: string): URL {
  if (!raw || !/^[a-z0-9]{20}$/.test(ref)) return failure();
  try {
    const url = new URL(raw);
    const keys = [...url.searchParams.keys()];
    const hostname = url.hostname.toLowerCase();
    const username = decodeURIComponent(url.username);
    const direct = hostname === "db." + ref + ".supabase.co" &&
      (url.port || "5432") === "5432" && username === "postgres";
    const pooler = hostname === SHARED_POOLER && ["5432", "6543"].includes(url.port) &&
      username === "postgres." + ref;
    const flag = url.searchParams.getAll("pgbouncer");
    // Prisma 5.22 gives ?host= precedence over URL.hostname, including socket paths.
    // Reject it so validation and the native engine select the same endpoint.
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" || url.hash ||
        !url.password || (!direct && !pooler) || keys.length !== new Set(keys).size ||
        (url.searchParams.get("schema") || "public") !== "public" ||
        url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict" ||
        ["host", "sslcert", "sslrootcert", "sslidentity", "sslpassword"].some(key => url.searchParams.has(key)) ||
        (url.port === "6543" ? flag.length !== 1 || flag[0] !== "true" : flag.length !== 0)) return failure();
    return url;
  } catch { return failure(); }
}

/**
 * Vercel Production and explicitly isolated Preview both fail closed without
 * their own reviewed CA binding. Production still targets the fixed project.
 * Preview may use only the distinct ref already validated by preview-db-guard.
 * Keep the CA file alive for the full PrismaClient process lifetime.
 */
export function prismaRuntimeDatasourceUrl(env: Env): string | undefined {
  const preview = env.VERCEL_ENV === "preview";
  const production = env.VERCEL_ENV === "production";
  if (!production && !preview && !env.SUPABASE_DB_CA_CERT) return undefined;
  const ref = preview ? env.GHEVERHAN_PREVIEW_SUPABASE_REF?.trim() || "" : PROJECT_REF;
  if (preview && (ref === PROJECT_REF || env.GHEVERHAN_SHARED_DEV_DATABASE === "true")) return failure();
  const url = checkedDatabaseUrl(env.DATABASE_URL, ref);
  const pem = checkedCa(env.SUPABASE_DB_CA_CERT);
  const dir = mkdtempSync(path.join(tmpdir(), "gheverhan-prisma-runtime-ca-"));
  try {
    const file = path.join(dir, "ca.pem");
    writeFileSync(file, pem, { mode: 0o600, flag: "wx" });
    // Prisma 5.x uses sslcert as a server CA path (unlike libpq sslrootcert).
    url.searchParams.set("sslcert", file);
    return url.toString();
  } catch { rmSync(dir, { recursive: true, force: true }); return failure(); }
}
