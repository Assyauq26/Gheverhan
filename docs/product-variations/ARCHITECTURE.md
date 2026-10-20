# Arsitektur variasi kustom

## Scope dan kompatibilitas

Branch `feat/custom-variations-lumen-ux` bertumpu pada PR #75 (`d685813d02e457e5ccc182a145598c3b139b5559`). PR ini ditargetkan ke branch #75, bukan `main`, selama dependency belum merged. Tidak mengubah auth, payment approval, voucher, shipping, atau rumus finansial checkout.

Model lama `ProductVariant.color/size` dipertahankan. `Product.optionsEnabled=false` adalah gerbang per produk; produk lama tetap memakai sumber data legacy. Pembacaan editor menurunkan grup virtual deterministik dari kolom legacy aktual, sehingga writer lama selama compatibility window tidak menyebabkan pembacaan relasi backfill yang basi. Penyimpanan legacy memanggil backfill lagi. Konversi eksplisit ke mode kustom harus mempertahankan pilihan SKU lama; produk dengan data ambigu/tidak lengkap perlu direkonsiliasi, bukan otomatis dipetakan ke SKU lain.

## Model dan invariants

- `ProductOptionGroup`: ID stabil, product, nama/normalisasi, urutan, satu `allowsImage` per produk.
- `ProductOptionValue`: ID stabil, composite FK ke group/product dan image/product. Foto opsional, hanya pada grup yang mengizinkan foto.
- `ProductVariantOptionValue`: satu pilihan per group/variant, composite FK menjaga product/group/value yang sama.
- `ProductVariant.combinationKey`: ID nilai diurutkan dan dipisahkan `|`, unique per product. Format ID melarang separator tersebut. Rename/reorder tidak mengubah key.
- `ProductImage.isVariation`: foto opsi terpisah dari galeri utama. Batas 10 foto galeri, 50 foto opsi, 4 MB/file; JPEG/PNG/WebP dan signature diperiksa server.

Batas server/UI: tiga grup, 50 nilai/grup, maksimal 50 hasil Cartesian dan 50 SKU. Perhitungan berhenti pada sentinel 51 sebelum materialisasi. Kombinasi sparse boleh; storefront wajib resolve seluruh ID secara eksak dan menolak kombinasi hilang. Database juga membatasi grup/nilai/SKU aktual; batas hasil Cartesian ditegakkan validator server.

Prisma merepresentasikan FK/composite unique. Partial unique index PostgreSQL menjaga satu grup bergambar. CHECK menjaga normalisasi dan bentuk ID; deferred constraint triggers menjaga kelengkapan pilihan dan combination key saat commit. RLS aktif tanpa public policies, bukan akses publik. Fungsi backfill `SECURITY INVOKER`, akses PUBLIC dicabut. Role aplikasi harus dipercaya dan diverifikasi; preflight menolak role yang tak memiliki CRUD/EXECUTE atau tidak dapat melintasi RLS secara sah.

## Penulisan dan identitas

Service tetap memeriksa RBAC, `updatedAt`, serializable transaction dan retry terbatas. ID group/value/image/SKU dari product lain ditolak. Retained SKU tidak boleh dipindahkan ke kombinasi lain. Penghapusan SKU ditolak bila memiliki stok, reservasi, cart, order, atau movement. Harga/stok untuk kombinasi yang tidak berubah dipertahankan, termasuk edit yang belum disimpan ketika generator dijalankan lagi. Perubahan stok tetap memerlukan permission inventory.

Grup/nilai/variant, inventory dan audit ditulis atomik. Partial unique dan CAS menjaga request bersamaan; UI bukan sumber otoritas keamanan.

## Foto dan kegagalan jaringan

Draft-first: draft minimal disimpan sebelum upload, lalu editor mempertahankan input variasi yang belum disimpan. Upload memakai endpoint existing dengan purpose `option`, RBAC, Origin, bounded multipart, signature, UUID storage path, ownership dan version check.

Transfer/nonaktif/unlink hanya melepaskan mapping. Objek tetap berada di pustaka foto produk. Penghapusan permanen perlu konfirmasi dan penyimpanan; server menolak foto yang dipakai snapshot pesanan. Penghapusan storage dilakukan setelah commit DB, dengan path yang diverifikasi. Kegagalan cleanup dilog dan perlu rekonsiliasi; tidak boleh menghapus referensi historis untuk membersihkan storage.

Jika server menyimpan upload tetapi respons hilang, client membaca ulang snapshot melalui action read-only. Versi hanya diterima bila seluruh metadata produk/galeri tetap identik, tepat satu foto opsi bertambah, dan hash SHA-256 bytes sama dengan file lokal. Edit operator lain atau keadaan ambigu menghasilkan konflik terkontrol; tidak ada retry write buta.

## Storefront dan histori

Selector grup dinamis mengirim `ProductVariant.id` asli ke cart. Gallery mengikuti satu grup foto; opsi tanpa foto kembali ke galeri biasa. Harga tampil memakai perhitungan effective price existing. Cart memakai label seluruh grup dan foto pilihan; order tetap menyimpan snapshot label/foto sehingga rename selanjutnya tidak mengubah histori. Produk archived tetap tidak dijual dan media historis tetap melalui otorisasi existing.

## Presentasi

`variation-domain.ts` tidak bergantung React/DB; `variation-persistence.ts` memisahkan operasi relasi dari service. `CustomVariationEditor` memakai ID stabil, kontrol up/down keyboard/touch, dialog Radix existing, progress/retry upload, protected SKU, feedback inline dan satu sticky save. Lumen digunakan sebagai kontrak/pola dengan equivalent React 18, bukan dependency baru; alasan kompatibilitas di `UX_AUDIT.md`.
