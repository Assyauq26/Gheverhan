/**
 * A Vercel Preview must never connect to Gheverhan's Production Supabase DB.
 * Legacy GHEVERHAN_SHARED_DEV_DATABASE=true is intentionally NOT an override.
 *
 * A separately approved Preview Supabase project requires an explicit project
 * ref, and BOTH database URLs must resolve to this distinct project's host.
 *
 * This only protects code importing the application Prisma client. It does not
 * revoke immutable historical deployments, arbitrary SQL clients or webhooks.
 * Do not log DSNs, credentials, refs or provider messages in errors.
 */
type PreviewEnv = Record<string, string | undefined>;
const PRODUCTION_REF = "bztprltkevacidcpjaam";
const REF = /^[a-z0-9]{20}$/;
const DENIED = "Akses database Preview ditolak: database terpisah belum dikonfigurasi/valid.";

function matchesIsolatedPreview(raw: string | undefined, ref: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        url.pathname !== "/postgres" || !url.password || url.hash ||
        (url.searchParams.get("schema") !== null && url.searchParams.get("schema") !== "public") ||
        url.searchParams.get("sslmode") !== "require" ||
        url.searchParams.get("sslaccept") !== "strict") return false;
    const keys = [...url.searchParams.keys()];
    if (keys.length !== new Set(keys).size ||
        ["host", "sslcert", "sslrootcert", "sslidentity", "sslpassword"].some(k => url.searchParams.has(k))) return false;
    const host = url.hostname.toLowerCase();
    const user = decodeURIComponent(url.username);
    const direct = host === "db." + ref + ".supabase.co" &&
      (url.port || "5432") === "5432" && user === "postgres";
    const pooler = host === "aws-0-ap-southeast-1.pooler.supabase.com" &&
      ["5432", "6543"].includes(url.port) && user === "postgres." + ref;
    if (!direct && !pooler) return false;
    const flags = url.searchParams.getAll("pgbouncer");
    return url.port === "6543"
      ? flags.length === 1 && flags[0] === "true"
      : flags.length === 0;
  } catch {
    return false;
  }
}

export function assertPreviewDatabaseIsolation(env: PreviewEnv): void {
  if (env.VERCEL_ENV !== "preview") return;
  const ref = env.GHEVERHAN_PREVIEW_SUPABASE_REF?.trim() || "";
  if (!REF.test(ref) || ref === PRODUCTION_REF ||
      env.GHEVERHAN_SHARED_DEV_DATABASE === "true" ||
      !matchesIsolatedPreview(env.DATABASE_URL, ref) ||
      !matchesIsolatedPreview(env.DIRECT_URL, ref)) {
    throw new Error(DENIED);
  }
}
