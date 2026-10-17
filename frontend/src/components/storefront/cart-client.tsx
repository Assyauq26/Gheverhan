"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/money";
import { updateCartItemAction, removeCartItemAction } from "@/modules/cart/cart.actions";
import { emitCartCount } from "@/modules/cart/cart-events";

interface Line {
  id: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  inStock: boolean;
  availableStock: number;
  product: { name: string; slug: string; image: string | null };
  variantLabel: string;
}
interface View {
  lines: Line[];
  subtotal: number;
  count: number;
}

function recalculate(lines: Line[]): View {
  return {
    lines,
    subtotal: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

export function CartClient({ initial }: { initial: View }) {
  const [view, setView] = useState(initial);
  const router = useRouter();
  const pendingRef = useRef(false);
  const currentView = useRef(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (!pendingRef.current) {
      currentView.current = initial;
      setView(initial);
      emitCartCount(initial.count);
    }
  }, [initial]);

  function commit(next: View) {
    currentView.current = next;
    setView(next);
    emitCartCount(next.count);
  }

  function mutate(id: string, optimistic: View, operation: () => ReturnType<typeof updateCartItemAction>) {
    if (pendingRef.current) return;
    const previous = currentView.current;
    pendingRef.current = true;
    setPendingId(id);
    setError(null);
    commit(optimistic);
    start(async () => {
      try {
        const res = await operation();
        if (res.ok && res.data) commit(res.data as View);
        else {
          commit(previous);
          setError(res.error || "Perubahan keranjang gagal. Coba lagi.");
        }
      } catch {
        commit(previous);
        setError("Koneksi terputus. Periksa keranjang sebelum mencoba lagi.");
      } finally {
        pendingRef.current = false;
        setPendingId(null);
        // A lost response can follow a committed write: reconcile with the server.
        router.refresh();
      }
    });
  }

  function update(id: string, qty: number) {
    if (pendingRef.current) return;
    const previous = currentView.current;
    const line = previous.lines.find(item => item.id === id);
    if (!line) return;
    if (qty <= 0) return remove(id);
    if (qty > line.availableStock) return;
    const optimistic = recalculate(previous.lines.map(item => item.id === id
      ? { ...item, quantity: qty, lineTotal: item.unitPrice * qty, inStock: qty <= item.availableStock }
      : item));
    mutate(id, optimistic, () => updateCartItemAction(id, qty));
  }

  function remove(id: string) {
    if (pendingRef.current) return;
    mutate(id, recalculate(currentView.current.lines.filter(line => line.id !== id)), () => removeCartItemAction(id));
  }

  const shippingEstimate = 20000;
  const total = view.subtotal;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4" data-testid="cart-lines" aria-live="polite" aria-busy={pendingId !== null}>
        {error && <p role="alert" data-testid="cart-error" className="text-sm text-destructive">{error}</p>}
        {view.lines.map((l) => (
          <div key={l.id} className="flex gap-4 rounded-2xl border border-line p-3" data-testid={`cart-line-${l.id}`}>
            <Link href={`/product/${l.product.slug}`} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-surface">
              {l.product.image && <Image src={l.product.image} alt={l.product.name} fill className="object-cover" sizes="96px" unoptimized={l.product.image.startsWith("/api/v1/product-images/")} />}
            </Link>
            <div className="flex flex-1 flex-col justify-between">
              <div className="flex justify-between gap-2">
                <div>
                  <Link href={`/product/${l.product.slug}`} className="text-sm font-semibold text-ink">{l.product.name}</Link>
                  <p className="text-xs text-ink-muted">{l.variantLabel}</p>
                  {!l.inStock && <p className="text-xs font-semibold text-destructive">Stok tidak cukup</p>}
                </div>
                <button onClick={() => remove(l.id)} disabled={pendingId !== null} className="text-ink-muted transition-opacity hover:text-destructive disabled:opacity-50" data-testid={`cart-remove-${l.id}`}>
                  {pendingId === l.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full border border-line px-1.5 py-1">
                  <button onClick={() => update(l.id, l.quantity - 1)} disabled={pendingId !== null || l.quantity <= 1} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface disabled:opacity-40" data-testid={`cart-dec-${l.id}`}>
                    <Minus size={14} />
                  </button>
                  <span data-testid={`cart-quantity-${l.id}`} className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                  <button onClick={() => update(l.id, l.quantity + 1)} disabled={pendingId !== null || l.quantity >= l.availableStock} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface disabled:opacity-40" data-testid={`cart-inc-${l.id}`}>
                    <Plus size={14} />
                  </button>
                </div>
                <span className="font-display font-bold text-ink">{formatIDR(l.lineTotal)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-fit space-y-4 rounded-2xl border border-line p-5 lg:sticky lg:top-24" data-testid="cart-summary">
        <h2 className="font-display text-lg font-bold text-ink">Ringkasan</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">Subtotal</span><span className="font-semibold">{formatIDR(view.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Estimasi Ongkir</span><span className="text-ink-muted">{formatIDR(shippingEstimate)}*</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Diskon</span><span className="text-ink-muted">- {formatIDR(0)}</span></div>
        </div>
        <div className="border-t border-line pt-3">
          <div className="flex justify-between">
            <span className="font-semibold text-ink">Total</span>
            <span className="font-display text-xl font-black text-ink" data-testid="cart-total">{formatIDR(total)}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">*Ongkir final dihitung saat checkout.</p>
        </div>
        <Button asChild className="w-full" size="lg" disabled={view.lines.some((l) => !l.inStock)} data-testid="checkout-btn">
          <Link href="/checkout">Lanjut ke Checkout</Link>
        </Button>
      </div>
    </div>
  );
}
