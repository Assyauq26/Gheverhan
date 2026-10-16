import { z } from "zod";

const rupiah = z.number().int().min(0).max(2_147_483_647);
export const voucherInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, "Kode voucher harus 3–32 karakter huruf, angka, - atau _"),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().int().min(1).max(2_147_483_647),
  minSpend: rupiah,
  maxDiscount: rupiah.nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  isActive: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.discountType === "PERCENT" && v.discountValue > 100)
    ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Persentase tidak boleh melebihi 100%" });
  if (v.maxDiscount === 0) ctx.addIssue({ code: "custom", path: ["maxDiscount"], message: "Batas diskon harus lebih dari Rp0" });
  if (v.expiresAt && v.isActive && new Date(v.expiresAt).getTime() <= Date.now())
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Tanggal berakhir harus di masa depan untuk voucher aktif" });
});
export type VoucherInput = z.infer<typeof voucherInputSchema>;

export const flashSaleInputSchema = z.object({
  productId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  enabled: z.boolean(),
  salePrice: z.number().int().min(1).max(2_147_483_647).nullable(),
}).superRefine((v, ctx) => {
  if (v.enabled && v.salePrice == null)
    ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Harga flash sale wajib diisi" });
});
