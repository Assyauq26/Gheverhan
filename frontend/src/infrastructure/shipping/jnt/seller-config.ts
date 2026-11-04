import "server-only";
import { z } from "zod";
import { HttpError } from "@/lib/http-error";
import type { AuthUser } from "@/lib/auth/session";

/**
 * Carrier config is local to each installation, not a central JetSeller tenant.
 * J&T cannot invent its own identity: AAD always uses M1's canonical UUID.
 *
 * An explicit self-hosted profile and canonical installation UUID are
 * required for any local J&T operation, including administration and AES-GCM
 * associated-data binding. The complete runtime profile is still verified by
 * the independent-store launcher; it is not inferred from a UUID alone.
 */
const INSTALLATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function canonicalInstallationId(): string {
  // An absent profile means legacy Gheverhan, even if an attacker or a
  // misconfigured deployment supplied a syntactically correct UUID.
  if (process.env.JETSELLER_STORE_PROFILE !== "self-hosted")
    throw new HttpError("Profil instalasi J&T tidak valid", 503);
  const id = process.env.JETSELLER_INSTALLATION_ID || "";
  if (!INSTALLATION_ID.test(id)) throw new HttpError("Identitas instalasi toko belum valid", 503);
  if (process.env.JNT_INSTALLATION_ID && process.env.JNT_INSTALLATION_ID !== id)
    throw new HttpError("Identitas instalasi J&T tidak cocok dengan toko", 503);
  return id;
}
export function localJntSettings() { return process.env.JNT_CONFIG_SCOPE === "local_store"; }
export function assertJntScope() {
  if (process.env.JNT_CONFIG_SCOPE && !["local_store", "legacy_platform"].includes(process.env.JNT_CONFIG_SCOPE))
    throw new HttpError("Mode konfigurasi J&T tidak valid", 503);
  if (localJntSettings()) canonicalInstallationId();
}
export function mayManageLocalJnt(user: Pick<AuthUser, "roles" | "permissions"> | null) {
  if (!user || !(user.roles.includes("Super Admin") || user.roles.includes("Admin")) ||
      !user.permissions.includes("shipping.update")) return false;
  try { canonicalInstallationId(); return true; }
  catch { return false; }
}
export function installationBinding(environment: string) {
  const id = canonicalInstallationId();
  return Buffer.from(`jetseller:jnt:v2:${id}:${environment}`, "utf8");
}
export const sellerConfigurationSchema = z.object({
  warehouse: z.object({
    name: z.string().trim().min(1).max(30),
    contact: z.string().trim().min(1).max(30),
    phone: z.string().regex(/^\+62\d{8,12}$/),
    address: z.string().trim().min(4).max(200),
    originSite: z.string().regex(/^[A-Z][A-Z0-9 -]{1,79}$/),
    originCityCode: z.string().regex(/^[A-Z0-9]{3}$/),
  }).strict(),
  // Carrier agreement evidence is recorded, not independently verified by this form.
  services: z.array(z.object({
    code: z.literal("EZ"),
    verificationReference: z.string().trim().min(4).max(160),
    validUntil: z.string().datetime(),
  }).strict()).max(1),
}).strict();
export type SellerConfiguration = z.infer<typeof sellerConfigurationSchema>;
