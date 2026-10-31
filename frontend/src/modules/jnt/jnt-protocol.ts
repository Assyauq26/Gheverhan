import { createHash } from "node:crypto";
import { z } from "zod";

/** Endpoint list is intentionally fixed to J&T-owned hosts and documented paths.
 * A credential settings page must never become an arbitrary SSRF proxy. */
import { hostFor, pathFor } from "./jnt-public";
import type { JntEnvironment, JntKind } from "./jnt-public";
export { credentialKeys, defaultJntEndpoint, jntKinds, jntEnvironments } from "./jnt-public";
export type { JntKind, JntEnvironment } from "./jnt-public";
export function validateJntEndpoint(environment: JntEnvironment, kind: JntKind, value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Endpoint J&T tidak valid"); }
  if (url.protocol !== "https:" || url.hostname !== hostFor[environment][kind] ||
      url.pathname !== pathFor[kind] || url.port || url.username || url.password ||
      url.search || url.hash || url.origin !== "https://" + hostFor[environment][kind]) {
    throw new Error("Endpoint harus sesuai host dan path resmi J&T untuk jenis API dan environment tersebut");
  }
  return url.toString();
}
export function signJntData(data: string, key: string) {
  // J&T's documented PHP form is base64_encode(md5($data.$key)):
  // Base64 of the 32-character MD5 hexadecimal text, NOT the raw 16 bytes.
  return Buffer.from(createHash("md5").update(data + key, "utf8").digest("hex"), "utf8").toString("base64");
}
export const tariffInputSchema = z.object({
  originCity: z.string().trim().regex(/^[A-Z][A-Z .-]{1,49}$/),
  destinationDistrict: z.string().trim().regex(/^[A-Z][A-Z .-]{1,49}$/),
  weightKg: z.number().positive().max(100).refine(w => Math.round(w * 100) === w * 100),
  productType: z.enum(["EZ", "HBO", "JND", "ECO"]),
}).strict();
export function parseJntTariffs(response: unknown, expectedService: string) {
  const obj = z.object({
    is_success: z.union([z.boolean(), z.enum(["true", "false"])]),
    content: z.union([z.string(), z.array(z.unknown())]),
  }).passthrough().parse(response);
  if (obj.is_success !== true && obj.is_success !== "true") throw new Error("J&T menolak permintaan tarif");
  const items: unknown = typeof obj.content === "string" ? JSON.parse(obj.content) : obj.content;
  const parsed = z.array(z.object({
    cost: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
    name: z.string(),
    productType: z.string(),
  }).passthrough()).max(20).parse(items);
  const chosen = parsed.filter(rate => rate.productType === expectedService && rate.name === expectedService);
  return chosen.map(rate => {
    const cost = Number(rate.cost);
    if (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647) throw new Error("Nominal ongkir J&T tidak valid");
    return { courier: "J&T Express", service: rate.productType, cost, mode: "official" as const };
  });
}
