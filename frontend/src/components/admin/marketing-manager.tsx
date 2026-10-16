"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgePercent, Bolt, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatIDR } from "@/lib/money";
import { saveVoucherAction, toggleVoucherAction, setFlashSaleAction } from "@/modules/promotions/marketing.actions";

type Voucher = {
  id: string; code: string; discountType: "PERCENT" | "FIXED"; discountValue: number;
  minSpend: number; maxDiscount: number | null; isActive: boolean; startsAt: string | null; expiresAt: string | null;
  usageLimit: number | null; perUserLimit: number | null; usedCount: number; createdAt: string;
};
type Product = {
  id: string; name: string; slug: string; basePrice: number; salePrice: number | null;
  isFlashSale: boolean; updatedAt: string; eligible: boolean;
};
type VoucherDraft = {
  code: string; discountType: "PERCENT" | "FIXED"; discountValue: string;
  minSpend: string; maxDiscount: string; startsAt: string; expiresAt: string; usageLimit: string; perUserLimit: string; isActive: boolean;
};
const initial: VoucherDraft = {
  code: "", discountType: "PERCENT", discountValue: "10",
  minSpend: "0", maxDiscount: "", startsAt: "", expiresAt: "", usageLimit: "", perUserLimit: "", isActive: true,
};
const localDate = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const voucherLabel = (v: Voucher) =>
  !v.isActive ? "Nonaktif" : v.expiresAt && Date.parse(v.expiresAt) <= Date.now() ? "Kedaluwarsa" : v.startsAt && Date.parse(v.startsAt) > Date.now() ? "Terjadwal" : "Aktif";

