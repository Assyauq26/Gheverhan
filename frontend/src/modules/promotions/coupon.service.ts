import { prisma } from "@/lib/prisma";
import { DiscountType, type Prisma } from "@prisma/client";

/** Returns discount amount (integer Rupiah) for a coupon against a subtotal. */
export async function computeDiscount(
  code: string | undefined | null,
  subtotal: number,
  client: Prisma.TransactionClient = prisma,
  userId?: string,
): Promise<{ discount: number; code: string | null; reason?: string }> {
  if (!code) return { discount: 0, code: null };
  const coupon = await client.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) return { discount: 0, code: null, reason: "Kupon tidak valid" };
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now)
    return { discount: 0, code: null, reason: "Kupon belum mulai berlaku" };
  if (coupon.expiresAt && coupon.expiresAt <= now)
    return { discount: 0, code: null, reason: "Kupon kedaluwarsa" };
  // All completed order creations count as redeemed, including cancelled/unpaid orders.
  // createOrder holds an exclusive coupon row lock, so two concurrent requests
  // cannot both pass the last available redemption quota.
  if (coupon.usageLimit != null) {
    const used = await client.order.count({ where: { couponCode: coupon.code } });
    if (used >= coupon.usageLimit)
      return { discount: 0, code: null, reason: "Kuota kupon telah habis" };
  }
  if (coupon.perUserLimit != null) {
    if (!userId) return { discount: 0, code: null, reason: "Identitas pelanggan diperlukan" };
    const usedByCustomer = await client.order.count({ where: { couponCode: coupon.code, userId } });
    if (usedByCustomer >= coupon.perUserLimit)
      return { discount: 0, code: null, reason: "Batas penggunaan kupon Anda telah tercapai" };
  }
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
