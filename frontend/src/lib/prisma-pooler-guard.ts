/** Prisma 5 requires explicit compatibility mode on Supavisor transaction endpoints.
 * Validate only; never rewrite credentials/connection mode or log a DSN.
 * Missing bindings remain subject to the existing Prisma/target/startup checks.
 */
export function assertPrismaPoolerCompatibility(raw: string | undefined): void {
  if (!raw) return;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Konfigurasi database tidak valid."); }
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    const flags = url.searchParams.getAll("pgbouncer");
    if (flags.length !== 1 || flags[0] !== "true") {
      throw new Error("Konfigurasi kompatibilitas transaction pooler Prisma belum valid.");
    }
  }
}
