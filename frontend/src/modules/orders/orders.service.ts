import { prisma } from "@/lib/prisma";
import { OrderStatus, Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { canTransitionOrder } from "@/modules/orders/domain/state-machine";
import { releaseStock } from "@/modules/inventory/inventory.service";
import { writeAudit } from "@/modules/audit/audit.service";

const orderInclude = {
  items: true,
  address: true,
  payment: { include: { bankAccount: true, confirmations: { orderBy: { createdAt: "desc" } } } },
  shipment: { include: { events: { orderBy: { occurredAt: "asc" } } } },
  history: { orderBy: { createdAt: "asc" } },
  user: { select: { name: true, email: true, phone: true } },
} satisfies Prisma.OrderInclude;

export function listOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: true, payment: true, shipment: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderForUser(userId: string, id: string) {
  const order = await prisma.order.findFirst({
    where: { id, userId },
    include: orderInclude,
  });
  if (!order) throw new HttpError("Order tidak ditemukan", 404);
  return order;
}

export function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id }, include: orderInclude });
}

export function listOrdersAdmin(params: { status?: OrderStatus; search?: string } = {}) {
  return prisma.order.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { orderNumber: { contains: params.search, mode: "insensitive" } },
              { user: { email: { contains: params.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { items: true, payment: true, shipment: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Server-authoritative status transition with history + audit + inventory side effects. */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorId: string,
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new HttpError("Order tidak ditemukan", 404);
    if (order.status === to) return order;
    if (!canTransitionOrder(order.status, to)) {
      throw new HttpError(`Transisi ${order.status} -> ${to} tidak diizinkan`, 409);
    }

    // Release reserved stock on cancel/expire (before it becomes a sale).
    if (
      (to === "CANCELLED" || to === "EXPIRED") &&
      order.status === "PENDING_PAYMENT"
    ) {
      for (const item of order.items) {
        await releaseStock(tx, item.variantId, item.quantity, order.orderNumber);
      }
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: to },
    });
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: order.status, toStatus: to, note, createdBy: actorId },
    });
    await writeAudit(
      { userId: actorId, action: "order.transition", entity: "Order", entityId: orderId, meta: { from: order.status, to } },
      tx,
    );
    return updated;
  });
}

/** Expire pending orders past their deadline (used by checkout guard / cron). */
export async function expireStaleOrders(actorId = "system") {
  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", expiresAt: { lt: new Date() } },
    select: { id: true },
  });
  for (const o of stale) {
    await transitionOrder(o.id, "EXPIRED", actorId, "Kedaluwarsa otomatis").catch(() => {});
  }
  return stale.length;
}
