import { productInputSchema } from "./product-management.validation";
import { assertPublishWeight } from "./product-shipping";
import { combinationCount } from "./variation-domain";
/** Local readiness is guidance. Uniqueness, ownership and permissions remain authoritative on the server. */
export function productPublishReadiness(value: unknown): { ready: boolean; reason: string } {
  const parsed = productInputSchema.safeParse(value);
  if (!parsed.success) return { ready: false, reason: parsed.error.issues[0].message };
  const input = parsed.data;
  if (!input.images.length) return { ready: false, reason: "Tambahkan minimal satu foto produk." };
  try { assertPublishWeight(input.weightGrams); }
  catch { return { ready: false, reason: "Isi berat paket sebelum menerbitkan produk." }; }
  if (input.optionsEnabled && input.optionGroups?.length && input.variants.length !== combinationCount(input.optionGroups))
    return { ready: false, reason: "Buat seluruh kombinasi SKU sebelum menerbitkan produk." };
  return { ready: true, reason: "Siap diajukan terbit. Server akan memeriksa SKU dan data produk." };
}
