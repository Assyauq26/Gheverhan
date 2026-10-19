"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "@/components/ui/navigation";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, ChevronDown, ImagePlus, Layers3, Package, Info, Check, Save, Sparkles } from "lucide-react";
import { ProductVariantBuilder, type VariantChoice } from "@/components/admin/product-variant-builder";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { saveProductAction, setProductStatusAction } from "@/modules/catalog/product-management.actions";
import type { ProductInput } from "@/modules/catalog/product-management.validation";
import type { ProductEditorData } from "@/modules/catalog/product-management.service";
import type { ProductStatus } from "@prisma/client";

const selectClass = "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50";
type Values = Omit<ProductInput, "images" | "variants"> & { images: ProductEditorData["images"]; variants: (ProductInput["variants"][number] & { reserved?: number })[] };
function valuesFor(p?: ProductEditorData): Values {
  if (p) { const { id: _id, status: _status, updatedAt: _version, ...values } = p; return values; }
  return { name: "", slug: "", description: "", material: "", careInstruction: "", shippingReturn: "", basePrice: 0, salePrice: null, categoryId: null, brandId: null, isFeatured: false, isFlashSale: false, images: [], variants: [{ sku: "", color: "", size: "", price: null, salePrice: null, onHand: 0 }] };
}
function suggestSlug(name: string) { return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
const statusLabels = { DRAFT: "Draft", PUBLISHED: "Terbit", ARCHIVED: "Arsip" };
export function ProductEditor({ initial, categories, brands, canEdit, canStock, canArchive }: {
  initial?: ProductEditorData;
  categories: { id: string; name: string }[]; brands: { id: string; name: string }[];
  canEdit: boolean; canStock: boolean; canArchive: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [values, setValues] = useState<Values>(() => valuesFor(initial));
  const [version, setVersion] = useState(initial?.updatedAt || "");
  const [status, setStatus] = useState<ProductStatus>(initial?.status || "DRAFT");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) { feedback.current?.focus({ preventScroll: true }); feedback.current?.scrollIntoView({ block: "center" }); }
  }, [error]);
  function change<K extends keyof Values>(key: K, value: Values[K]) { setValues(v => ({ ...v, [key]: value })); setDirty(true); setNotice(""); }
  function accept(p: ProductEditorData) { setValues(valuesFor(p)); setVersion(p.updatedAt); setStatus(p.status); setDirty(false); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return; busy.current = true; setPending("save"); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("id", initial?.id || ""); form.set("updatedAt", version); form.set("product", JSON.stringify(values));
      const result = await saveProductAction(form);
      if (!result.ok || !result.data) { setError(result.error || "Produk gagal disimpan"); return; }
      accept(result.data); setNotice("Produk berhasil disimpan.");
      if (!initial) router.push(`/admin/products/${result.data.id}`); else router.refresh();
    } catch { setError("Tidak dapat menyimpan produk. Coba lagi."); } finally { busy.current = false; setPending(null); }
  }
  async function changeStatus(target: ProductStatus) {
    if (!initial || dirty || busy.current) return;
    busy.current = true; setPending(target); setError(""); setNotice("");
    try {
      const result = await setProductStatusAction(initial.id, version, target);
      if (!result.ok || !result.data) { setError(result.error || "Status gagal diperbarui"); return; }
      accept(result.data); setNotice(`Status produk: ${statusLabels[target]}.`); router.refresh();
    } catch { setError("Status gagal diperbarui. Coba lagi."); } finally { busy.current = false; setPending(null); }
  }
  async function upload(file?: File) {
    if (!file || !initial) return;
    if (busy.current) return; busy.current = true;
    setPending("upload"); setError(""); setNotice("");
    try {
      if (file.size > 4 * 1024 * 1024) { setError("Ukuran gambar maksimal 4 MB."); return; }
      const form = new FormData(); form.set("image", file); form.set("updatedAt", version); form.set("alt", values.name);
      const response = await fetch(`/api/v1/admin/products/${initial.id}/images`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.success) { setError(result.error?.message || "Gambar gagal diunggah"); return; }
      setValues(v => ({ ...v, images: [...v.images, result.data.image] })); setVersion(result.data.updatedAt); setDirty(true); setNotice("Gambar diunggah. Simpan perubahan sebelum menerbitkan.");
    } catch { setError("Upload gagal. Periksa koneksi dan coba lagi."); } finally { busy.current = false; setPending(null); }
  }
  function variantChange(index: number, patch: Partial<Values["variants"][number]>) { change("variants", values.variants.map((v, i) => i === index ? { ...v, ...patch } : v)); }
  function appendCombinations(combinations: VariantChoice[]): boolean {
    // A blank create-mode row is only a form placeholder, not a persisted variant.
    const placeholder = values.variants.length === 1 && !values.variants[0].id &&
      !values.variants[0].sku && !values.variants[0].color && !values.variants[0].size &&
      values.variants[0].price == null && values.variants[0].salePrice == null && !values.variants[0].onHand;
    const list = placeholder ? [] : [...values.variants];
    const pairs = new Set(list.map(v => `${v.color.trim().toLocaleLowerCase("id")}::${v.size.trim().toLocaleLowerCase("id")}`));
    const skus = new Set(list.map(v => v.sku.trim().toLocaleLowerCase("id")));
    for (const choice of combinations) {
      const color = choice.color.trim();
      const size = choice.size.trim();
      const key = `${color.toLocaleLowerCase("id")}::${size.toLocaleLowerCase("id")}`;
      if (pairs.has(key)) continue;
      if (list.length >= 50) { setError("Maksimal 50 varian per produk."); return false; }
      const stem = [values.slug || suggestSlug(values.name) || "produk", color, size]
        .map(suggestSlug).filter(Boolean).join("-").slice(0, 70) || "produk";
      let sku = stem;
      let suffix = 2;
      while (skus.has(sku.toLocaleLowerCase("id"))) {
        const ending = `-${suffix++}`;
        sku = stem.slice(0, 80 - ending.length) + ending;
      }
      list.push({ sku, color, size, price: null, salePrice: null, ...(canStock ? { onHand: 0 } : {}) });
      pairs.add(key);
      skus.add(sku.toLocaleLowerCase("id"));
    }
    if (!list.length) return false;
    change("variants", list);
    return true;
  }
  return <div className="mx-auto max-w-6xl space-y-5 pb-5">
    <div className="flex items-center justify-between gap-3">
      <Link href="/admin/products" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-black"><ArrowLeft size={18}/> Kembali ke produk</Link>
      <span data-testid="product-status" className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"><span className={`size-2 rounded-full ${status === "PUBLISHED" ? "bg-emerald-500" : status === "ARCHIVED" ? "bg-zinc-400" : "bg-amber-400"}`}/>{statusLabels[status]}</span>
    </div>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
      <div><h1 className="text-2xl font-bold tracking-[-0.035em] text-zinc-950 sm:text-[30px]">{initial ? "Edit produk" : "Tambah produk"}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{initial ? "Perbarui informasi dan penjualan produk dengan mudah." : "Lengkapi informasi produk, simpan draft, lalu tambahkan foto untuk dipublikasikan."}</p>
      </div>
      <div className="hidden items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs text-zinc-500 shadow-sm sm:flex"><Package size={17} className="text-zinc-700"/> Panel Seller Gheverhan</div>
    </header>
    <div ref={feedback} role="region" aria-label="Status perubahan produk" tabIndex={-1} aria-live="polite" aria-atomic="true" className="focus:outline-none focus-visible:ring-2 focus-visible:ring-black">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</p>}
    </div>
    <form onSubmit={save} data-testid="product-editor" className="space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_300px]">
        <fieldset disabled={!canEdit || !!pending} className="min-w-0 space-y-5">
          <section id="product-images" className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6">
            <div className="mb-4 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100"><ImagePlus size={20}/></span>
              <div><h2 className="text-base font-bold text-zinc-950 sm:text-lg">Foto produk <span aria-hidden="true" className="text-red-500">*</span></h2><p className="mt-0.5 text-xs leading-relaxed text-zinc-500">Foto pertama menjadi gambar utama pada halaman produk.</p></div>
              <span className="ml-auto shrink-0 text-xs font-semibold text-zinc-400">{values.images.length}/10</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {values.images.map((image, index) => <div key={image.id} className="min-w-0">
                <div className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                  {/* Draft photos require the session; optimization does not forward it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.alt || values.name || `Foto produk ${index + 1}`} className="h-full w-full object-cover"/>
                  {index === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-zinc-950 px-1.5 py-1 text-[10px] font-semibold text-white">Utama</span>}
                  <button type="button" disabled={!canEdit || !!pending} aria-label={`Hapus gambar ${index + 1}`} title="Hapus foto" onClick={() => change("images", values.images.filter(i => i.id !== image.id))} className="absolute bottom-1 right-1 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-red-600 shadow-sm transition hover:bg-white"><Trash2 size={15}/></button>
                </div>
                <div className="mt-1.5"><label htmlFor={`image-alt-${image.id}`} className="sr-only">Teks alternatif foto {index + 1}</label><Input id={`image-alt-${image.id}`} value={image.alt} maxLength={200} disabled={!canEdit || !!pending} onChange={e => change("images", values.images.map(i => i.id === image.id ? { ...i, alt: e.target.value } : i))} placeholder="Deskripsi foto" className="h-9 px-2 text-xs"/></div>
                {index !== 0 && <button type="button" disabled={!canEdit || !!pending} onClick={() => change("images", [image, ...values.images.filter(i => i.id !== image.id)])} className="mt-1.5 min-h-8 text-left text-[11px] font-semibold text-zinc-600 underline-offset-2 hover:underline">Jadikan utama</button>}
              </div>)}
              {initial && canEdit && values.images.length < 10 && <label htmlFor="product-image-upload" className="flex aspect-square min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 px-2 text-center text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100"><Plus size={23}/><span>Tambah foto</span></label>}
            </div>
            {initial && <label htmlFor="product-image-upload" className="sr-only">Unggah JPG, PNG, atau WebP</label>}
            {initial && <input id="product-image-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={!canEdit || !!pending || values.images.length >= 10} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} className="sr-only" aria-describedby="product-image-help"/>}
            {!initial && <div className="mt-3 flex items-start gap-2 rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600"><Info size={16} className="mt-0.5 shrink-0"/> Simpan produk sebagai draft terlebih dahulu untuk mengunggah foto.</div>}
            <p id="product-image-help" className="mt-3 text-xs text-zinc-400">JPG, PNG, atau WebP. Maksimal 4 MB per foto dan 10 foto per produk.</p>
          </section>

          <section id="product-basic" className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6">
            <div><h2 className="text-base font-bold text-zinc-950 sm:text-lg">Informasi dasar</h2><p className="mt-1 text-xs text-zinc-500">Buat nama dan identitas produk yang mudah dikenali.</p></div>
            <div><div className="flex justify-between gap-3"><Label htmlFor="product-name">Nama produk <span aria-hidden="true" className="text-red-500">*</span></Label><span className="text-xs text-zinc-400">{values.name.length}/160</span></div>
              <Input id="product-name" aria-label="Nama produk" value={values.name} required minLength={2} maxLength={160} placeholder="Contoh: Kemeja Linen Premium Wanita" onChange={e => { const name = e.target.value; change("name", name); if (!initial && (!values.slug || values.slug === suggestSlug(values.name))) change("slug", suggestSlug(name)); }} />
            </div>
            <div><Label htmlFor="product-category">Kategori</Label><select id="product-category" className={selectClass} value={values.categoryId || ""} onChange={e => change("categoryId", e.target.value || null)}><option value="">Pilih kategori produk</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <Link href="/admin/categories" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-zinc-600 underline-offset-4 hover:underline">Kelola kategori</Link></div>
            <div><Label htmlFor="product-brand">Merek</Label><select id="product-brand" className={selectClass} value={values.brandId || ""} onChange={e => change("brandId", e.target.value || null)}><option value="">Tanpa merek</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div className="border-t border-zinc-100 pt-4"><Label htmlFor="product-slug">Alamat produk (slug) <span aria-hidden="true" className="text-red-500">*</span></Label><Input id="product-slug" aria-label="Alamat produk (slug)" value={values.slug} required maxLength={120} onChange={e => change("slug", e.target.value)} placeholder="nama-produk"/>
              <p className="mt-1.5 break-all text-xs text-zinc-500">/product/{values.slug || "nama-produk"}</p></div>
          </section>

          <section id="product-detail" className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6">
            <div><h2 className="text-base font-bold sm:text-lg">Detail produk</h2><p className="mt-1 text-xs text-zinc-500">Jelaskan bahan, keunggulan, dan cara merawat produk.</p></div>
            <div><Label htmlFor="product-description">Deskripsi</Label><Textarea id="product-description" value={values.description} rows={5} maxLength={10000} placeholder="Ceritakan spesifikasi dan keunggulan produk secara jelas..." onChange={e => change("description", e.target.value)} className="resize-y"/><p className="mt-1 text-right text-xs text-zinc-400">{values.description.length}/10.000</p></div>
            <div className="grid gap-4 sm:grid-cols-2">{([["material", "Material"], ["careInstruction", "Petunjuk perawatan"]] as const).map(([key, label]) => <div key={key}><Label htmlFor={`product-${key}`}>{label}</Label><Textarea id={`product-${key}`} value={values[key]} maxLength={2000} rows={3} onChange={e => change(key, e.target.value)} placeholder={key === "material" ? "Contoh: Katun premium" : "Contoh: Cuci dengan air dingin"}/></div>)}</div>
          </section>

          <section id="product-pricing" className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6">
            <div><h2 className="text-base font-bold sm:text-lg">Informasi penjualan</h2><p className="mt-1 text-xs text-zinc-500">Tentukan harga utama. Harga khusus dapat diatur per varian.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="product-price">Harga normal (Rp) <span aria-hidden="true" className="text-red-500">*</span></Label><Input id="product-price" aria-label="Harga normal (Rp)" type="number" inputMode="numeric" min={1} max={2147483647} step={1} required value={values.basePrice || ""} onChange={e => change("basePrice", Number(e.target.value))} placeholder="0"/></div>
              <div><Label htmlFor="product-sale-price">Harga diskon (opsional)</Label><Input id="product-sale-price" type="number" inputMode="numeric" min={1} step={1} value={values.salePrice ?? ""} onChange={e => change("salePrice", e.target.value ? Number(e.target.value) : null)} placeholder="Opsional"/></div>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500"><Info size={14} className="mr-1 inline-block"/> Harga diskon harus lebih rendah dari harga normal.</p>
          </section>

          <section id="product-variants" className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-base font-bold sm:text-lg"><Layers3 size={19}/> Varian &amp; stok</h2><p className="mt-1 text-xs text-zinc-500">Kelola warna, ukuran, harga, SKU, dan persediaan.</p></div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">{values.variants.length} / 50</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-3">
              <ProductVariantBuilder disabled={!canEdit || !!pending} variants={values.variants} onAdd={appendCombinations}/>
              <Button type="button" variant="outline" size="sm" className="min-h-10 border-zinc-300" disabled={!canEdit || !!pending || values.variants.length >= 50} onClick={() => change("variants", [...values.variants, { sku: "", color: "", size: "", price: null, salePrice: null, ...(canStock ? { onHand: 0 } : {}) }])}><Plus size={16}/> Tambah manual</Button>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">SKU wajib unik. Harga varian yang kosong mengikuti harga utama. Varian yang sudah digunakan dalam transaksi mungkin tidak dapat dihapus.</p>
            <div className="space-y-3">
              {values.variants.map((v, index) => <details key={v.id || `new-${index}`} open className="group min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 bg-zinc-50 px-3 py-3 text-sm transition-colors hover:bg-zinc-100 sm:px-4 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white font-bold text-zinc-600 shadow-sm">{index + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-zinc-900">{[v.color, v.size].filter(Boolean).join(" · ") || `Varian ${index + 1}`}</span><span className="mt-0.5 block truncate text-xs text-zinc-500">{v.sku || "SKU belum diisi"}</span></span>
                  <ChevronDown size={17} className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180"/>
                </summary>
                <div className="space-y-3 border-t border-zinc-200 p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {([["sku", "SKU"], ["color", "Warna"], ["size", "Ukuran"]] as const).map(([key, label]) => <div key={key}><Label htmlFor={`variant-${index}-${key}`}>{label}{key === "sku" && <span aria-hidden="true" className="text-red-500"> *</span>}</Label><Input id={`variant-${index}-${key}`} aria-label={label} value={v[key] || ""} required={key === "sku"} maxLength={key === "sku" ? 80 : key === "color" ? 80 : 40} placeholder={key === "sku" ? "SKU unik" : key === "color" ? "Contoh: Hitam" : "Contoh: M"} onChange={e => variantChange(index, { [key]: e.target.value })}/></div>)}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {([["price", "Harga varian (Rp)"], ["salePrice", "Diskon varian (Rp)"]] as const).map(([key, label]) => <div key={key}><Label htmlFor={`variant-${index}-${key}`}>{label}</Label><Input id={`variant-${index}-${key}`} type="number" inputMode="numeric" min={1} step={1} value={v[key] ?? ""} placeholder="Ikuti harga utama" onChange={e => variantChange(index, { [key]: e.target.value ? Number(e.target.value) : null })}/></div>)}
                    {(canStock || v.onHand !== undefined) && <div><Label htmlFor={`variant-${index}-stock`}>Stok fisik</Label><Input id={`variant-${index}-stock`} type="number" inputMode="numeric" min={v.reserved ?? 0} step={1} disabled={!canStock} value={v.onHand ?? 0} onChange={e => variantChange(index, { onHand: Number(e.target.value) })}/><p className="mt-1 text-xs text-zinc-500">{v.reserved ?? 0} unit direservasi.</p></div>}
                  </div>
                  <div className="flex justify-end border-t border-zinc-100 pt-2"><Button type="button" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Hapus varian ${index + 1}`} disabled={!canEdit || !!pending || values.variants.length === 1} onClick={() => change("variants", values.variants.filter((_, i) => i !== index))}><Trash2 size={15}/> Hapus varian</Button></div>
                </div>
              </details>)}
            </div>
          </section>

          <section id="product-settings" className="min-w-0 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-6">
            <h2 className="text-base font-bold sm:text-lg">Pengaturan lainnya</h2>
            <div><Label htmlFor="product-shippingReturn">Pengiriman &amp; pengembalian</Label><Textarea id="product-shippingReturn" value={values.shippingReturn} maxLength={2000} rows={3} placeholder="Tuliskan kebijakan pengiriman dan pengembalian..." onChange={e => change("shippingReturn", e.target.value)}/></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 text-sm font-medium"><span>Produk unggulan</span><input type="checkbox" checked={values.isFeatured} onChange={e => change("isFeatured", e.target.checked)} className="h-5 w-5 accent-black"/></label>
              <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 text-sm font-medium"><span>Flash sale</span><input type="checkbox" checked={values.isFlashSale} onChange={e => change("isFlashSale", e.target.checked)} className="h-5 w-5 accent-black"/></label>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">Draft dan arsip tidak dapat dibeli melalui storefront. Arsip tetap menyimpan riwayat pesanan.</p>
          </section>
        </fieldset>
        <aside className="hidden space-y-4 lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_3px_14px_rgba(0,0,0,.025)]">
              <h2 className="text-sm font-bold text-zinc-950">Isi data produk</h2>
              <p className="mb-4 mt-1 text-xs leading-relaxed text-zinc-500">Navigasi cepat untuk melengkapi katalog.</p>
              <nav aria-label="Bagian editor produk" className="space-y-1">
                {([["product-images","Foto produk"],["product-basic","Informasi dasar"],["product-detail","Detail produk"],["product-pricing","Harga"],["product-variants","Varian & stok"],["product-settings","Pengaturan lainnya"]] as const).map(([href,label],index) => <a key={href} href={`#${href}`} className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"><span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-100 text-[11px] font-bold">{index+1}</span>{label}</a>)}
              </nav>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={18}/> Tips katalog</div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600">Gunakan nama yang spesifik, foto yang terang, dan SKU unik untuk setiap kombinasi. Pastikan harga dan stok sudah benar sebelum publikasi.</p>
            </div>
          </div>
        </aside>
      </div>
      {canEdit && <div className="sticky bottom-[82px] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-[0_-5px_22px_rgba(0,0,0,.055)] backdrop-blur-lg md:bottom-4 sm:p-4">
        <span className="min-w-0 flex-1 text-xs font-medium text-zinc-500">{dirty ? "Ada perubahan yang belum disimpan." : initial ? "Seluruh perubahan telah disimpan." : "Simpan draft untuk melanjutkan."}</span>
        <Button type="submit" disabled={!!pending} data-testid="save-product" className="h-11 shrink-0 rounded-xl px-5 sm:px-7"><Save size={17}/>{pending === "save" ? "Menyimpan..." : initial ? "Simpan perubahan" : "Simpan draft"}</Button>
      </div>}
    </form>
    {initial && <section id="product-publication" className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
      <div><h2 className="text-base font-bold sm:text-lg">Publikasi</h2><p className="mt-1 text-xs leading-relaxed text-zinc-500">Simpan perubahan terlebih dahulu sebelum mengubah status. Produk terbit langsung tersedia di katalog.</p></div>
      <div className="flex flex-wrap gap-2">
        {canEdit && status !== "PUBLISHED" && <Button type="button" disabled={!!pending || dirty} onClick={() => void changeStatus("PUBLISHED")} data-testid="publish-product" className="min-h-11 rounded-xl"><Check size={17}/>{pending === "PUBLISHED" ? "Menerbitkan..." : "Terbitkan produk"}</Button>}
        {canEdit && status !== "DRAFT" && <Button type="button" variant="outline" disabled={!!pending || dirty} onClick={() => void changeStatus("DRAFT")} data-testid="draft-product" className="min-h-11 rounded-xl">Ubah menjadi draft</Button>}
        {canArchive && status !== "ARCHIVED" && <Button type="button" variant="outline" disabled={!!pending || dirty} onClick={() => void changeStatus("ARCHIVED")} data-testid="archive-product" className="min-h-11 rounded-xl">{pending === "ARCHIVED" ? "Mengarsipkan..." : "Arsipkan produk"}</Button>}
        {status === "PUBLISHED" && <Button asChild variant="outline" className="min-h-11 rounded-xl"><Link href={`/product/${values.slug}`}>Lihat di storefront</Link></Button>}
      </div>
      {dirty && <p className="text-xs font-medium text-amber-700">Simpan semua perubahan sebelum mengubah status produk.</p>}
    </section>}
  </div>;
}
