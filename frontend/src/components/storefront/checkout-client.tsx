"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { Truck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatIDR } from "@/lib/money";
import { createOrderAction } from "@/modules/checkout/checkout.actions";
import { cn } from "@/lib/utils";

interface Rate { courier: string; service: string; cost: number; etd?: string }
interface Bank { id: string; displayName: string; bankName: string; accountNumber: string; accountHolder: string }
interface Addr { recipientName: string; phone: string; line: string; city: string; province: string; postalCode: string }

function PlaceOrderBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending} data-testid="place-order-btn">
      {pending ? "Memproses..." : "Buat Pesanan"}
    </Button>
  );
}

export function CheckoutClient({
  subtotal,
  rates,
  banks,
  address,
}: {
  subtotal: number;
  rates: Rate[];
  banks: Bank[];
  address: Addr | null;
}) {
  const [state, action] = useFormState(createOrderAction, { ok: false } as any);
  const [rateIdx, setRateIdx] = useState(0);
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const rate = rates[rateIdx];
  const total = subtotal + (rate?.cost ?? 0);

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_360px]" data-testid="checkout-form">
      <div className="space-y-8">
        {/* Address */}
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-ink">Alamat Pengiriman</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Nama Penerima</Label><Input name="recipientName" defaultValue={address?.recipientName} required data-testid="input-recipient" /></div>
            <div><Label>No. HP</Label><Input name="phone" defaultValue={address?.phone} required data-testid="input-phone" /></div>
          </div>
          <div><Label>Alamat Lengkap</Label><Input name="line" defaultValue={address?.line} required data-testid="input-line" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Kota</Label><Input name="city" defaultValue={address?.city} required data-testid="input-city" /></div>
            <div><Label>Provinsi</Label><Input name="province" defaultValue={address?.province} required data-testid="input-province" /></div>
            <div><Label>Kode Pos</Label><Input name="postalCode" defaultValue={address?.postalCode} required data-testid="input-postal" /></div>
          </div>
        </section>

        {/* Shipping */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink"><Truck size={18} /> Metode Pengiriman</h2>
          <div className="space-y-2">
            {rates.map((r, i) => (
              <label key={i} className={cn("flex cursor-pointer items-center justify-between rounded-xl border p-3", rateIdx === i ? "border-black bg-surface" : "border-line")} data-testid={`ship-option-${i}`}>
                <div className="flex items-center gap-3">
                  <input type="radio" name="_rate" checked={rateIdx === i} onChange={() => setRateIdx(i)} className="accent-black" />
                  <div>
                    <p className="text-sm font-semibold text-ink">{r.courier} - {r.service}</p>
                    <p className="text-xs text-ink-muted">{r.etd}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold">{formatIDR(r.cost)}</span>
              </label>
            ))}
          </div>
          <input type="hidden" name="courier" value={rate?.courier} />
          <input type="hidden" name="service" value={rate?.service} />
          <input type="hidden" name="shippingCost" value={rate?.cost ?? 0} />
        </section>

        {/* Payment */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink"><CreditCard size={18} /> Metode Pembayaran</h2>
          <p className="text-sm text-ink-soft">Transfer Bank Manual — konfirmasi bukti transfer setelah pesanan dibuat.</p>
          <div className="space-y-2">
            {banks.map((b) => (
              <label key={b.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3", bankId === b.id ? "border-black bg-surface" : "border-line")} data-testid={`bank-option-${b.id}`}>
                <input type="radio" name="bankAccountId" value={b.id} checked={bankId === b.id} onChange={() => setBankId(b.id)} className="accent-black" required />
                <div>
                  <p className="text-sm font-semibold text-ink">{b.displayName}</p>
                  <p className="text-xs text-ink-muted">{b.accountNumber} · a.n {b.accountHolder}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        <div>
          <Label>Kode Kupon (opsional)</Label>
          <Input name="couponCode" placeholder="GHEVER10" data-testid="input-coupon" />
        </div>
      </div>

      <div className="h-fit space-y-4 rounded-2xl border border-line p-5 lg:sticky lg:top-24" data-testid="checkout-summary">
        <h2 className="font-display text-lg font-bold text-ink">Ringkasan Pesanan</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">Subtotal</span><span className="font-semibold">{formatIDR(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Ongkir ({rate?.courier})</span><span className="font-semibold">{formatIDR(rate?.cost ?? 0)}</span></div>
        </div>
        <div className="flex justify-between border-t border-line pt-3">
          <span className="font-semibold text-ink">Total</span>
          <span className="font-display text-xl font-black text-ink" data-testid="checkout-total">{formatIDR(total)}</span>
        </div>
        {state?.ok === false && state?.error && <p className="text-sm text-destructive" data-testid="checkout-error">{state.error}</p>}
        <PlaceOrderBtn />
        <p className="text-center text-[11px] text-ink-muted">Total final & diskon dihitung ulang oleh server.</p>
      </div>
    </form>
  );
}
