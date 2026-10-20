"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { formatIDR, discountPercent } from "@/lib/money";

type Selection = {
  image: { url: string; alt: string } | null;
  setImage: (image: Selection["image"]) => void;
  price: { unit: number; original: number } | null;
  setPrice: (price: Selection["price"]) => void;
};
const SelectionContext = createContext<Selection | null>(null);
export function ProductSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [image, setImage] = useState<Selection["image"]>(null);
  const [price, setPrice] = useState<Selection["price"]>(null);
  return (
    <SelectionContext.Provider value={{ image, setImage, price, setPrice }}>
      {children}
    </SelectionContext.Provider>
  );
}
export const useProductSelection = () => useContext(SelectionContext);
export function ProductSelectionPrice({
  defaultPrice,
  basePrice,
}: {
  defaultPrice: number;
  basePrice: number;
}) {
  const selection = useProductSelection();
  const unit = selection?.price?.unit ?? defaultPrice,
    original = selection?.price?.original ?? basePrice;
  const pct = discountPercent(original, unit);
  return (
    <div
      className="flex flex-wrap items-center gap-3"
      aria-live="polite"
      data-testid="selected-product-price"
    >
      <span className="font-display text-3xl font-black text-ink">
        {formatIDR(unit)}
      </span>
      {pct > 0 && (
        <>
          <span className="text-lg text-ink-muted line-through">
            {formatIDR(original)}
          </span>
          <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
            {pct}% OFF
          </span>
        </>
      )}
    </div>
  );
}
