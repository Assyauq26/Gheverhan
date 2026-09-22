import { PaymentStatus } from "@prisma/client";

/** Payment lifecycle, kept separate from order & shipment status. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING_PAYMENT: ["WAITING_VERIFICATION", "EXPIRED"],
  WAITING_VERIFICATION: ["PAID", "REJECTED"],
  REJECTED: ["WAITING_VERIFICATION"],
  PAID: [],
  EXPIRED: [],
};

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
