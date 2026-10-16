/**
 * DB guard for Vercel previews. Prevents shared production/preview secrets
 * from silently connecting a PR build to the production Supabase project.
 *
 * This complements (does NOT replace) environment scoping on Vercel.
 * It checks only Supabase URL host / username: never inspect or print passwords.
 */
type PreviewEnv = Pick<NodeJS.ProcessEnv,
  "VERCEL_ENV" | "DATABASE_URL" | "DIRECT_URL" |
  "GHEVERHAN_PRODUCTION_SUPABASE_REF" | "GHEVERHAN_PREVIEW_SUPABASE_REF">;

const refPattern = /^[a-z0-9]{20}$/;

function isSupabaseProjectUrl(raw: string | undefined, ref: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (!["postgresql:", "postgres:"].includes(url.protocol)) return false;
    const username = decodeURIComponent(url.username);
    const hostname = url.hostname.toLowerCase();
    // Supabase direct connection: db.<project-ref>.supabase.co
    // Supabase pooler connection: postgres.<project-ref>@<region>.pooler.supabase.com
    return (hostname === `db.${ref}.supabase.co`) ||
      (hostname.endsWith(".pooler.supabase.com") && username === `postgres.${ref}`);
  } catch {
    return false;
  }
}

export function assertPreviewDatabaseIsolation(env: PreviewEnv): void {
  if (env.VERCEL_ENV !== "preview") return; // local and production unchanged
  const productionRef = env.GHEVERHAN_PRODUCTION_SUPABASE_REF?.trim().toLowerCase() ?? "";
  const previewRef = env.GHEVERHAN_PREVIEW_SUPABASE_REF?.trim().toLowerCase() ?? "";
  const configured = refPattern.test(productionRef) && refPattern.test(previewRef) && productionRef !== previewRef;
  if (!configured ||
      !isSupabaseProjectUrl(env.DATABASE_URL, previewRef) ||
      !isSupabaseProjectUrl(env.DIRECT_URL, previewRef) ||
      isSupabaseProjectUrl(env.DATABASE_URL, productionRef) ||
      isSupabaseProjectUrl(env.DIRECT_URL, productionRef)) {
    // Do not include environment values/URLs: they contain credentials.
    throw new Error("Vercel Preview database belum diisolasi; koneksi ditolak untuk melindungi production.");
  }
}
