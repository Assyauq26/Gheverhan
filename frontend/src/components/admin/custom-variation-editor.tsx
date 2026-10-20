"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Camera,
  X,
  Layers3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canonicalOption,
  combinationCount,
  combinationKey,
  generateCombinations,
  optionLabel,
  type OptionGroup,
} from "@/modules/catalog/variation-domain";
import type { ProductInput } from "@/modules/catalog/product-management.validation";

type Row = ProductInput["variants"][number] & {
  reserved?: number;
  protected?: boolean;
};
type Photo = { id: string; url: string; alt: string; recovered?: boolean };
type Props = {
  groups: OptionGroup[];
  rows: Row[];
  photos: Photo[];
  optionPhotos: Photo[];
  canUndoPhotos: boolean;
  onRemovePhoto: (id: string) => void;
  onUndoPhotos: () => void;
  disabled: boolean;
  canStock: boolean;
  hasDraft: boolean;
  basePrice: number;
  onChange: (groups: OptionGroup[], rows: Row[]) => void;
  onDraft: () => Promise<boolean>;
  onUpload: (
    file: File,
    progress: (percent: number) => void,
  ) => Promise<Photo | undefined>;
};
function move<T>(rows: T[], index: number, delta: number) {
  const next = [...rows];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
export function CustomVariationEditor(p: Props) {
  const [error, setError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirm: string;
    run: () => void;
  } | null>(null);
  const [upload, setUpload] = useState<{ id: string; progress: number } | null>(
    null,
  );
  const retry = useRef<{ id: string; file: File } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusAfterConfirm = useRef(false);
  const count = combinationCount(p.groups);
  const blocked = p.disabled || upload !== null;
  function change(groups: OptionGroup[], rows = p.rows) {
    setError("");
    setUploadNotice("");
    p.onChange(groups, rows);
  }
  function groupChange(id: string, patch: Partial<OptionGroup>) {
    change(p.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function valueChange(
    groupId: string,
    valueId: string,
    patch: Partial<OptionGroup["values"][number]>,
  ) {
    change(
      p.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              values: g.values.map((v) =>
                v.id === valueId ? { ...v, ...patch } : v,
              ),
            }
          : g,
      ),
    );
  }
  function removeValue(groupId: string, valueId: string) {
    if (
      p.rows.some(
        (row) => row.protected && row.optionValueIds?.includes(valueId),
      )
    ) {
      setError(
        "Opsi ini dipakai SKU dengan stok atau riwayat. Pertahankan opsi tersebut; nama dan foto tetap dapat diubah.",
      );
      return;
    }
    setConfirmation({
      title: "Hapus opsi?",
      description:
        "Kombinasi yang memakai opsi ini perlu ditinjau kembali. Foto historis tetap dilindungi server.",
      confirm: "Hapus opsi",
      run: () =>
        groupChange(groupId, {
          values: p.groups
            .find((g) => g.id === groupId)!
            .values.filter((v) => v.id !== valueId),
        }),
    });
  }
  function imageMode(group: OptionGroup, checked: boolean) {
    const previous = p.groups.find((g) => g.allowsImage && g.id !== group.id);
    const apply = () =>
      change(
        p.groups.map((g) => ({
          ...g,
          allowsImage: g.id === group.id ? checked : false,
          values: g.values.map((v) => ({
            ...v,
            imageId: g.id === group.id && checked ? v.imageId : null,
          })),
        })),
      );
    if (checked && previous)
      setConfirmation({
        title: "Pindahkan foto variasi?",
        description: `Foto variasi hanya dapat digunakan pada satu jenis variasi. Foto saat ini digunakan pada ${previous.name}. Memindahkan fitur gambar ke ${group.name} akan melepaskan hubungan foto dari pilihan sebelumnya.`,
        confirm: "Pindahkan",
        run: apply,
      });
    else if (!checked && group.values.some((v) => v.imageId))
      setConfirmation({
        title: "Nonaktifkan foto variasi?",
        description:
          "Mapping foto akan dilepas. Objek historis tidak dihapus secara otomatis; server menjaga referensi pesanan.",
        confirm: "Nonaktifkan",
        run: apply,
      });
    else apply();
  }
  async function send(groupId: string, valueId: string, file: File) {
    if (blocked) return;
    retry.current = { id: valueId, file };
    setUploadNotice("");
    setUpload({ id: valueId, progress: 0 });
    setError("");
    try {
      const image = await p.onUpload(file, (progress) =>
        setUpload({ id: valueId, progress }),
      );
      if (image) {
        valueChange(groupId, valueId, { imageId: image.id });
        setUploadNotice(
          image.recovered
            ? "Hasil upload dipulihkan dari server. Simpan Variasi untuk memasang mapping foto."
            : "Foto tersimpan di draft. Simpan Variasi untuk memasang mapping foto.",
        );
        retry.current = null;
      } else
        setError(
          "Foto gagal diunggah. Data variasi tetap tersimpan dalam editor; coba lagi.",
        );
    } catch {
      setError("Upload gagal. Periksa koneksi dan coba lagi.");
    } finally {
      setUpload(null);
    }
  }
  function generate() {
    if (count > 50) {
      setError(
        "Jumlah kombinasi melebihi batas maksimum 50 SKU. Kurangi beberapa opsi untuk melanjutkan.",
      );
      return;
    }
    if (
      !p.groups.length ||
      p.groups.some(
        (g) =>
          !g.name.trim() ||
          !g.values.length ||
          g.values.some((v) => !v.value.trim()),
      )
    ) {
      setError(
        "Lengkapi nama variasi dan minimal satu opsi sebelum membuat SKU.",
      );
      root.current?.querySelector<HTMLInputElement>("input:invalid")?.focus();
      return;
    }
    if (
      new Set(p.groups.map((g) => canonicalOption(g.name))).size !==
        p.groups.length ||
      p.groups.some(
        (g) =>
          new Set(g.values.map((v) => canonicalOption(v.value))).size !==
          g.values.length,
      )
    ) {
      setError(
        "Nama variasi dan nilai opsi dalam satu grup tidak boleh duplikat.",
      );
      return;
    }
    const combinations = generateCombinations(p.groups),
      keys = new Set(combinations.map(combinationKey));
    const existing = new Map(
      p.rows.map((row) => [combinationKey(row.optionValueIds ?? []), row]),
    );
    const removed = p.rows.filter(
      (row) => !keys.has(combinationKey(row.optionValueIds ?? [])),
    );
    if (removed.some((row) => row.protected)) {
      setError(
        "Pembentukan ini mengubah identitas SKU dengan stok/riwayat. Pertahankan opsi lama atau gunakan produk baru untuk jenis variasi baru.",
      );
      return;
    }
    const apply = () =>
      change(
        p.groups,
        combinations.map(
          (ids) =>
            existing.get(combinationKey(ids)) ?? {
              sku: "GHV-" + crypto.randomUUID(),
              color: "",
              size: "",
              price: null,
              salePrice: null,
              ...(p.canStock ? { onHand: 0 } : {}),
              optionValueIds: ids,
            },
        ),
      );
    if (removed.some((row) => row.id || row.sku || row.price || row.onHand))
      setConfirmation({
        title: "Review pembentukan SKU",
        description: `${removed.length} SKU yang tidak sesuai kombinasi baru akan dilepas dari draft. Harga dan stok untuk kombinasi yang tetap sama dipertahankan. Server menolak penghapusan SKU bersejarah.`,
        confirm: "Buat kombinasi",
        run: apply,
      });
    else apply();
  }
  function rowChange(index: number, patch: Partial<Row>) {
    change(
      p.groups,
      p.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }
  return (
    <div
      className="variation-editor"
      ref={root}
      data-testid="custom-variation-editor"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement)
          event.preventDefault();
      }}
    >
      <div className="variation-heading">
        <div>
          <p className="variation-eyebrow">KATALOG / VARIASI</p>
          <h2>Variasi Produk</h2>
          <p>Atur pilihan pelanggan, lalu buat SKU untuk setiap kombinasi.</p>
        </div>
        <Layers3 aria-hidden="true" size={24} />
      </div>
      {error && (
        <div role="alert" className="variation-alert" tabIndex={-1}>
          {error}
        </div>
      )}
      {uploadNotice && <p role="status">{uploadNotice}</p>}
      {!p.groups.length && (
        <div className="variation-empty">
          <Layers3 size={28} aria-hidden="true" />
          <h3>Satu produk, banyak pilihan</h3>
          <p>
            Tambahkan variasi seperti Warna, Model, Motif atau Kapasitas. Setiap
            pilihan akan terhubung ke SKU yang tepat.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={blocked}
            onClick={() =>
              change([
                {
                  id: crypto.randomUUID(),
                  name: "",
                  allowsImage: false,
                  values: [
                    { id: crypto.randomUUID(), value: "", imageId: null },
                  ],
                },
              ])
            }
          >
            <Plus size={18} /> Tambah variasi pertama
          </Button>
        </div>
      )}
      <div className="variation-groups">
        {p.groups.map((group, index) => (
          <section
            className="variation-card"
            key={group.id}
            aria-labelledby={`group-title-${group.id}`}
          >
            <header className="variation-card-header">
              <div className="variation-field">
                <label htmlFor={`group-title-${group.id}`}>
                  Nama variasi {index + 1} <span aria-hidden="true">*</span>
                </label>
                <input
                  id={`group-title-${group.id}`}
                  aria-label={`Nama variasi ${index + 1}`}
                  required
                  maxLength={80}
                  value={group.name}
                  aria-invalid={
                    !!group.name &&
                    p.groups.filter(
                      (g) =>
                        canonicalOption(g.name) === canonicalOption(group.name),
                    ).length > 1
                  }
                  disabled={blocked}
                  placeholder="Contoh: Warna, Model, Motif, Kapasitas"
                  onChange={(e) =>
                    groupChange(group.id, { name: e.target.value })
                  }
                />
              </div>
              <div className="variation-tools">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Pindahkan variasi ${index + 1} ke atas`}
                  disabled={blocked || index === 0}
                  onClick={() => change(move(p.groups, index, -1))}
                >
                  <ArrowUp size={17} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Pindahkan variasi ${index + 1} ke bawah`}
                  disabled={blocked || index === p.groups.length - 1}
                  onClick={() => change(move(p.groups, index, 1))}
                >
                  <ArrowDown size={17} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus variasi ${index + 1}`}
                  disabled={blocked}
                  onClick={() => {
                    if (p.rows.some((v) => v.protected)) {
                      setError(
                        "Jenis variasi SKU berstok/bersejarah tidak dapat dihapus.",
                      );
                      return;
                    }
                    setConfirmation({
                      title: "Hapus jenis variasi?",
                      description:
                        "Daftar SKU perlu dibuat ulang. Perubahan belum disimpan sampai Anda menyimpan produk.",
                      confirm: "Hapus variasi",
                      run: () =>
                        change(p.groups.filter((g) => g.id !== group.id)),
                    });
                  }}
                >
                  <Trash2 size={17} />
                </Button>
              </div>
            </header>
            <label className="variation-image-switch">
              <span>
                <strong>Tambahkan gambar</strong>
                <small>Foto dapat diaktifkan pada satu jenis variasi.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Tambahkan gambar ${group.name || `variasi ${index + 1}`}`}
                checked={group.allowsImage}
                disabled={blocked}
                onChange={(e) => imageMode(group, e.target.checked)}
              />
            </label>
            {group.allowsImage && !p.hasDraft && (
              <div className="variation-draft">
                <p>
                  Simpan draft terlebih dahulu agar foto terikat ke produk yang
                  benar. Data variasi Anda tetap berada di editor.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={blocked}
                  onClick={() => void p.onDraft()}
                >
                  Simpan draft untuk foto
                </Button>
              </div>
            )}
            <div className="variation-values">
              {group.values.map((value, vi) => {
                const image = p.photos.find(
                  (image) => image.id === value.imageId,
                );
                return (
                  <div
                    key={value.id}
                    className={`variation-value-row ${group.allowsImage ? "with-image" : ""}`}
                  >
                    <div className="variation-reorder">
                      <button
                        type="button"
                        aria-label={`Pindahkan opsi ${value.value || vi + 1} ke atas`}
                        disabled={blocked || vi === 0}
                        onClick={() =>
                          groupChange(group.id, {
                            values: move(group.values, vi, -1),
                          })
                        }
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Pindahkan opsi ${value.value || vi + 1} ke bawah`}
                        disabled={blocked || vi === group.values.length - 1}
                        onClick={() =>
                          groupChange(group.id, {
                            values: move(group.values, vi, 1),
                          })
                        }
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                    {group.allowsImage && (
                      <div className="variation-photo">
                        <button
                          type="button"
                          className="variation-photo-picker"
                          aria-label={`${image ? "Ganti" : "Unggah"} foto ${value.value || `opsi ${vi + 1}`}`}
                          disabled={blocked || !p.hasDraft}
                          onClick={() =>
                            root.current
                              ?.querySelector<HTMLInputElement>(
                                `[data-upload-id="${value.id}"]`,
                              )
                              ?.click()
                          }
                        >
                          {image ? (
                            <Image
                              unoptimized
                              src={image.url}
                              alt={image.alt || value.value}
                              width={56}
                              height={56}
                            />
                          ) : (
                            <Camera size={21} aria-hidden="true" />
                          )}
                        </button>
                        <input
                          type="file"
                          tabIndex={-1}
                          className="sr-only"
                          aria-label={`File foto ${value.value || vi + 1}`}
                          data-upload-id={value.id}
                          accept="image/jpeg,image/png,image/webp"
                          disabled={blocked || !p.hasDraft}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void send(group.id, value.id, file);
                            e.target.value = "";
                          }}
                        />
                        {image && (
                          <button
                            type="button"
                            aria-label={`Lepaskan foto ${value.value}`}
                            disabled={blocked}
                            onClick={() =>
                              valueChange(group.id, value.id, { imageId: null })
                            }
                          >
                            Lepas
                          </button>
                        )}
                      </div>
                    )}
                    <div className="variation-field">
                      <label htmlFor={`option-value-${value.id}`}>
                        Opsi {vi + 1} <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id={`option-value-${value.id}`}
                        aria-label={`Opsi ${group.name || index + 1} ${vi + 1}`}
                        maxLength={80}
                        required
                        value={value.value}
                        aria-invalid={
                          !!value.value &&
                          group.values.filter(
                            (v) =>
                              canonicalOption(v.value) ===
                              canonicalOption(value.value),
                          ).length > 1
                        }
                        placeholder="Nama pilihan"
                        disabled={blocked}
                        onChange={(e) =>
                          valueChange(group.id, value.id, {
                            value: e.target.value,
                          })
                        }
                      />
                      {group.allowsImage && p.photos.length > 0 && (
                        <>
                          <label
                            className="sr-only"
                            htmlFor={`stored-photo-${value.id}`}
                          >
                            Foto tersimpan untuk{" "}
                            {value.value || `opsi ${vi + 1}`}
                          </label>
                          <select
                            id={`stored-photo-${value.id}`}
                            aria-label={`Foto tersimpan untuk ${value.value || `opsi ${vi + 1}`}`}
                            value={value.imageId || ""}
                            disabled={blocked}
                            onChange={(e) =>
                              valueChange(group.id, value.id, {
                                imageId: e.target.value || null,
                              })
                            }
                          >
                            <option value="">Pilih foto tersimpan</option>
                            {p.photos.map((photo, pi) => (
                              <option key={photo.id} value={photo.id}>
                                Foto {pi + 1}: {photo.alt || "Produk"}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {upload?.id === value.id && (
                        <span role="status">
                          Mengunggah {upload.progress}%
                          <progress value={upload.progress} max={100} />
                        </span>
                      )}
                      {retry.current?.id === value.id && upload === null && (
                        <button
                          type="button"
                          className="variation-link"
                          disabled={blocked}
                          onClick={() =>
                            void send(group.id, value.id, retry.current!.file)
                          }
                        >
                          Coba unggah lagi
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Hapus opsi ${value.value || vi + 1}`}
                      disabled={blocked}
                      onClick={() => removeValue(group.id, value.id)}
                    >
                      <X size={17} />
                    </Button>
                  </div>
                );
              })}
            </div>
            <footer className="variation-card-footer">
              <Button
                type="button"
                variant="ghost"
                disabled={blocked || group.values.length >= 50}
                onClick={() =>
                  groupChange(group.id, {
                    values: [
                      ...group.values,
                      { id: crypto.randomUUID(), value: "", imageId: null },
                    ],
                  })
                }
              >
                <Plus size={17} /> Tambahkan opsi
              </Button>
              <span>{group.values.length} / 50 opsi</span>
            </footer>
          </section>
        ))}
      </div>
      {p.groups.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="variation-add-group"
          disabled={blocked || p.groups.length >= 3}
          onClick={() =>
            change([
              ...p.groups,
              {
                id: crypto.randomUUID(),
                name: "",
                allowsImage: false,
                values: [{ id: crypto.randomUUID(), value: "", imageId: null }],
              },
            ])
          }
        >
          <Plus size={18} /> Tambah variasi <span>({p.groups.length}/3)</span>
        </Button>
      )}
      {p.groups.length > 0 && (
        <section className="variation-review">
          <div>
            <h3>Kombinasi SKU</h3>
            <p aria-live="polite">
              {count > 50 ? "Lebih dari 50" : count} kombinasi akan dibuat.
              Harga dan stok lama dipertahankan untuk kombinasi yang sama.
            </p>
            {count > 50 && (
              <p role="alert" className="variation-error">
                Jumlah kombinasi melebihi batas maksimum 50 SKU. Kurangi
                beberapa opsi untuk melanjutkan.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={blocked || !count || count > 50}
            onClick={generate}
          >
            Buat {count > 50 ? "" : count} kombinasi
          </Button>
        </section>
      )}
      {(p.optionPhotos.length > 0 || p.canUndoPhotos) && (
        <details className="variation-media-library">
          <summary>Foto variasi tersimpan ({p.optionPhotos.length})</summary>
          <p>
            Melepas foto dari opsi tidak menghapus file. Penghapusan permanen
            harus dikonfirmasi; foto pesanan historis tetap dilindungi server.
          </p>
          <div className="variation-media-list">
            {p.optionPhotos.map((photo, pi) => {
              const used = p.groups.some((g) =>
                g.values.some((v) => v.imageId === photo.id),
              );
              return (
                <div key={photo.id}>
                  <Image
                    unoptimized
                    src={photo.url}
                    width={56}
                    height={56}
                    alt={photo.alt || `Foto tersimpan ${pi + 1}`}
                  />
                  <span>
                    Foto {pi + 1}
                    {used ? " · dipakai" : " · belum dipakai"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={blocked || used}
                    aria-label={`Hapus permanen foto tersimpan ${pi + 1}`}
                    onClick={() =>
                      setConfirmation({
                        title: "Hapus foto tersimpan?",
                        description:
                          "File akan dihapus setelah produk disimpan. Server menolak penghapusan foto yang dipakai riwayat pesanan. Perubahan lain tetap berada di editor.",
                        confirm: "Hapus foto",
                        run: () => p.onRemovePhoto(photo.id),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={blocked || !p.canUndoPhotos}
            onClick={p.onUndoPhotos}
          >
            Pulihkan penghapusan foto yang belum disimpan
          </Button>
        </details>
      )}
      <section className="variation-skus" aria-label="Harga dan stok SKU">
        <div className="variation-section-title">
          <h3>Harga &amp; stok</h3>
          <span>{p.rows.filter((r) => r.sku).length} / 50 SKU</span>
        </div>
        <p>
          Harga kosong mengikuti harga utama Rp
          {p.basePrice.toLocaleString("id-ID")}. Stok diubah hanya oleh operator
          berizin.
        </p>
        {p.rows.map((row, index) => (
          <details
            key={
              row.id || combinationKey(row.optionValueIds ?? []) || "default"
            }
            open
            className="variation-sku"
            onInvalidCapture={(e) => {
              e.currentTarget.open = true;
            }}
          >
            <summary>
              {(() => {
                const imageId = p.groups
                  .find((g) => g.allowsImage)
                  ?.values.find((v) =>
                    row.optionValueIds?.includes(v.id),
                  )?.imageId;
                const image = p.photos.find((photo) => photo.id === imageId);
                return image ? (
                  <Image
                    unoptimized
                    src={image.url}
                    alt=""
                    width={40}
                    height={40}
                    className="variation-sku-photo"
                  />
                ) : null;
              })()}
              <span>
                {optionLabel(p.groups, row.optionValueIds ?? []) || "SKU dasar"}
                <small>{row.sku || "Buat kombinasi atau isi SKU"}</small>
              </span>
              <span className="variation-pill">
                {row.protected ? "Dilindungi" : "SKU"}
              </span>
            </summary>
            <div className="variation-sku-fields">
              <div className="variation-field">
                <label htmlFor={`sku-${index}`}>
                  SKU <span aria-hidden="true">*</span>
                </label>
                <input
                  id={`sku-${index}`}
                  aria-label={`SKU kombinasi ${index + 1}`}
                  required
                  maxLength={80}
                  value={row.sku}
                  disabled={blocked}
                  onChange={(e) => rowChange(index, { sku: e.target.value })}
                />
              </div>
              <div className="variation-field">
                <label htmlFor={`sku-price-${index}`}>Harga (Rp)</label>
                <input
                  id={`sku-price-${index}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  max={2147483647}
                  value={row.price ?? ""}
                  placeholder="Ikuti harga utama"
                  disabled={blocked}
                  onChange={(e) =>
                    rowChange(index, {
                      price: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="variation-field">
                <label htmlFor={`sku-sale-${index}`}>Harga diskon (Rp)</label>
                <input
                  id={`sku-sale-${index}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  max={(row.price ?? p.basePrice) - 1}
                  value={row.salePrice ?? ""}
                  placeholder="Opsional"
                  disabled={blocked}
                  onChange={(e) =>
                    rowChange(index, {
                      salePrice: e.target.value ? Number(e.target.value) : null,
                      ...(e.target.value && row.price == null
                        ? { price: p.basePrice }
                        : {}),
                    })
                  }
                />
              </div>
              {row.onHand !== undefined && (
                <div className="variation-field">
                  <label htmlFor={`sku-stock-${index}`}>Stok fisik</label>
                  <input
                    id={`sku-stock-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={row.reserved ?? 0}
                    step={1}
                    max={2147483647}
                    value={row.onHand}
                    disabled={blocked || !p.canStock}
                    onChange={(e) =>
                      rowChange(index, { onHand: Number(e.target.value) })
                    }
                  />
                  <small>
                    {row.reserved ?? 0} direservasi ·{" "}
                    {Math.max(0, row.onHand - (row.reserved ?? 0))} tersedia
                  </small>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                className="variation-remove-sku"
                disabled={blocked || p.rows.length <= 1 || row.protected}
                onClick={() =>
                  setConfirmation({
                    title: "Hapus SKU?",
                    description:
                      "Kombinasi ini tidak lagi tersedia untuk pembelian. Server tetap memeriksa stok dan referensi sebelum menghapus.",
                    confirm: "Hapus SKU",
                    run: () =>
                      change(
                        p.groups,
                        p.rows.filter((_, i) => i !== index),
                      ),
                  })
                }
              >
                <Trash2 size={16} /> Hapus SKU
              </Button>
            </div>
          </details>
        ))}
      </section>
      <Dialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="variation-overlay" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              if (focusAfterConfirm.current) {
                event.preventDefault();
                focusAfterConfirm.current = false;
                requestAnimationFrame(() =>
                  root.current
                    ?.querySelector<HTMLElement>(
                      "input:not(:disabled),button:not(:disabled)",
                    )
                    ?.focus(),
                );
              }
            }}
            className="variation-confirm"
            aria-describedby="variation-confirm-description"
          >
            <Dialog.Title>{confirmation?.title}</Dialog.Title>
            <Dialog.Description id="variation-confirm-description">
              {confirmation?.description}
            </Dialog.Description>
            <div className="variation-confirm-actions">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" autoFocus>
                  Batal
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                onClick={() => {
                  const run = confirmation?.run;
                  focusAfterConfirm.current = true;
                  setConfirmation(null);
                  run?.();
                }}
              >
                {confirmation?.confirm}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
