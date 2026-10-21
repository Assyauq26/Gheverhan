# Editor produk V2

## Kontrak dan kompatibilitas

Satu `ProductEditor` digunakan route create/edit. Snapshot canonical membandingkan isi form dengan hasil server, mengabaikan URL dan metadata inventory read-only, mempertahankan urutan gambar/opsi. Save mengikuti document flow, disabled bila clean; kegagalan tidak mengganti input. Controlled links dan `beforeunload` mempertahankan guard; universal interception native browser Back tidak diklaim.

SKU baru, termasuk kombinasi baru pada editor legacy, memakai inisial nama dan semua nilai opsi, uppercase ASCII/NFKD, maksimal 80 karakter. Collision lokal menggunakan suffix deterministik; generation click memeriksa collision database melalui action berizin dengan maksimum tiga putaran. Race setelah preview tetap dilindungi unique constraint dan HTTP 409. Re-generation mempertahankan row yang combination identity-nya sama, termasuk SKU manual dan existing.

Bulk memakai set stok absolut dan hanya field berisi. Selected rows tidak bergantung identitas setelah daftar berubah: selection di-reset. Perubahan local baru dipersist oleh Simpan. ExpectedOnHand, reserved checks, inventory permission, serializable transaction, movement, audit dan proteksi flash sale tetap server-authoritative. Stok berubah karena transaksi lain menghasilkan conflict, bukan overwrite diam-diam; operator reload/review/apply ulang.

## Staged media

- POST `/api/v1/admin/product-media`, authenticated admin dengan PRODUCT_READ dan CREATE atau UPDATE; exact Origin, multipart bounded, signature JPG/PNG/WebP, 4 MB.
- UUID idempotency ID + SHA-256 isi; binding actor dan SHA-256 cookie sesi yang telah divalidasi. Hash/token tidak dikirim ke client. Maksimum 60 outstanding/actor, gallery 10 dan option 50 saat save.
- Intent database durable dibuat sebelum Storage; immutable `x-upsert=false` object. Kegagalan/response hilang direkonsiliasi hanya bila hash bytes cocok. File yang sama dicoba ulang dengan ID yang sama.
- Path staged tetap immutable; finalization membuat ProductImage dengan URL permanen pada transaksi save. Tidak perlu remote copy yang tidak atomik. Public/authorized reads tetap melalui ProductImage dan status/riwayat product. Path staged bukan URL publik Supabase.
- Actor/session/purpose/TTL/ready diverifikasi ulang saat finalisasi. Row locking/CAS menyerialkan upload/cancel/finalize. Foto pending belum menjadi ProductImage atau hidden draft.
- ProductEditorSave menyimpan receipt hash payload dan hasil pada transaksi yang sama, mencegah double create atau replay data berbeda. Receipt tidak berisi seluruh form.
- TTL 24 jam. DELETE hanya membatalkan media belum difinalisasi. Cleanup maksimum lima expired objects paralel, menandai cancelled secara durable sebelum delete; kegagalan tetap tercatat untuk retry. Upload/cancel berikutnya memicu bounded cleanup. Tidak ada cron baru di Production; operator perlu memantau backlog dan menjadwalkan pemanggilan cleanup trusted-server bila volume memerlukan cleanup tanpa aktivitas editor.
- Finalized media tidak menjadi kandidat TTL cleanup, termasuk foto histori. Penghapusan permanen mengikuti pemeriksaan histori existing.
- Tab browser hanya menyimpan UUID foto sementara di sessionStorage, tanpa cookie, session hash atau data form. Reload mengambil metadata ulang melalui GET berizin yang menyaring actor/session/TTL. Galeri dan library foto dipulihkan; unsaved teks/mapping variasi tidak disimpan diam-diam. Sesi baru tidak bisa mengadopsi foto sesi lama. Storage browser opsional.
- Setelah kedaluwarsa/cancel, pengguna mengunggah kembali. Cancel/refresh tidak membuat produk tersembunyi. Storage I/O khusus staged media dibatasi timeout 15 detik; caller payment/gallery existing mempertahankan perilaku timeout sebelumnya; transaction upload maksimal 45 detik.

## Metadata pengiriman

`weightGrams`, `packageLengthMm`, `packageWidthMm`, `packageHeightMm` nullable. Batas 1.000.000 gram dan 100.000 mm per dimensi. UI cm menerima titik/koma satu angka desimal, integer mm internal, bukan floating-point. Semua dimensi null atau ketiganya positif. Empty bukan nol.

Draft boleh tanpa berat. Transisi menuju PUBLISHED memerlukan berat; produk yang sudah PUBLISHED dan legacy null tetap boleh diedit unrelated. Tidak ada default 1.000 gram yang menulis fakta palsu pada produk lama. `shippingReturn` tetap menyimpan kebijakan pengiriman/retur.

Checkout manual, harga ongkir dan total historis tidak berubah. `weightGram: 1000` pada adapter MVP tetap dipertahankan secara eksplisit. Integrasi J&T/KiriminAja kelak harus menjumlahkan berat dari data server × quantity dengan safe arithmetic, menentukan kebijakan missing metadata, packaging multi-item dan volumetrik. Metadata ini belum diaktifkan untuk billing kurir.
