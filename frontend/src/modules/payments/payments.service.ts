import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { canTransitionPayment } from "@/modules/payments/domain/state-machine";
import { commitSale } from "@/modules/inventory/inventory.service";
import { writeAudit } from "@/modules/audit/audit.service";

export function listActiveBankAccounts() {
  return prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}

/** Customer submits transfer proof -> WAITING_VERIFICATION. */
export async function submitConfirmation(
  userId: string,
  orderId: string,
  input: {
    senderBank: string;
    senderName: string;
    amount: number;
    transferDate: Date;
    proofPath: string;
    proofMime: string;
    note?: string;
  },
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { payment: true },
  });
  if (!order || !order.payment) throw new HttpError("Order tidak ditemukan", 404);
  const payment = order.payment;
  if (payment.status === "PAID") throw new HttpError("Pembayaran sudah lunas", 409);

  return prisma.$transaction(async (tx) => {
    await tx.paymentConfirmation.create({
      data: {
        paymentId: payment.id,
        senderBank: input.senderBank,
        senderName: input.senderName,
        amount: input.amount,
        transferDate: input.transferDate,
        proofPath: input.proofPath,
        proofMime: input.proofMime,
        note: input.note,
        status: "SUBMITTED",
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "WAITING_VERIFICATION" },
    });
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: "WAITING_VERIFICATION" },
    });
    await writeAudit(
      { userId, action: "payment.confirm", entity: "Payment", entityId: payment.id, meta: { orderId } },
      tx,
    );
    return updated;
  });
}

export function listPendingVerifications(search?: string) {
  return prisma.payment.findMany({
    where: {
      status: "WAITING_VERIFICATION",
      ...(search
        ? { order: { orderNumber: { contains: search, mode: "insensitive" } } }
        : {}),
    },
    include: {
      order: { include: { user: { select: { name: true, email: true } } } },
      bankAccount: true,
      confirmations: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "asc" },
  });
}

export function getPaymentDetail(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: { include: { items: true, address: true, user: true } },
      bankAccount: true,
      confirmations: { orderBy: { createdAt: "desc" } },
    },
  });
}

/** Admin approves -> PAID. Idempotent via state validation, inside a transaction. */
export async function approvePayment(paymentId: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { items: true } }, confirmations: { orderBy: { createdAt: "desc" } } },
    });
    if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
    if (payment.status === "PAID") throw new HttpError("Pembayaran sudah disetujui", 409);
    if (!canTransitionPayment(payment.status, "PAID")) {
      throw new HttpError("Pembayaran tidak dalam status menunggu verifikasi", 409);
    }

    const latest = payment.confirmations.find((c) => c.status === "SUBMITTED");
    if (latest) {
      await tx.paymentConfirmation.update({
        where: { id: latest.id },
        data: { status: "APPROVED", reviewedBy: adminId, reviewedAt: new Date() },
      });
    }
    await tx.payment.update({ where: { id: paymentId }, data: { status: "PAID" } });

    // Convert reserved stock into a committed sale.
    for (const item of payment.order.items) {
      await commitSale(tx, item.variantId, item.quantity, payment.order.orderNumber);
    }

    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: "PAID", paymentStatus: "PAID" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        fromStatus: payment.order.status,
        toStatus: "PAID",
        note: "Pembayaran diverifikasi",
        createdBy: adminId,
      },
    });
    await tx.notification.create({
      data: {
        userId: payment.order.userId,
        type: "payment",
        title: "Pembayaran dikonfirmasi",
        body: `Pembayaran untuk order ${payment.order.orderNumber} telah diverifikasi.`,
      },
    });
    await writeAudit(
      { userId: adminId, action: "payment.approve", entity: "Payment", entityId: paymentId, meta: { orderId: payment.orderId } },
      tx,
    );
    return { ok: true };
  });
}

/** Admin rejects with a reason -> customer can re-upload. */
export async function rejectPayment(paymentId: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new HttpError("Alasan penolakan wajib diisi", 400);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { order: true, confirmations: { orderBy: { createdAt: "desc" } } },
    });
    if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
    if (payment.status !== "WAITING_VERIFICATION") {
      throw new HttpError("Pembayaran tidak dalam status menunggu verifikasi", 409);
    }
    const latest = payment.confirmations.find((c) => c.status === "SUBMITTED");
    if (latest) {
      await tx.paymentConfirmation.update({
        where: { id: latest.id },
        data: { status: "REJECTED", rejectionReason: reason, reviewedBy: adminId, reviewedAt: new Date() },
      });
    }
    await tx.payment.update({ where: { id: paymentId }, data: { status: "PENDING_PAYMENT" } });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "PENDING_PAYMENT" },
    });
    await tx.notification.create({
      data: {
        userId: payment.order.userId,
        type: "payment",
        title: "Pembayaran ditolak",
        body: `Bukti transfer untuk order ${payment.order.orderNumber} ditolak: ${reason}`,
      },
    });
    await writeAudit(
      { userId: adminId, action: "payment.reject", entity: "Payment", entityId: paymentId, meta: { reason } },
      tx,
    );
    return { ok: true };
  });
}
