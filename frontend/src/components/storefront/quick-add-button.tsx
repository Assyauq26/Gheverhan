"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addToCartAction } from "@/modules/cart/cart.actions";
import { emitCartCountDelta } from "@/modules/cart/cart-events";

export function QuickAddButton({
  variantId,
  disabled,
  className,
}: {
  variantId: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!variantId || pending) return;

    // The interaction is optimistic: the visual feedback and cart badge are
    // updated immediately while the authoritative mutation runs in the
    // background. This removes the perceived network latency from the tap.
    setDone(true);
    emitCartCountDelta(1);

    start(async () => {
      const res = await addToCartAction(variantId, 1);
      if (res.unauthorized) {
        emitCartCountDelta(-1);
        setDone(false);
        router.push("/login?redirectTo=/cart");
        return;
      }
      if (!res.ok) {
        emitCartCountDelta(-1);
        setDone(false);
        return;
      }
      setTimeout(() => setDone(false), 1400);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending || !variantId}
      aria-label="Tambah ke keranjang"
      data-testid={`quick-add-${variantId ?? "none"}`}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-ink shadow-none transition-transform hover:scale-105 active:scale-95 disabled:opacity-40",
        className,
      )}
    >
      {pending && !done ? (
        <Loader2 size={21} className="animate-spin" />
      ) : done ? (
        <Check size={21} strokeWidth={2.2} />
      ) : (
        <ShoppingBag size={21} strokeWidth={2} />
      )}
    </button>
  );
}
