"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Heart, Check, Loader2, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addToCartAction } from "@/modules/cart/cart.actions";
import { toggleWishlistAction } from "@/modules/wishlist/wishlist.actions";

export interface VariantOption {
  id: string;
  color: string | null;
  size: string | null;
  available: number;
}

export function PurchasePanel({
  productId,
  variants,
  wishlisted,
}: {
  productId: string;
  variants: VariantOption[];
  wishlisted: boolean;
}) {
  const router = useRouter();
  const colors = useMemo(
    () => Array.from(new Set(variants.map((v) => v.color).filter(Boolean))) as string[],
    [variants],
  );
  const sizes = useMemo(
    () => Array.from(new Set(variants.map((v) => v.size).filter(Boolean))) as string[],
    [variants],
  );

  const [color, setColor] = useState<string | null>(colors[0] ?? null);
  const [size, setSize] = useState<string | null>(sizes[0] ?? null);
  const [qty, setQty] = useState(1);
  const [wish, setWish] = useState(wishlisted);
  const [done, setDone] = useState(false);
  const [notified, setNotified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = useMemo(
    () =>
      variants.find(
        (v) => (v.color ?? null) === (color ?? null) && (v.size ?? null) === (size ?? null),
      ) ?? variants[0],
    [variants, color, size],
  );
  const stock = selected?.available ?? 0;
  const outOfStock = stock <= 0;

  function add() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await addToCartAction(selected.id, qty);
      if (res.unauthorized) return router.push("/login?redirectTo=/cart");
      if (!res.ok) return setError(res.error ?? "Gagal menambah ke keranjang");
      setDone(true);
      setTimeout(() => setDone(false), 1500);
      router.refresh();
    });
  }

  function toggleWish() {
    start(async () => {
      const res = await toggleWishlistAction(productId);
      if (res.unauthorized) return router.push("/login?redirectTo=/wishlist");
      if (res.ok && res.data) setWish(res.data.active);
    });
  }

  return (
    <div className="space-y-5" data-testid="purchase-panel">
      {colors.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Warna</p>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                data-testid={`color-${c}`}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  color === c ? "border-black bg-black text-white" : "border-line text-ink-soft hover:border-ink",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Ukuran</p>
            <button className="text-xs font-semibold text-ink-soft underline">Panduan Ukuran</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                data-testid={`size-${s}`}
                className={cn(
                  "min-w-[48px] rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                  size === s ? "border-black bg-black text-white" : "border-line text-ink-soft hover:border-ink",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <p className="text-sm font-semibold text-ink">Jumlah</p>
        <div className="flex items-center gap-3 rounded-full border border-line px-2 py-1">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface" data-testid="qty-minus">
            <Minus size={16} />
          </button>
          <span className="w-6 text-center text-sm font-semibold" data-testid="qty-value">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(stock || 1, q + 1))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface" data-testid="qty-plus">
            <Plus size={16} />
          </button>
        </div>
        <span className={cn("text-xs font-semibold", outOfStock ? "text-destructive" : "text-ink-muted")}>
          {outOfStock ? "Stok habis" : `${stock} tersedia`}
        </span>
      </div>

      {error && <p className="text-sm text-destructive" data-testid="purchase-error">{error}</p>}

      <div className="flex gap-3">
        {outOfStock ? (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setNotified(true)}
            disabled={notified}
            data-testid="notify-me-btn"
          >
            {notified ? <><Check size={18} /> Akan diberi tahu</> : <><BellRing size={18} /> Beri Tahu Saya</>}
          </Button>
        ) : (
          <Button className="flex-1" size="lg" onClick={add} disabled={pending} data-testid="add-to-cart-btn">
            {pending ? <Loader2 size={18} className="animate-spin" /> : done ? <Check size={18} /> : <ShoppingCart size={18} />}
            {done ? "Ditambahkan" : "Tambah ke Keranjang"}
          </Button>
        )}
        <Button variant="outline" size="icon" className="h-12 w-12" onClick={toggleWish} data-testid="pdp-wishlist-btn">
          <Heart size={20} className={wish ? "fill-black text-black" : ""} />
        </Button>
      </div>
    </div>
  );
}
