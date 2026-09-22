"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { upsertShipmentAction } from "@/modules/admin/admin.actions";

const STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "IN_TRANSIT", "DELIVERED"];

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending} data-testid="shipment-submit">{pending ? "Menyimpan..." : "Simpan Pengiriman"}</Button>;
}

export function ShipmentForm({
  orderId,
  initial,
}: {
  orderId: string;
  initial?: {
    courier?: string | null; service?: string | null; cost?: number;
    trackingNumber?: string | null; status?: string; notes?: string | null;
  } | null;
}) {
  const [state, action] = useFormState(upsertShipmentAction, { ok: false } as any);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" data-testid={`shipment-form-${orderId}`}>
      <input type="hidden" name="orderId" value={orderId} />
      <div><Label>Kurir</Label><Input name="courier" defaultValue={initial?.courier ?? "J&T"} required data-testid="ship-courier" /></div>
      <div><Label>Layanan</Label><Input name="service" defaultValue={initial?.service ?? "EZ"} required data-testid="ship-service" /></div>
      <div><Label>Ongkir</Label><Input name="cost" type="number" defaultValue={initial?.cost ?? 20000} required /></div>
      <div><Label>No. Resi</Label><Input name="trackingNumber" defaultValue={initial?.trackingNumber ?? ""} data-testid="ship-resi" /></div>
      <div><Label>Tgl Kirim</Label><Input name="shippedDate" type="date" /></div>
      <div><Label>Estimasi Tiba</Label><Input name="estimatedDelivery" type="date" /></div>
      <div>
        <Label>Status</Label>
        <select name="status" defaultValue={initial?.status ?? "PROCESSING"} className="h-11 w-full rounded-xl border border-line px-3 text-sm" data-testid="ship-status">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2"><Label>Catatan</Label><Textarea name="notes" defaultValue={initial?.notes ?? ""} /></div>
      {state?.ok === false && state?.error && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success sm:col-span-2">Pengiriman tersimpan.</p>}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
