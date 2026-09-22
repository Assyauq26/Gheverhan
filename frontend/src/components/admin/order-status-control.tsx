"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { transitionOrderAction } from "@/modules/admin/admin.actions";
import type { OrderStatus } from "@prisma/client";

export function OrderStatusControl({
  orderId,
  allowed,
}: {
  orderId: string;
  allowed: OrderStatus[];
}) {
  const router = useRouter();
  const [to, setTo] = useState<OrderStatus | "">(allowed[0] ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (allowed.length === 0) return <span className="text-xs text-ink-muted">Status final</span>;

  return (
    <div className="flex items-center gap-2">
      <select
        value={to}
        onChange={(e) => setTo(e.target.value as OrderStatus)}
        className="h-9 rounded-lg border border-line px-2 text-xs"
        data-testid={`order-status-select-${orderId}`}
      >
        {allowed.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={pending || !to}
        data-testid={`order-status-apply-${orderId}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await transitionOrderAction(orderId, to as OrderStatus);
            if (!res.ok) setError(res.error ?? "Gagal");
            else router.refresh();
          })
        }
      >
        {pending ? "..." : "Ubah"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
