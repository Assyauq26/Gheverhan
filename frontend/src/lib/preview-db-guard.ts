/**
 * Preview database guard for Gheverhan's explicitly approved DUMMY-DATA
 * single-database development phase (Production + Preview on one Supabase).
 *
 * A preview must opt in AND both DSNs must identify the verified dev project.
 * The opt-in must be removed before any real customer/payment data is stored.
 *
 * Never log database URLs, which include credentials. This runtime guard does
 * NOT protect migrations, Prisma CLI or arbitrary direct database clients.
 */
type PreviewEnv = Record<string, string | undefined>;
const APPROVED_DEV_PROJECT_REF = "bztprltkevacidcpjaam";

function isApprovedSupabaseConnection(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return false;
    const host = url.hostname.toLowerCase();
    const user = decodeURIComponent(url.username);
    // Direct: db.<ref>.supabase.co as postgres.
    if (host === `db.${APPROVED_DEV_PROJECT_REF}.supabase.co`) return user === "postgres";
    // Pooler: postgres.<ref>@<region>.pooler.supabase.com
    return host.endsWith(".pooler.supabase.com") &&
      host !== ".pooler.supabase.com" && user === `postgres.${APPROVED_DEV_PROJECT_REF}`;
  } catch {
    return false;
  }
}

export function assertPreviewDatabaseIsolation(env: PreviewEnv): void {
  if (env.VERCEL_ENV !== "preview") return;
  const enabled = env.GHEVERHAN_SHARED_DEV_DATABASE === "true";
  if (!enabled ||
      !isApprovedSupabaseConnection(env.DATABASE_URL) ||
      !isApprovedSupabaseConnection(env.DIRECT_URL)) {
    throw new Error("Akses database Preview ditolak: single development database belum disetujui/valid.");
  }
}
