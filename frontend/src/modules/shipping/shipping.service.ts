import { prisma } from "@/lib/prisma";
import { ShipmentStatus } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { transitionOrder } from "@/modules/orders/orders.service";

/** Admin assigns / updates manual shipment (courier, service, resi, dates, status). */
export async function upsertManualShipment(
  orderId: string,
  adminId: string,
  input: {
    courier: string;
    service: string;
    cost: number;
    trackingNumber?: string;
    shippedDate?: Date | null;
    estimatedDelivery?: Date | null;
    status: ShipmentStatus;
    notes?: string;
  },
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError("Order tidak ditemukan", 404);

  const shipment = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.upsert({
      where: { orderId },
      create: {
        orderId,
        provider: "manual",
        courier: input.courier,
        service: input.service,
        cost: input.cost,
        trackingNumber: input.trackingNumber,
        shippedDate: input.shippedDate ?? undefined,
        estimatedDelivery: input.estimatedDelivery ?? undefined,
        status: input.status,
        notes: input.notes,
      },
      update: {
        courier: input.courier,
        service: input.service,
        cost: input.cost,
        trackingNumber: input.trackingNumber,
        shippedDate: input.shippedDate ?? undefined,
        estimatedDelivery: input.estimatedDelivery ?? undefined,
        status: input.status,
        notes: input.notes,
      },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: s.id,
        status: input.status,
        description: describeStatus(input.status, input.trackingNumber),
      },
    });
    await writeAudit(
      { userId: adminId, action: "shipping.update", entity: "Shipment", entityId: s.id, meta: { orderId, status: input.status } },
      tx,
    );
    return s;
  });

  // Reflect shipment progress onto order state where the transition is valid.
  const desired =
    input.status === "SHIPPED" || input.status === "IN_TRANSIT"
      ? "SHIPPED"
      : input.status === "DELIVERED"
        ? "DELIVERED"
        : input.status === "PROCESSING"
          ? "PROCESSING"
          : null;
  if (desired) {
    await transitionOrder(orderId, desired, adminId, `Shipment: ${input.status}`).catch(() => {});
  }

  return shipment;
}

function describeStatus(status: ShipmentStatus, resi?: string): string {
  switch (status) {
    case "PENDING":
      return "Menunggu diproses";
    case "PROCESSING":
      return "Pesanan sedang disiapkan";
    case "SHIPPED":
      return `Paket diserahkan ke kurir${resi ? ` (Resi: ${resi})` : ""}`;
    case "IN_TRANSIT":
      return "Paket dalam perjalanan";
    case "DELIVERED":
      return "Paket telah diterima";
  }
}

export function getShipmentByOrder(orderId: string) {
  return prisma.shipment.findUnique({
    where: { orderId },
    include: { events: { orderBy: { occurredAt: "asc" } } },
  });
}
