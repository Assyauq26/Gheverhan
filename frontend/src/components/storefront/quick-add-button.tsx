"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addToCartAction } from "@/modules/cart/cart.actions";

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
    if (!variantId) return;

    start(async () => {
      const res = await addToCartAction(variantId, 1);
      if (res.unauthorized) {
        router.push("/login?redirectTo=/cart");
        return;
      }
      if (res.ok) {
        setDone(true);
        setTimeout(() => setDone(false), 1400);
        router.refresh();
      }
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
      {pending ? (
        <Loader2 size={21} className="animate-spin" />
      ) : done ? (
        <Check size={21} strokeWidth={2.2} />
      ) : (
        <ShoppingBag size={21} strokeWidth={2} />
      )}
    </button>
  );
}
