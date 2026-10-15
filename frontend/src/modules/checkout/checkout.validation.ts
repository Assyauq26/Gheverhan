import { z } from "zod";

/** A confirmation, never a source of prices: compare with locked database values. */
export const checkoutLinesSchema = z.array(z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().positive().max(2_147_483_647),
  unitPrice: z.number().int().positive().max(2_147_483_647),
})).min(1).max(100).refine(lines => new Set(lines.map(l => l.variantId)).size === lines.length, "Varian duplikat");
export type CheckoutLines = z.infer<typeof checkoutLinesSchema>;
export function checkoutSignature(lines: CheckoutLines) {
  return JSON.stringify(lines.map(({ variantId, quantity, unitPrice }) => ({ variantId, quantity, unitPrice })).sort((a, b) => a.variantId.localeCompare(b.variantId)));
}
