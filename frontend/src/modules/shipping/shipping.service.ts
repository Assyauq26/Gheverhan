import { shipmentOrderTarget, statusAfterTrackingEntry } from "./shipping-policy";
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
    if (!order.payment) throw new HttpError("Pembayaran tidak ditemukan", 409);
    await assertNoActiveRefund(tx, order.payment.id);
    const candidate = { ...order.shipment, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
    const context = { status: order.status, paymentStatus: order.paymentStatus, paymentStatusActual: order.payment.status, shipmentStatus: order.shipment?.status ?? null };
    const effectiveStatus = statusAfterTrackingEntry(context.shipmentStatus, input.status, candidate.trackingNumber);
    // Entering an AWB is an explicit seller handover to the courier. An
    // unpaid/unpacked order may never skip fulfillment stages.
    if (effectiveStatus === "SHIPPED" && !["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(context.shipmentStatus ?? "") && order.status !== "PACKED") {
      throw new HttpError("Tandai pesanan PACKED sebelum memasukkan nomor resi dan menyerahkannya ke kurir", 409);
    }
    data.status = effectiveStatus;
    if (effectiveStatus === "SHIPPED" && !["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(context.shipmentStatus ?? "") && !candidate.shippedDate) {
      data.shippedDate = new Date();
    }
    // Build the final comparison after status/date normalization: legacy records
    // with an already-recorded AWB must still transition on the next save.
    const merged = { ...order.shipment, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
    const target = shipmentOrderTarget(context, effectiveStatus);
    if (["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(effectiveStatus) && !merged.trackingNumber?.trim()) throw new HttpError("Nomor resi diperlukan sebelum pengiriman", 422);
    const changed = !order.shipment || ["courier", "service", "cost", "status", "trackingNumber", "shippedDate", "estimatedDelivery", "notes"].some(key => {
      const before = (order.shipment as unknown as Record<string, unknown>)[key]; const after = (merged as Record<string, unknown>)[key];
      return (before instanceof Date ? before.toISOString() : before ?? null) !== (after instanceof Date ? after.toISOString() : after ?? null);
    });
    if (target) await transitionOrderInTransaction(tx, orderId, target, adminId, `Shipment: ${effectiveStatus}`, { source: "shipment" });
    const shipment = changed ? await tx.shipment.upsert({ where: { orderId }, create: { orderId, provider: "manual", ...data }, update: data }) : order.shipment!;
    if (changed) {
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: effectiveStatus, description: `Manual shipment: ${effectiveStatus}${merged.trackingNumber ? ` (${merged.trackingNumber})` : ""}` } });
      await writeAudit({ userId: adminId, action: "shipping.update", entity: "Shipment", entityId: shipment.id, meta: { orderId, status: effectiveStatus } }, tx);
    }
    if (auditId) await tx.auditLog.create({ data: { id: auditId, userId: adminId, action: "shipping.request", entity: "Shipment", entityId: shipment.id, meta: { orderId, fingerprint } } });
    return shipment;
  }, { timeout: 15000 });
}

export function getShipmentByOrder(orderId: string) {
  return prisma.shipment.findUnique({ where: { orderId }, include: { events: { orderBy: { occurredAt: "asc" } } } });
}