export function MarketingManager({ vouchers, products, canCreate, canUpdate, canReadProducts }: {
  vouchers: Voucher[]; products: Product[]; canCreate: boolean; canUpdate: boolean; canReadProducts: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<VoucherDraft>(initial);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const selected = products.find(p => p.id === productId);
  const setField = <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => setDraft(v => ({ ...v, [key]: value }));
  const notice = (kind: "error" | "success", text: string) => setFeedback({ kind, text });
  function beginEdit(v: Voucher) {
    setEditing(v.id); setDraft({
      code: v.code, discountType: v.discountType, discountValue: String(v.discountValue),
      minSpend: String(v.minSpend), maxDiscount: v.maxDiscount == null ? "" : String(v.maxDiscount),
      startsAt: localDate(v.startsAt), expiresAt: localDate(v.expiresAt),
      usageLimit: v.usageLimit == null ? "" : String(v.usageLimit),
      perUserLimit: v.perUserLimit == null ? "" : String(v.perUserLimit), isActive: v.isActive,
    }); setFeedback(null);
    document.getElementById("voucher-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function submitVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setFeedback(null);
    try {
      const result = await saveVoucherAction(editing, {
        code: draft.code.trim().toUpperCase(), discountType: draft.discountType,
        discountValue: Number(draft.discountValue), minSpend: Number(draft.minSpend),
        maxDiscount: draft.maxDiscount.trim() ? Number(draft.maxDiscount) : null,
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        usageLimit: draft.usageLimit.trim() ? Number(draft.usageLimit) : null,
        perUserLimit: draft.perUserLimit.trim() ? Number(draft.perUserLimit) : null,
        isActive: draft.isActive,
      });
      if (!result.ok) { notice("error", result.error || "Voucher gagal disimpan"); return; }
      setDraft(initial); setEditing(null); notice("success", "Voucher berhasil disimpan."); router.refresh();
    } catch { notice("error", "Gagal menghubungi server."); }
    finally { setPending(false); }
  }
  async function toggle(v: Voucher) {
    setPending(true); setFeedback(null);
    try {
      const result = await toggleVoucherAction(v.id, !v.isActive);
      if (!result.ok) notice("error", result.error || "Gagal memperbarui voucher");
      else { notice("success", "Status voucher diperbarui."); router.refresh(); }
    } catch { notice("error", "Gagal menghubungi server."); }
    finally { setPending(false); }
  }
  async function flash(product: Product, enabled: boolean, salePrice: number | null) {
    setPending(true); setFeedback(null);
    try {
      const result = await setFlashSaleAction({ productId: product.id, expectedUpdatedAt: product.updatedAt, enabled, salePrice });
      if (!result.ok) notice("error", result.error || "Flash sale gagal diperbarui");
      else { notice("success", enabled ? "Produk berhasil masuk flash sale." : "Flash sale dinonaktifkan dan harga normal dipulihkan."); setProductId(""); setPrice(""); router.refresh(); }
    } catch { notice("error", "Gagal menghubungi server."); }
    finally { setPending(false); }
  }
  return <div className="space-y-8">
    {feedback && <div tabIndex={-1} role={feedback.kind === "error" ? "alert" : "status"}
      className={`rounded-xl border p-3 text-sm ${feedback.kind === "error" ? "border-destructive text-destructive" : "border-line bg-white text-ink"}`}
      data-testid="marketing-feedback">{feedback.text}</div>}

    <section id="voucher" className="space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2"><BadgePercent size={20}/><h2 className="text-xl font-bold">Voucher diskon</h2></div>
      <p className="text-sm text-ink-soft">Voucher berlaku saat pembeli mengisi kode di checkout. Diskon persentase maupun nominal diproses di server.</p>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(290px,0.9fr)]">
        <div className="min-w-0 rounded-2xl border border-line bg-white">
          {!vouchers.length ? <p className="p-5 text-sm text-ink-soft">Belum ada voucher. Buat voucher pertama melalui formulir.</p>
            : <ul className="divide-y divide-line">{vouchers.map(v => <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><p className="break-all font-semibold">{v.code}</p>
                  <span className="rounded-full bg-surface px-2 py-1 text-xs">{voucherLabel(v)}</span></div>
                <p className="text-sm">{v.discountType === "PERCENT" ? `${v.discountValue}%` : formatIDR(v.discountValue)} diskon · Min. belanja {formatIDR(v.minSpend)}</p>
                <p className="text-xs text-ink-soft">{v.maxDiscount ? `Batas diskon ${formatIDR(v.maxDiscount)} · ` : ""}{v.startsAt ? `Mulai ${new Date(v.startsAt).toLocaleString("id-ID")} · ` : ""}{v.expiresAt ? `Berakhir ${new Date(v.expiresAt).toLocaleString("id-ID")}` : "Tanpa tanggal berakhir"}</p>
                <p className="text-xs text-ink-soft">{v.usedCount} digunakan{v.usageLimit != null ? ` / ${v.usageLimit} kuota` : " · tanpa batas total"}{v.perUserLimit != null ? ` · Maks. ${v.perUserLimit} per pelanggan` : ""}</p>
              </div>
              {canUpdate && <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => beginEdit(v)}>Edit<span className="sr-only"> {v.code}</span></Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => toggle(v)}>{v.isActive ? "Nonaktifkan" : "Aktifkan"}<span className="sr-only"> {v.code}</span></Button></div>}
            </li>)}</ul>}
          {vouchers.length === 100 && <p className="p-4 text-xs text-ink-soft">Menampilkan 100 voucher terbaru.</p>}
        </div>
        {(canCreate || (editing && canUpdate)) && <form id="voucher-editor" onSubmit={submitVoucher}
          className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-5 scroll-mt-24">
          <h3 className="font-semibold">{editing ? "Edit voucher" : "Buat voucher"}</h3>
          <fieldset disabled={pending} className="space-y-3">
            <div><Label htmlFor="voucher-code">Kode voucher</Label><Input id="voucher-code" value={draft.code}
              onChange={e => setField("code", e.target.value.toUpperCase())} disabled={!!editing} required minLength={3} maxLength={32} placeholder="GHEVER10"/></div>
            <div><Label htmlFor="voucher-type">Jenis diskon</Label><select id="voucher-type" value={draft.discountType}
              onChange={e => setField("discountType", e.target.value as VoucherDraft["discountType"])}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"><option value="PERCENT">Persentase (%)</option><option value="FIXED">Nominal (Rp)</option></select></div>
            <div><Label htmlFor="voucher-value">Nilai diskon ({draft.discountType === "PERCENT" ? "%" : "Rp"})</Label>
              <Input id="voucher-value" type="number" min={1} max={draft.discountType === "PERCENT" ? 100 : 2147483647} step={1}
                value={draft.discountValue} onChange={e => setField("discountValue", e.target.value)} required /></div>
            <div><Label htmlFor="voucher-min">Minimal belanja (Rp)</Label><Input id="voucher-min" type="number" min={0} step={1} value={draft.minSpend} onChange={e => setField("minSpend", e.target.value)} required /></div>
            <div><Label htmlFor="voucher-max">Maksimal diskon (Rp, opsional)</Label><Input id="voucher-max" type="number" min={1} step={1} value={draft.maxDiscount}
              onChange={e => setField("maxDiscount", e.target.value)} placeholder="Tanpa batas tambahan"/></div>
<div><Label htmlFor="voucher-start">Mulai berlaku (opsional)</Label><Input id="voucher-start" type="datetime-local" value={draft.startsAt}
              onChange={e => setField("startsAt", e.target.value)}/></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="voucher-limit">Kuota total (opsional)</Label><Input id="voucher-limit" type="number" min={1} max={1000000} step={1}
                value={draft.usageLimit} onChange={e => setField("usageLimit", e.target.value)} placeholder="Tanpa batas"/></div>
              <div><Label htmlFor="voucher-per-customer">Batas per pelanggan</Label><Input id="voucher-per-customer" type="number" min={1} max={1000000} step={1}
                value={draft.perUserLimit} onChange={e => setField("perUserLimit", e.target.value)} placeholder="Tanpa batas"/></div>
            </div>
            <div><Label htmlFor="voucher-expiry">Berakhir (opsional)</Label><Input id="voucher-expiry" type="datetime-local" value={draft.expiresAt}
              onChange={e => setField("expiresAt", e.target.value)}/></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive}
              onChange={e => setField("isActive", e.target.checked)} className="accent-black"/> Voucher aktif</label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : editing ? "Simpan perubahan" : "Buat voucher"}</Button>
              {editing && <Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setDraft(initial); }}>Batal edit</Button>}</div>
          </fieldset>
        </form>}
      </div>
    </section>

    <section id="flash-sale" className="space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2"><Bolt size={20}/><h2 className="text-xl font-bold">Flash sale produk</h2></div>
      <p className="text-sm text-ink-soft">Aktifkan harga khusus dan tampilkan produk di halaman Flash Sale. Versi ini diaktifkan/dinonaktifkan manual, belum memiliki jadwal otomatis atau batas kuota.</p>
      {canUpdate && canReadProducts && <div className="grid gap-3 rounded-2xl border border-line bg-white p-5 md:grid-cols-[1fr_180px_auto] md:items-end">
        <div className="min-w-0"><Label htmlFor="flash-product">Pilih produk terbit</Label><select id="flash-product" value={productId} onChange={e => { setProductId(e.target.value); setPrice(""); }}
          className="h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm">
          <option value="">Pilih produk</option>
          {products.filter(p => !p.isFlashSale).map(p => <option key={p.id} value={p.id} disabled={!p.eligible}>{p.name}{!p.eligible ? " — harga varian khusus" : ""}</option>)}
        </select></div>
        <div><Label htmlFor="flash-price">Harga flash sale (Rp)</Label><Input id="flash-price" type="number" min={1} max={selected ? selected.basePrice - 1 : undefined}
          value={price} onChange={e => setPrice(e.target.value)} placeholder={selected ? `Di bawah ${selected.basePrice}` : "Masukkan harga"} /></div>
        <Button type="button" disabled={pending || !selected || !selected.eligible || !price || !Number.isSafeInteger(Number(price)) || Number(price) <= 0 || Number(price) >= (selected?.basePrice || 0)}
          onClick={() => selected && flash(selected, true, Number(price))}>Aktifkan flash sale</Button>
        {selected && <p className="text-xs text-ink-soft md:col-span-3">Harga normal {formatIDR(selected.basePrice)}. Hanya produk dengan harga varian mengikuti harga produk yang bisa diproses di sini.</p>}
      </div>}
      {!canReadProducts ? <p className="rounded-2xl border border-line bg-white p-5 text-sm">Role ini tidak memiliki izin membaca katalog produk.</p> :
        !products.some(p => p.isFlashSale) ? <p className="rounded-2xl border border-line bg-white p-5 text-sm text-ink-soft">Belum ada flash sale aktif.</p>
          : <ul className="divide-y divide-line rounded-2xl border border-line bg-white">{products.filter(p => p.isFlashSale).map(p => <li key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold">{p.name}</p>
              <p className="text-sm text-ink-soft">{formatIDR(p.basePrice)} → {p.salePrice != null ? formatIDR(p.salePrice) : "Periksa harga varian"}</p></div>
            <div className="flex flex-wrap gap-2"><Link href={`/product/${p.slug}`} className="self-center text-xs underline">Lihat produk</Link>
              {canUpdate && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => flash(p, false, null)}>Akhiri flash sale</Button>}</div>
          </li>)}</ul>}
      {products.length === 60 && <p className="text-xs text-ink-soft">Menampilkan 60 produk terbit terbaru/flash sale. Gunakan editor produk untuk item di luar daftar.</p>}
    </section>
    <p className="flex items-start gap-2 text-xs text-ink-soft"><Tag size={16} className="shrink-0"/>Fitur kuota voucher, jadwal flash sale otomatis, banner promosi publik, dan laporan performa kampanye belum tersedia pada tahap ini.</p>
  </div>;
}
