import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, Copy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrderForUser } from "@/modules/orders/orders.service";
import { formatIDR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProofForm } from "@/components/storefront/proof-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instruksi Pembayaran", robots: { index: false } };

export default async function PaymentPage({ params }: { params: { orderId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=/checkout/payment/${params.orderId}`);
  const order = await getOrderForUser(user.id, params.orderId);
  const payment = order.payment!;
  const bank = payment.bankAccount;

  const isPaid = payment.status === "PAID";
  const isWaiting = payment.status === "WAITING_VERIFICATION";
  const canUpload = payment.status === "PENDING_PAYMENT" || payment.status === "REJECTED";
  const lastRejected = order.payment?.confirmations.find((c) => c.status === "REJECTED");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl font-black text-ink">Selesaikan Pembayaran</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Order <span className="font-semibold text-ink">{order.orderNumber}</span>
        </p>
      </div>

      {isPaid ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-success/40 bg-green-50 p-8 text-center" data-testid="payment-paid">
          <CheckCircle2 size={44} className="text-success" />
          <h2 className="font-display text-lg font-bold text-ink">Pembayaran Berhasil</h2>
          <p className="text-sm text-ink-soft">Terima kasih! Pesananmu sedang kami proses.</p>
          <Button asChild><Link href={`/orders/${order.id}`}>Lihat Pesanan</Link></Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-line p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Total Pembayaran</span>
              <Badge variant={isWaiting ? "warning" : "muted"}>
                {isWaiting ? "Menunggu Verifikasi" : payment.status === "REJECTED" ? "Ditolak" : "Menunggu Pembayaran"}
              </Badge>
            </div>
            <p className="mt-1 font-display text-3xl font-black text-ink" data-testid="payment-amount">{formatIDR(payment.amount)}</p>
            {bank && (
              <div className="mt-4 rounded-xl bg-surface p-4">
                <p className="text-xs text-ink-muted">Transfer ke</p>
                <p className="font-display text-lg font-bold text-ink">{bank.bankName}</p>
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {bank.accountNumber} <Copy size={14} className="text-ink-muted" />
                </p>
                <p className="text-sm text-ink-soft">a.n {bank.accountHolder}</p>
              </div>
            )}
          </div>

          {isWaiting ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-warning/40 bg-amber-50 p-8 text-center" data-testid="payment-waiting">
              <Clock size={40} className="text-warning" />
              <h2 className="font-display text-lg font-bold text-ink">Menunggu Verifikasi</h2>
              <p className="text-sm text-ink-soft">Bukti transfer kamu sedang diperiksa admin (maks 1x24 jam).</p>
              <Button asChild variant="outline"><Link href={`/orders/${order.id}`}>Lihat Status Pesanan</Link></Button>
            </div>
          ) : (
            <div className="space-y-3">
              {lastRejected && (
                <div className="rounded-xl border border-destructive/40 bg-red-50 p-4 text-sm text-red-700" data-testid="rejection-notice">
                  Bukti sebelumnya ditolak: {lastRejected.rejectionReason}. Silakan unggah ulang.
                </div>
              )}
              <h2 className="font-display text-lg font-bold text-ink">Konfirmasi Pembayaran</h2>
              {canUpload && <ProofForm orderId={order.id} amount={payment.amount} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
