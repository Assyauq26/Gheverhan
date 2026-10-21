"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Minus,
  Plus,
  ShoppingCart,
  Check,
  Loader2,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProductSelection } from "./product-selection";
import { resolveVariant } from "@/modules/catalog/variation-domain";
import { cn } from "@/lib/utils";
import { buyNowAction } from "@/modules/checkout/checkout-intent.actions";
import { addToCartAction } from "@/modules/cart/cart.actions";

export interface VariantOption {
  id: string;
  color: string | null;
  size: string | null;
  available: number;
  sku?: string;
  optionValueIds?: string[];
  price?: number;
  originalPrice?: number;
}

export function PurchasePanel({
  variants,
  groups,
}: {
  productId: string;
  variants: VariantOption[];
  wishlisted: boolean;
  groups?: {
    id: string;
    name: string;
    allowsImage: boolean;
    values: {
      id: string;
      value: string;
      image: { url: string; alt: string } | null;
    }[];
  }[];
}) {
  const router = useRouter();
  const context = useProductSelection();
  const setImage = context?.setImage,
    setPrice = context?.setPrice;
  const [options, setOptions] = useState<Record<string, string>>(() => {
    // Initialize from a real sellable SKU, never an invented first×first
    // combination. Sparse catalogs can intentionally omit some combinations.
    const complete = (variant: VariantOption) =>
      (groups ?? []).every(group =>
        group.values.some(value => variant.optionValueIds?.includes(value.id)),
      );
    const initial = variants.find(variant => variant.available > 0 && complete(variant))
      ?? variants.find(complete);
    return Object.fromEntries(
      (groups ?? []).map(group => [
        group.id,
        group.values.find(value => initial?.optionValueIds?.includes(value.id))?.id
          ?? group.values[0]?.id
          ?? "",
      ]),
    );
  });
  const colors = useMemo(
    () =>
      Array.from(
        new Set(variants.map((v) => v.color).filter(Boolean)),
      ) as string[],
    [variants],
  );
  const sizes = useMemo(
    () =>
      Array.from(
        new Set(variants.map((v) => v.size).filter(Boolean)),
      ) as string[],
    [variants],
  );

  const [color, setColor] = useState<string | null>(colors[0] ?? null);
  const [size, setSize] = useState<string | null>(sizes[0] ?? null);
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);
  const [notified, setNotified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pending = transitioning || busy;

  const selected = useMemo(
    () =>
      groups?.length
        ? resolveVariant(
            variants,
            groups.map((g) => options[g.id]).filter(Boolean),
            groups.length,
          )
        : variants.find(
            (v) =>
              (v.color ?? null) === (color ?? null) &&
              (v.size ?? null) === (size ?? null),
          ),
    [variants, color, size, groups, options],
  );
  const optionImage = groups
    ?.find((g) => g.allowsImage)
    ?.values.find((v) => Object.values(options).includes(v.id))?.image;
  useEffect(() => {
    setImage?.(optionImage ?? null);
  }, [optionImage, setImage]);
  useEffect(() => {
    setPrice?.(
      selected?.price != null
        ? {
            unit: selected.price,
            original: selected.originalPrice ?? selected.price,
          }
        : null,
    );
  }, [selected, setPrice]);
  const stock = selected?.available ?? 0;
  useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, stock || 1)));
  }, [stock]);
  const outOfStock = stock <= 0;

  function add(checkout = false) {
    if (!selected || selected.available < qty || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    start(async () => {
      try {
        if (checkout) {
          const intent = await buyNowAction(selected.id, qty);
          if (!intent.ok || !intent.data) { setError(intent.error ?? "Gagal menyiapkan checkout"); return; }
          router.push(intent.data.checkoutUrl);
          return;
        }
        const res = await addToCartAction(selected.id, qty);
        if (res.unauthorized) {
          router.push("/login?redirectTo=/cart");
          return;
        }
        if (!res.ok) {
          setError(res.error ?? "Gagal menambah ke keranjang");
          return;
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
        router.refresh();
      } catch {
        setError("Koneksi terputus. Silakan coba lagi.");
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    });
  }

  return (
    <div className="space-y-5" data-testid="purchase-panel">
      {groups?.map((group) => (
        <fieldset key={group.id} className="min-w-0 space-y-2.5">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">{group.name}</legend>
          <div className="flex flex-wrap gap-2.5">
            {group.values.map((value) => (
              <button
                key={value.id}
                type="button"
                aria-pressed={options[group.id] === value.id}
                data-testid={`option-${value.id}`}
                className={cn("pdp-choice-pill", !group.allowsImage && "pdp-choice-pill--solid")}
                onClick={() => {
                  setOptions(current => ({ ...current, [group.id]: value.id }));
                  setDone(false);
                  setNotified(false);
                  setError(null);
                }}
              >
                {group.allowsImage && (
                  <span className="pdp-swatch">
                    {value.image?.url
                      ? <Image src={value.image.url} alt="" width={28} height={28} className="h-full w-full object-cover"/>
                      : value.value.slice(0, 1).toUpperCase()}
                  </span>
                )}
                {value.value}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      {!groups?.length && colors.length > 0 && (
        <fieldset className="space-y-2.5">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Warna</legend>
          <div className="flex flex-wrap gap-2.5">
            {colors.map(c => (
              <button key={c} type="button" data-testid={`color-${c}`}
                aria-pressed={color === c} className="pdp-choice-pill"
                onClick={() => { setColor(c); setDone(false); setError(null); }}>
                <span className="pdp-swatch">{c.slice(0, 1).toUpperCase()}</span>{c}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {!groups?.length && sizes.length > 0 && (
        <fieldset className="space-y-2.5">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Ukuran</legend>
          <div className="flex flex-wrap gap-2.5">
            {sizes.map(s => (
              <button key={s} type="button" data-testid={`size-${s}`}
                aria-pressed={size === s} className="pdp-choice-pill pdp-choice-pill--solid"
                onClick={() => { setSize(s); setDone(false); setError(null); }}>{s}</button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <span className="text-sm font-semibold text-zinc-900">Jumlah</span>
        <div className="pdp-quantity-stepper" aria-label="Atur jumlah">
          <button type="button" data-testid="qty-minus" aria-label="Kurangi jumlah"
            disabled={qty <= 1 || pending} onClick={() => setQty(q => Math.max(1, q - 1))}>
            <Minus size={18}/>
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums" data-testid="qty-value">{qty}</span>
          <button type="button" data-testid="qty-plus" aria-label="Tambah jumlah"
            disabled={pending || stock <= qty} onClick={() => setQty(q => Math.min(stock || 1, q + 1))}>
            <Plus size={18}/>
          </button>
        </div>
        <span className={cn("text-xs", outOfStock ? "font-medium text-red-600" : "text-zinc-400")}>
          {!selected ? "Kombinasi tidak tersedia" : outOfStock ? "Stok habis" : `${stock} tersedia`}
        </span>
      </div>

      {selected?.sku && <p className="text-xs text-zinc-400" data-testid="selected-sku">SKU: {selected.sku}</p>}
      {error && <p role="alert" className="text-sm text-red-600" data-testid="purchase-error">{error}</p>}
      {outOfStock && selected && (
        <Button type="button" size="sm" variant="outline" data-testid="notify-me-btn"
          disabled={notified} onClick={() => setNotified(true)}>
          {notified ? <><Check size={16}/> Akan diberi tahu</> : <><BellRing size={16}/> Beri Tahu Saya</>}
        </Button>
      )}

      <div className="pdp-purchase-actions" aria-label="Aksi pembelian produk">
        {selected && <button type="button" className="pdp-cart-pill" data-testid="add-to-cart-btn"
          aria-label={done ? "Produk ditambahkan ke keranjang" : "Tambah ke keranjang"}
          title="Tambah ke keranjang" disabled={pending || outOfStock || !selected}
          onClick={() => add(false)}>
          {pending ? <Loader2 size={23} className="animate-spin"/> : done ? <Check size={24}/> : <ShoppingCart size={24}/>}
          <span className="sr-only">{done ? "Ditambahkan" : "Tambah ke keranjang"}</span>
        </button>}
        <button type="button" className="pdp-buy-pill" data-testid="buy-now-btn"
          disabled={pending || outOfStock || !selected} onClick={() => add(true)}>
          {pending ? "Memproses..." : !selected ? "Kombinasi tidak tersedia" : outOfStock ? "Stok habis" : "Beli Sekarang"}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-400 md:max-w-md">
        Beli Sekarang hanya membeli pilihan ini. Isi keranjang Anda tetap tersimpan.
      </p>
    </div>
  );
}
