import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { getCartView } from "@/modules/cart/cart.service";
import { reserveStock } from "@/modules/inventory/inventory.service";
import { computeDiscount } from "@/modules/promotions/coupon.service";
import { getPaymentProvider } from "@/infrastructure/payments";
import { getShippingProvider } from "@/infrastructure/shipping";
import { checkoutLinesSchema, checkoutSignature, type CheckoutLines } from "./checkout.validation";
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

/**
 * Resolve a trusted shipping cost from the server-side rate table.
 * The client-submitted cost is never trusted; only courier/service are used to look it up.
 */
async function resolveShippingCost(courier: string, service: string): Promise<number> {
  const rates = (await getShippingProvider().getRates?.({ destinationCity: "", weightGram: 1000 })) ?? [];
  const match = rates.find((r) => r.courier === courier && r.service === service);
  if (!match) throw new HttpError("Metode pengiriman tidak valid", 400);
  return match.cost;
}

/** Server-side recalculation only. Client-submitted totals are ignored. */
export async function previewCheckout(
  userId: string,
  input: { couponCode?: string; shipping?: ShippingChoice },
) {
  const cart = await getCartView(userId);
  if (cart.lines.length === 0) throw new HttpError("Keranjang kosong", 400);

  const shippingCost = input.shipping
    ? await resolveShippingCost(input.shipping.courier, input.shipping.service)
    : 0;
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
    expectedLines?: CheckoutLines;
    requestId?: string;
  },
) {
  const confirmation = checkoutLinesSchema.safeParse(input.expectedLines);
  if (!confirmation.success) throw new HttpError("Muat ulang checkout dan konfirmasi harga sebelum membuat pesanan.", 409);
  if (input.requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) throw new HttpError("Request checkout tidak valid", 422);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  // Persist idempotency through the existing Order PK and transactional audit metadata.
  const orderId = input.requestId ? `chk_${hash(`${userId}:${input.requestId}`).slice(0, 40)}` : undefined;
  const requestDigest = hash(JSON.stringify({ address: Object.entries(input.address).sort(([a], [b]) => a.localeCompare(b)), shipping: { courier: input.shipping.courier, service: input.shipping.service }, bankAccountId: input.bankAccountId, couponCode: input.couponCode?.toUpperCase() || null, note: input.note || null, lines: checkoutSignature(confirmation.data) }));
  const replay = async (tx: Prisma.TransactionClient) => {
    if (!orderId) return null;
    const existing = await tx.order.findUnique({ where: { id: orderId, userId } });
    if (!existing) return null;
    const audit = await tx.auditLog.findFirst({ where: { entity: "Order", entityId: orderId, action: "order.create" } });
    const meta = audit?.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta) || meta.requestDigest !== requestDigest) throw new HttpError("Request ID sudah digunakan untuk checkout yang berbeda", 409);
    return existing;
  };
  const previous = await replay(prisma);
  if (previous) return previous;
  const cartView = await getCartView(userId);
  if (cartView.lines.length === 0) {
    const completed = await replay(prisma);
    if (completed) return completed;
    throw new HttpError("Keranjang kosong atau sudah diproses", 409);
  }
  if (cartView.lines.some(line => !line.inStock)) throw new HttpError("Produk tidak tersedia atau stok tidak mencukupi", 409);
  if (checkoutSignature(confirmation.data) !== checkoutSignature(cartView.lines)) throw new HttpError("Harga atau isi keranjang berubah. Muat ulang checkout dan konfirmasi ulang sebelum membuat pesanan.", 409);

  const bank = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, isActive: true },
  });
  if (!bank) throw new HttpError("Rekening bank tidak valid", 400);


  const shippingCost = await resolveShippingCost(input.shipping.courier, input.shipping.service);

  const orderNumber = genOrderNumber();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    // Serialize consumption of this cart; lock items too against concurrent edits/removal.
    const carts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Cart" WHERE "userId" = ${userId} FOR UPDATE`);
    const processed = await replay(tx);
    if (processed) return { order: processed, created: false };
    if (!carts.length) throw new HttpError("Keranjang kosong atau sudah diproses", 409);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CartItem" WHERE "cartId" = ${carts[0].id} ORDER BY "id" FOR UPDATE`);
    // Catalog locks match product management's Product -> Variant -> Inventory order.
    const productIds = [...new Set(cartView.lines.map(line => line.product.id))].sort();
    const published = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Product"
      WHERE "id" IN (${Prisma.join(productIds)}) AND "status" = 'PUBLISHED'
      ORDER BY "id" FOR SHARE
    `);
    if (published.length !== productIds.length) throw new HttpError("Produk tidak lagi tersedia. Periksa keranjang Anda.", 409);
    const variantIds = cartView.lines.map(l => l.variantId).sort();
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ProductVariant" WHERE "id" IN (${Prisma.join(variantIds)}) ORDER BY "id" FOR SHARE`);
    const current = await getCartView(userId, tx);
    if (!current.lines.length) throw new HttpError("Keranjang sudah diproses. Periksa pesanan Anda.", 409);
    if (checkoutSignature(current.lines) !== checkoutSignature(confirmation.data)) throw new HttpError("Harga atau isi keranjang berubah. Muat ulang checkout dan konfirmasi ulang sebelum membuat pesanan.", 409);
    if (current.lines.some(l => !l.inStock || !Number.isSafeInteger(l.quantity) || l.quantity <= 0)) throw new HttpError("Produk tidak tersedia atau stok tidak mencukupi", 409);
    const lockedBank = await tx.bankAccount.findFirst({ where: { id: bank.id, isActive: true } });
    if (!lockedBank) throw new HttpError("Rekening bank tidak valid", 409);
    if (input.couponCode) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Coupon" WHERE "code" = ${input.couponCode.toUpperCase()} FOR SHARE`);
    const { discount, code } = await computeDiscount(input.couponCode, current.subtotal, tx);
    const total = current.subtotal + shippingCost - discount;
    if (![current.subtotal, shippingCost, discount, total].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2_147_483_647)) throw new HttpError("Total pesanan tidak valid", 422);
    const created = await tx.order.create({
      data: {
        ...(orderId ? { id: orderId } : {}),
        orderNumber,
        userId,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING_PAYMENT",
        subtotal: current.subtotal,
        shippingCost,
        discount,
        total,
        couponCode: code,
        note: input.note,
        expiresAt,
        items: {
          create: current.lines.map((l) => ({
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

    for (const line of [...current.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
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
      { userId, action: "order.create", entity: "Order", entityId: created.id, meta: { orderNumber, total, requestDigest } },
      tx,
    );
    return { order: created, created: true };
  });
  const { order } = result;
  if (!result.created) return order;

  // Build payment instruction via provider abstraction (manual MVP).
  const provider = getPaymentProvider("manual");
  await provider.createPayment({
    orderNumber,
    amount: order.total,
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
