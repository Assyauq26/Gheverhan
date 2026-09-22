import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { getCartView } from "@/modules/cart/cart.service";
import { reserveStock } from "@/modules/inventory/inventory.service";
import { computeDiscount } from "@/modules/promotions/coupon.service";
import { getPaymentProvider } from "@/infrastructure/payments";
import { writeAudit } from "@/modules/audit/audit.service";

export interface AddressInput {
  recipientName: string;
  phone: string;
  line: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface ShippingChoice {
  courier: string;
  service: string;
  cost: number;
}

function genOrderNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GHV-${t}-${r}`;
}

/** Server-side recalculation only. Client-submitted totals are ignored. */
export async function previewCheckout(
  userId: string,
  input: { couponCode?: string; shipping?: ShippingChoice },
) {
  const cart = await getCartView(userId);
  if (cart.lines.length === 0) throw new HttpError("Keranjang kosong", 400);

  const shippingCost = input.shipping?.cost ?? 0;
  const { discount, code, reason } = await computeDiscount(input.couponCode, cart.subtotal);
  const total = cart.subtotal + shippingCost - discount;
  return {
    lines: cart.lines,
    subtotal: cart.subtotal,
    shippingCost,
    discount,
    couponCode: code,
    couponReason: reason ?? null,
    total,
  };
}

export async function createOrder(
  userId: string,
  input: {
    address: AddressInput;
    shipping: ShippingChoice;
    couponCode?: string;
    bankAccountId: string;
    note?: string;
  },
) {
  const cartView = await getCartView(userId);
  if (cartView.lines.length === 0) throw new HttpError("Keranjang kosong", 400);

  const bank = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, isActive: true },
  });
  if (!bank) throw new HttpError("Rekening bank tidak valid", 400);

  const { discount, code } = await computeDiscount(input.couponCode, cartView.subtotal);
  const shippingCost = input.shipping.cost;
  const total = cartView.subtotal + shippingCost - discount;
  const orderNumber = genOrderNumber();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING_PAYMENT",
        subtotal: cartView.subtotal,
        shippingCost,
        discount,
        total,
        couponCode: code,
        note: input.note,
        expiresAt,
        items: {
          create: cartView.lines.map((l) => ({
            variantId: l.variantId,
            productName: l.product.name,
            variantLabel: l.variantLabel,
            imageUrl: l.product.image,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
        },
        address: { create: input.address },
        history: {
          create: { toStatus: "PENDING_PAYMENT", note: "Order dibuat", createdBy: userId },
        },
      },
    });

    for (const line of cartView.lines) {
      await reserveStock(tx, line.variantId, line.quantity, created.orderNumber);
    }

    await tx.payment.create({
      data: {
        orderId: created.id,
        provider: "manual",
        method: "bank_transfer",
        amount: total,
        status: "PENDING_PAYMENT",
        bankAccountId: bank.id,
      },
    });

    // clear cart
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    await writeAudit(
      { userId, action: "order.create", entity: "Order", entityId: created.id, meta: { orderNumber, total } },
      tx,
    );
    return created;
  });

  // Build payment instruction via provider abstraction (manual MVP).
  const provider = getPaymentProvider("manual");
  await provider.createPayment({
    orderNumber,
    amount: total,
    bankAccount: {
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountHolder: bank.accountHolder,
      displayName: bank.displayName,
    },
    expiresAt,
  });

  return order;
}
