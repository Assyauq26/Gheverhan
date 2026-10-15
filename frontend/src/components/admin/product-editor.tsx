"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "@/components/ui/navigation";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, Upload } from "lucide-react";
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
  return <div className="mx-auto max-w-5xl space-y-6">
    <Link href="/admin/products" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink"><ArrowLeft size={16} /> Semua produk</Link>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-ink">{initial ? "Edit produk" : "Tambah produk"}</h1><p className="mt-1 text-sm text-ink-soft">{initial ? "Kelola informasi, varian, stok, dan gambar produk." : "Simpan sebagai draft, tambahkan gambar, lalu terbitkan."}</p></div>
      <span data-testid="product-status" className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold">{statusLabels[status]}</span>
    </header>
    <div ref={feedback} role="region" aria-label="Status perubahan produk" tabIndex={-1} aria-live="polite" aria-atomic="true" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black">
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-white p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-line bg-white p-3 text-sm">{notice}</p>}
    </div>
    <form onSubmit={save} data-testid="product-editor" className="space-y-6">
      <fieldset disabled={!canEdit || !!pending} className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <section className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Informasi produk</h2>
          <div><Label htmlFor="product-name">Nama produk</Label><Input id="product-name" value={values.name} required minLength={2} maxLength={160} onChange={e => { const name = e.target.value; change("name", name); if (!initial && (!values.slug || values.slug === suggestSlug(values.name))) change("slug", suggestSlug(name)); }} /></div>
          <div><Label htmlFor="product-slug">Slug</Label><Input id="product-slug" value={values.slug} required maxLength={120} onChange={e => change("slug", e.target.value)} /><p className="mt-1 text-xs text-ink-soft">Alamat produk: /product/{values.slug || "nama-produk"}</p></div>
          <div><Label htmlFor="product-description">Deskripsi</Label><Textarea id="product-description" value={values.description} maxLength={10000} onChange={e => change("description", e.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="product-price">Harga normal (Rp)</Label><Input id="product-price" type="number" min={1} max={2147483647} step={1} required value={values.basePrice || ""} onChange={e => change("basePrice", Number(e.target.value))} /></div><div><Label htmlFor="product-sale-price">Harga diskon (opsional)</Label><Input id="product-sale-price" type="number" min={1} step={1} value={values.salePrice ?? ""} onChange={e => change("salePrice", e.target.value ? Number(e.target.value) : null)} /></div></div>
          {([['material', 'Material'], ['careInstruction', 'Petunjuk perawatan'], ['shippingReturn', 'Pengiriman & pengembalian']] as const).map(([key, label]) => <div key={key}><Label htmlFor={`product-${key}`}>{label}</Label><Textarea id={`product-${key}`} value={values[key]} maxLength={2000} onChange={e => change(key, e.target.value)} /></div>)}
        </section>
        <section className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Organisasi katalog</h2>
          <div><Label htmlFor="product-category">Kategori</Label><select id="product-category" className={selectClass} value={values.categoryId || ""} onChange={e => change("categoryId", e.target.value || null)}><option value="">Tanpa kategori</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <Link href="/admin/categories" className="inline-block text-sm underline underline-offset-4">Kelola kategori</Link>
          <div><Label htmlFor="product-brand">Brand</Label><select id="product-brand" className={selectClass} value={values.brandId || ""} onChange={e => change("brandId", e.target.value || null)}><option value="">Tanpa brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={values.isFeatured} onChange={e => change("isFeatured", e.target.checked)} className="h-4 w-4 accent-black" /> Produk unggulan</label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={values.isFlashSale} onChange={e => change("isFlashSale", e.target.checked)} className="h-4 w-4 accent-black" /> Flash sale</label>
          <p className="text-sm text-ink-soft">Produk draft dan arsip tidak dapat dibeli melalui storefront. Arsip menjaga riwayat pesanan.</p>
        </section>
      </fieldset>
      <section className="space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Varian & stok</h2><Button type="button" variant="outline" size="sm" disabled={!canEdit || !!pending || values.variants.length >= 50} onClick={() => change("variants", [...values.variants, { sku: "", color: "", size: "", price: null, salePrice: null, ...(canStock ? { onHand: 0 } : {}) }])}><Plus size={16} /> Tambah varian</Button></div>
        <p className="text-sm text-ink-soft">SKU harus unik. Harga kosong mengikuti harga produk. Varian dengan riwayat transaksi tidak dapat dihapus.</p>
        {values.variants.map((v, index) => <fieldset key={v.id || `new-${index}`} disabled={!canEdit || !!pending} className="min-w-0 space-y-3 border-t border-line pt-4">
          <legend className="pt-4 text-sm font-semibold">Varian {index + 1}</legend>
          <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" aria-label={`Hapus varian ${index + 1}`} disabled={values.variants.length === 1} onClick={() => change("variants", values.variants.filter((_, i) => i !== index))}><Trash2 size={16} /> Hapus</Button></div>
          <div className="grid gap-3 sm:grid-cols-3">{([['sku', 'SKU'], ['color', 'Warna'], ['size', 'Ukuran']] as const).map(([key, label]) => <div key={key}><Label htmlFor={`variant-${index}-${key}`}>{label}</Label><Input id={`variant-${index}-${key}`} value={v[key] || ""} required={key === "sku"} maxLength={key === "sku" ? 80 : key === "color" ? 80 : 40} onChange={e => variantChange(index, { [key]: e.target.value })} /></div>)}</div>
          <div className="grid gap-3 sm:grid-cols-3">{([['price', 'Harga varian (Rp)'], ['salePrice', 'Harga diskon varian']] as const).map(([key, label]) => <div key={key}><Label htmlFor={`variant-${index}-${key}`}>{label}</Label><Input id={`variant-${index}-${key}`} type="number" min={1} step={1} value={v[key] ?? ""} onChange={e => variantChange(index, { [key]: e.target.value ? Number(e.target.value) : null })} /></div>)}{(canStock || v.onHand !== undefined) && <div><Label htmlFor={`variant-${index}-stock`}>Stok fisik</Label><Input id={`variant-${index}-stock`} type="number" min={v.reserved ?? 0} step={1} disabled={!canStock} value={v.onHand ?? 0} onChange={e => variantChange(index, { onHand: Number(e.target.value) })} /><p className="mt-1 text-xs text-ink-soft">{v.reserved ?? 0} unit direservasi.</p></div>}</div>
        </fieldset>)}
      </section>
      <section className="space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Gambar produk</h2>
        {!initial ? <p className="text-sm text-ink-soft">Simpan draft terlebih dahulu untuk mengunggah gambar.</p> : <div><Label htmlFor="product-image-upload"><span className="inline-flex items-center gap-2"><Upload size={16} /> Unggah JPG, PNG, atau WebP</span></Label><input id="product-image-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={!canEdit || !!pending || values.images.length >= 10} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} className="block w-full text-sm file:mr-3 file:rounded-full file:border file:border-line file:bg-white file:px-4 file:py-2 file:font-semibold" aria-describedby="product-image-help" /><p id="product-image-help" className="mt-2 text-xs text-ink-soft">Maksimal 4 MB per file dan 10 gambar. Gambar pertama menjadi foto utama.</p></div>}
        {!values.images.length && <p className="py-4 text-sm text-ink-soft">Belum ada gambar. Tambahkan minimal satu sebelum menerbitkan.</p>}
        <div className="grid gap-4 sm:grid-cols-2">{values.images.map((image, index) => <div key={image.id} className="flex min-w-0 gap-3 border-t border-line pt-4">
          {/* Draft photos require the browser session; image optimization does not forward it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt || values.name} className="h-20 w-20 shrink-0 rounded-xl bg-surface object-cover" />
          <div className="min-w-0 flex-1 space-y-2"><Label htmlFor={`image-alt-${image.id}`}>Teks alternatif</Label><Input id={`image-alt-${image.id}`} value={image.alt} maxLength={200} disabled={!canEdit || !!pending} onChange={e => change("images", values.images.map(i => i.id === image.id ? { ...i, alt: e.target.value } : i))} /><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="ghost" disabled={!canEdit || !!pending || index === 0} onClick={() => change("images", [image, ...values.images.filter(i => i.id !== image.id)])}>Jadikan utama</Button><Button type="button" size="sm" variant="ghost" aria-label={`Hapus gambar ${index + 1}`} disabled={!canEdit || !!pending} onClick={() => change("images", values.images.filter(i => i.id !== image.id))}><Trash2 size={14} /> Hapus</Button></div></div>
        </div>)}</div>
      </section>
      {canEdit && <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={!!pending} data-testid="save-product">{pending === "save" ? "Menyimpan..." : initial ? "Simpan perubahan" : "Simpan draft"}</Button>{dirty && <p className="text-sm text-ink-soft">Ada perubahan yang belum disimpan.</p>}</div>}
    </form>
    {initial && <section className="space-y-3 border-t border-line pt-6"><h2 className="text-lg font-semibold">Publikasi</h2><p className="text-sm text-ink-soft">Simpan perubahan sebelum mengubah status. Produk terbit langsung tersedia di katalog.</p><div className="flex flex-wrap gap-3">
      {canEdit && status !== "PUBLISHED" && <Button type="button" disabled={!!pending || dirty} onClick={() => void changeStatus("PUBLISHED")} data-testid="publish-product">{pending === "PUBLISHED" ? "Menerbitkan..." : "Terbitkan produk"}</Button>}
      {canEdit && status !== "DRAFT" && <Button type="button" variant="outline" disabled={!!pending || dirty} onClick={() => void changeStatus("DRAFT")} data-testid="draft-product">Ubah menjadi draft</Button>}
      {canArchive && status !== "ARCHIVED" && <Button type="button" variant="outline" disabled={!!pending || dirty} onClick={() => void changeStatus("ARCHIVED")} data-testid="archive-product">{pending === "ARCHIVED" ? "Mengarsipkan..." : "Arsipkan produk"}</Button>}
      {status === "PUBLISHED" && <Button asChild variant="outline"><Link href={`/product/${values.slug}`}>Lihat di storefront</Link></Button>}
    </div></section>}
  </div>;
}
