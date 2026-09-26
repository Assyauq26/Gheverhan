"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { quickAddToCartAction } from "@/modules/cart/cart.actions";
import { emitCartCountDelta } from "@/modules/cart/cart-events";

const FEEDBACK_MS = 350;

export function QuickAddButton({
  variantId,
  disabled,
  className,
}: {
  variantId: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const [showLoading, setShowLoading] = useState(false);
  const inFlightRef = useRef(false);
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!variantId || disabled || inFlightRef.current) return;

    // The UI is deliberately decoupled from server latency:
    // 1. show the loader immediately;
    // 2. update both cart badges optimistically;
    // 3. return to the bag after a short visual acknowledgement;
    // 4. keep the lightweight server mutation protected in the background.
    inFlightRef.current = true;
    setShowLoading(true);
    emitCartCountDelta(1);

    window.setTimeout(() => setShowLoading(false), FEEDBACK_MS);

    void quickAddToCartAction(variantId, 1)
      .then((res) => {
        if (res.unauthorized) {
          emitCartCountDelta(-1);
          router.push("/login?redirectTo=/cart");
          return;
        }

        if (!res.ok) {
          emitCartCountDelta(-1);
        }
      })
      .finally(() => {
        inFlightRef.current = false;
        setShowLoading(false);
      });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !variantId}
      aria-label="Tambah ke keranjang"
      aria-busy={showLoading}
      data-testid={`quick-add-${variantId ?? "none"}`}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-ink shadow-none transition-transform hover:scale-105 active:scale-95 disabled:opacity-40",
        className,
      )}
    >
      {showLoading ? (
        <Loader2 size={21} className="animate-spin" />
      ) : (
        <ShoppingBag size={21} strokeWidth={2} />
      )}
    </button>
  );
}
