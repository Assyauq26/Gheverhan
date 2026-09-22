"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { approvePaymentAction, rejectPaymentAction } from "@/modules/admin/admin.actions";

export function PaymentVerify({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    start(async () => {
      const res = await approvePaymentAction(paymentId);
      if (!res.ok) return setError(res.error ?? "Gagal menyetujui");
      router.refresh();
    });
  }

  function reject() {
    if (!reason.trim()) return setError("Alasan penolakan wajib diisi");
    setError(null);
    const fd = new FormData();
    fd.set("paymentId", paymentId);
    fd.set("reason", reason);
    start(async () => {
      const res = await rejectPaymentAction(null, fd);
      if (!res.ok) return setError(res.error ?? "Gagal menolak");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" data-testid={`payment-verify-${paymentId}`}>
      {error && <p className="text-sm text-destructive" data-testid="verify-error">{error}</p>}
      {!showReject ? (
        <div className="flex gap-2">
          <Button variant="success" onClick={approve} disabled={pending} data-testid={`approve-${paymentId}`}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Setujui
          </Button>
          <Button variant="destructive" onClick={() => setShowReject(true)} disabled={pending} data-testid={`reject-open-${paymentId}`}>
            <X size={16} /> Tolak
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            placeholder="Alasan penolakan (wajib)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid={`reject-reason-${paymentId}`}
          />
          <div className="flex gap-2">
            <Button variant="destructive" onClick={reject} disabled={pending} data-testid={`reject-confirm-${paymentId}`}>
              {pending ? <Loader2 size={16} className="animate-spin" /> : "Konfirmasi Tolak"}
            </Button>
            <Button variant="outline" onClick={() => setShowReject(false)} disabled={pending}>Batal</Button>
          </div>
        </div>
      )}
    </div>
  );
}
