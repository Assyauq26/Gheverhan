import "server-only";
import { z } from "zod";
import { HttpError } from "@/lib/http-error";
import type { AuthUser } from "@/lib/auth/session";

/** Independent opt-in until the general M1 profile is integrated in a reviewed PR. */
export function localJntSettings() { return process.env.JNT_CONFIG_SCOPE === "local_store"; }
export function assertJntScope() {
  if (process.env.JNT_CONFIG_SCOPE && !["local_store", "legacy_platform"].includes(process.env.JNT_CONFIG_SCOPE))
    throw new HttpError("Mode konfigurasi J&T tidak valid", 503);
}
export function mayManageLocalJnt(user: Pick<AuthUser, "roles" | "permissions"> | null) {
  return !!user && (user.roles.includes("Super Admin") || user.roles.includes("Admin")) &&
    user.permissions.includes("shipping.update");
}
export function installationBinding(environment: string) {
  const id = process.env.JNT_INSTALLATION_ID || "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) throw new HttpError("Identitas instalasi J&T belum dikonfigurasi", 503);
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
