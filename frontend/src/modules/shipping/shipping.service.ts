import { shipmentOrderTarget } from "./shipping-policy";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ShipmentStatus } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { transitionOrderInTransaction } from "@/modules/orders/orders.service";
import { assertStaffPermission, lockOrder } from "@/modules/orders/transaction-locks";
import { assertNoActiveRefund } from "@/modules/payments/refund-state";
import { manualShipmentSchema } from "./shipment.validation";

/** Manual recording only: no external carrier API or remote dispatch inside this transaction. */
export async function upsertManualShipment(orderId: string, adminId: string, value: {
  courier: string; service: string; cost: number; status: ShipmentStatus;
  trackingNumber?: string; shippedDate?: Date | null; estimatedDelivery?: Date | null;
  notes?: string; requestId?: string;
}) {
  const input = manualShipmentSchema.parse(value);
  const { requestId, ...data } = input;
  const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const fingerprint = hash(data);
  const auditId = requestId ? `shipreq_${hash([orderId, requestId]).slice(0, 40)}` : undefined;
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, adminId, PERMISSIONS.SHIPPING_UPDATE);
    await lockOrder(tx, orderId);
    if (auditId) {
      const previous = await tx.auditLog.findUnique({ where: { id: auditId } });
      if (previous) {
        const meta = previous.meta;
        if (!meta || typeof meta !== "object" || Array.isArray(meta) || meta.fingerprint !== fingerprint) throw new HttpError("Request shipment digunakan untuk payload berbeda", 409);
        return tx.shipment.findUniqueOrThrow({ where: { orderId } });
      }
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, shipment: true } });
    const target = shipmentOrderTarget({ status: order.status, paymentStatus: order.paymentStatus, paymentStatusActual: order.payment?.status, shipmentStatus: order.shipment?.status ?? null }, input.status);
    if (!order.payment) throw new HttpError("Pembayaran tidak ditemukan", 409);
    await assertNoActiveRefund(tx, order.payment.id);
    const merged = { ...order.shipment, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
    if (["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(input.status) && !merged.trackingNumber) throw new HttpError("Nomor resi diperlukan sebelum pengiriman", 422);
    const changed = !order.shipment || ["courier", "service", "cost", "status", "trackingNumber", "shippedDate", "estimatedDelivery", "notes"].some(key => {
      const before = (order.shipment as unknown as Record<string, unknown>)[key]; const after = (merged as Record<string, unknown>)[key];
      return (before instanceof Date ? before.toISOString() : before ?? null) !== (after instanceof Date ? after.toISOString() : after ?? null);
    });
    if (target) await transitionOrderInTransaction(tx, orderId, target, adminId, `Shipment: ${input.status}`, { source: "shipment" });
    const shipment = changed ? await tx.shipment.upsert({ where: { orderId }, create: { orderId, provider: "manual", ...data }, update: data }) : order.shipment!;
    if (changed) {
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: input.status, description: `Manual shipment: ${input.status}${input.trackingNumber ? ` (${input.trackingNumber})` : ""}` } });
      await writeAudit({ userId: adminId, action: "shipping.update", entity: "Shipment", entityId: shipment.id, meta: { orderId, status: input.status } }, tx);
    }
    if (auditId) await tx.auditLog.create({ data: { id: auditId, userId: adminId, action: "shipping.request", entity: "Shipment", entityId: shipment.id, meta: { orderId, fingerprint } } });
    return shipment;
  }, { timeout: 15000 });
}

export function getShipmentByOrder(orderId: string) {
  return prisma.shipment.findUnique({ where: { orderId }, include: { events: { orderBy: { occurredAt: "asc" } } } });
}
