import { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Menunggu Pembayaran",
  PAID: "Dibayar",
  PROCESSING: "Diproses",
  PACKED: "Dikemas",
  SHIPPED: "Dikirim",
  DELIVERED: "Diterima",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
  REFUNDED: "Dikembalikan",
};

export function orderBadgeVariant(
  status: OrderStatus,
): "default" | "success" | "warning" | "info" | "destructive" | "muted" {
  switch (status) {
    case "PENDING_PAYMENT":
      return "warning";
    case "PAID":
    case "PROCESSING":
    case "PACKED":
      return "info";
    case "SHIPPED":
    case "DELIVERED":
      return "info";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    case "EXPIRED":
    case "REFUNDED":
      return "destructive";
    default:
      return "muted";
  }
}
