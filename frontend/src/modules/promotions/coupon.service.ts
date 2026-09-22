import { prisma } from "@/lib/prisma";
import { DiscountType } from "@prisma/client";

/** Returns discount amount (integer Rupiah) for a coupon against a subtotal. */
export async function computeDiscount(
  code: string | undefined | null,
  subtotal: number,
): Promise<{ discount: number; code: string | null; reason?: string }> {
  if (!code) return { discount: 0, code: null };
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) return { discount: 0, code: null, reason: "Kupon tidak valid" };
  if (coupon.expiresAt && coupon.expiresAt < new Date())
    return { discount: 0, code: null, reason: "Kupon kedaluwarsa" };
  if (subtotal < coupon.minSpend)
    return { discount: 0, code: null, reason: "Belanja belum memenuhi minimum" };

  let discount =
    coupon.discountType === DiscountType.PERCENT
      ? Math.round((subtotal * coupon.discountValue) / 100)
      : coupon.discountValue;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);
  return { discount, code: coupon.code };
}
