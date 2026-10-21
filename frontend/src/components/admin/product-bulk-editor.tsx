"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { applyBulk } from "@/modules/catalog/product-editor-domain";
import type { ProductInput } from "@/modules/catalog/product-management.validation";
type Row = ProductInput["variants"][number] & {
  reserved?: number;
  protected?: boolean;
};
export function ProductBulkEditor({
  rows,
  basePrice,
  canStock,
  disabled,
  selected,
  selectedOnly,
  onMode,
  onChange,
}: {
  rows: Row[];
  basePrice: number;
  canStock: boolean;
  disabled: boolean;
  selected: Set<number>;
  selectedOnly: boolean;
  onMode: (selected: boolean) => void;
  onChange: (rows: Row[]) => void;
}) {
  const [fields, setFields] = useState({
    price: "",
    salePrice: "",
    onHand: "",
  });
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <section
      className="variation-bulk variation-card p-4 sm:p-6"
      aria-labelledby="bulk-heading"
    >
      <h3 id="bulk-heading">Input Massal Harga &amp; Stok</h3>
      <p>Terapkan harga dan stok ke banyak kombinasi sekaligus.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["price", "Harga normal (Rp)"],
            ["salePrice", "Harga diskon (Rp)"],
            ["onHand", "Stok fisik"],
          ] as const
        ).map(([key, label]) => (
          <div className="variation-field" key={key}>
            <label htmlFor={`bulk-${key}`}>{label}</label>
            <input
              id={`bulk-${key}`}
              inputMode="numeric"
              placeholder="Tidak diubah"
              value={fields[key]}
              disabled={disabled || (key === "onHand" && !canStock)}
              onChange={(e) =>
                setFields((current) => ({ ...current, [key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <label className="mt-4 flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={selectedOnly}
          disabled={disabled}
          onChange={(e) => onMode(e.target.checked)}
        />
        Hanya SKU dipilih{" "}
        {selectedOnly
          ? `(${selected.size} dipilih)`
          : "— nonaktif: terapkan ke semua SKU"}
      </label>
      <Button
        type="button"
        disabled={disabled || !rows.length}
        onClick={() => {
          try {
            const patch: {
              price?: number;
              salePrice?: number;
              onHand?: number;
            } = {};
            for (const key of ["price", "salePrice", "onHand"] as const)
              if (fields[key].trim()) {
                if (!/^\d+$/.test(fields[key].trim()))
                  throw new Error(
                    "Gunakan bilangan bulat, tanpa tanda atau pemisah.",
                  );
                patch[key] = Number(fields[key]);
              }
            onChange(
              applyBulk(
                rows,
                patch,
                selectedOnly ? selected : null,
                basePrice,
                canStock,
              ),
            );
            setFailed(false);
            setMessage(
              "Perubahan massal diterapkan pada formulir. Klik Simpan untuk menyimpannya.",
            );
          } catch (error) {
            setFailed(true);
            setMessage(
              error instanceof Error ? error.message : "Input tidak valid.",
            );
          }
        }}
      >
        Terapkan Massal
      </Button>
      {message && (
        <p className="mt-3" role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
    </section>
  );
}
