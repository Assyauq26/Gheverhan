# Recovery reader — kandidat dan drill disposable

## Kandidat yang diperbolehkan

Kandidat recovery ialah source final PR #87 (SHA tepat ada pada PR/CI artifact) dengan schema additive tetap ada, reader staged-prefix, session revocation, receipt/idempotency dan proteksi historical SKU/image. Itu kandidat **roll-forward**, bukan izin deployment atau janji keberhasilan pada konfigurasi Production yang belum diverifikasi.

Reader baseline `b2d1819` hanya menerima path `.../product-images/<productId>/<imageId>.<extension>`. Reader kandidat juga menerima `.../product-images/staged-<imageId>/<imageId>.<extension>`. Keduanya tetap mensyaratkan URL lokal API, image ID, JPG/PNG/WebP, path karakter terbatas; kandidat tidak menerima path arbitrary. Route permanen tetap memeriksa ProductImage, published status atau staff/cart/order ownership. Format byte tidak diubah, tidak ada copy/re-encode remote ketika finalisasi.

## Drill yang dijalankan

`frontend/tests/integration/product-editor-v2.test.ts` subtest **roll-forward recovery reads legacy and finalized staged media from a fresh process without rewriting data**:

1. Guard localhost + database khusus `gheverhan_sprint1_test` + GHEVERHAN_ISOLATED_TESTS=1; mock Storage lokal, Node 22.
2. Buat dummy product, unggah satu foto lewat jalur legacy lalu satu lewat staging dan finalize melalui update resmi.
3. Simpan snapshot Product/ProductImage/ProductVariant/StagedProductMedia.
4. Jalankan proses Node baru dengan reader kandidat, membaca dua foto dari Storage mock dan membandingkan SHA-256 bytes; ID/path salah ditolak 404.
5. Proses selesai; snapshot database identik. Cancel dan cleanup sesudahnya tetap tidak menghapus finalized media.

Drill lokal **12/12 pemeriksaan suite PASS** termasuk parent; CI mengulang pada HEAD final. Tes browser existing melengkapi akses staff/anonymous/history dan order snapshot, bukan dipalsukan oleh proses reader yang melewati route. Drill tidak mencakup pemulihan dump Production atau jaminan durability Supabase; tidak mengambil backup pelanggan.

## Prosedur insiden setelah aktivasi mendatang

1. Jika integritas belum terbukti, kendalikan traffic/writer lewat profil maintenance tertutup yang disetujui. Jangan promote deployment baseline lama.
2. Catat source/build, migration ledger/checksum dan error tanpa credential/customer bytes. Bedakan schema, permission/private bucket, provider timeout atau aplikasi.
3. Pertahankan ProductImage, StagedProductMedia yang finalized, ProductEditorSave, stok, order history dan file. Jangan reset/drop, menghapus metadata, atau menulis ledger manual.
4. Siapkan source roll-forward berbasis kandidat di atas; uji ulang reader lama+staged, ownership/history, idempotency, cart/checkout/payment dan schema terhadap disposable terlebih dahulu. Jika perlu rollback fitur editor, bawa reader baru dan kontrol session/receipt ke kandidat rollback-compatible lalu uji; tidak memakai baseline begitu saja.
5. Setelah approval spesifik dan preflight target PASS, deploy kandidat kompatibel. Probe terbatas foto legacy/staged/historical, auth, save dan checkout menggunakan fixture yang disetujui; monitor error/latency/cleanup. Hindari transaksi finansial tanpa rekonsiliasi.
6. Buka writer hanya setelah integritas terbukti. Jika recovery belum dapat dibuktikan, tetap closed maintenance dan eskalasi; tidak menghapus data sebagai solusi cepat.

DDL timeout: ikuti MIGRATION.md. Fresh/upgrade/retry/lock failure rollback diuji di disposable; official Prisma resolve hanya setelah state rollback dibuktikan dan otorisasi yang sesuai. Snapshot data sebelum migrasi tidak dapat dijamin tanpa backup yang memadai.
