# Bukti verifikasi variasi kustom

Pengujian hanya memakai Node.js 22, PostgreSQL 17 disposable loopback, Chromium dan Storage/Resend double lokal. Tidak memakai akun, credential atau data pelanggan Production. Tidak ada deployment atau migration Production.

## Gate lokal

| Gate | Hasil terukur |
| --- | --- |
| `npm run test:ci` pada container offline, read-only, tanpa credential | 273 unit, 25 containment, 9 mitigation PASS |
| `node --import tsx --test --test-concurrency=1 tests/integration/{database-entrypoints,auth-security,release-preflight,registration-migration,custom-variation-migration,custom-variations,cart-concurrency,product-lifecycle,transaction-correctness,order-refund-shipping,registration-otp}.test.ts` | 137 PASS, 0 fail/skip |
| `npx prisma validate` / `prisma generate` | PASS |
| `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference detected; custom SQL objects diperiksa terpisah oleh integration/preflight |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, tanpa warning ESLint |
| `npm run build` | PASS, Next.js 15.5.28 production build |
| `npm run test:e2e:products` | Alur legacy 18 checkpoint + skenario kustom; hasil final dan artifact dipublikasikan di PR/CI |
| Auth, operations/payment, hydration, navigation 10×44 | Wajib pada CI HEAD final; jangan mengganti hasil ini dengan SHA lama |

Angka PostgreSQL memasukkan parent suite Node test runner. Tidak mengklaim jumlah child tests sebagai suite independen. Full PostgreSQL dijalankan serial karena beberapa drill memodifikasi objek public di database dummy.

Migration `20261020070000_custom_product_variations`, SHA-256:
`499d4c6259b90c2342c5dc1a2baebcb04e72751c8a9f3111414ad7db492e4735`.

## Root cause dan perbaikan yang diuji

- Payload API grup kosong dapat menghilangkan mapping SKU kustom sambil mempertahankan ID-nya: service menolak downgrade kosong dan validator menolak flag kustom tanpa grup; regression membuktikan stok dan selection tetap utuh.
- Storefront lama dapat memilih SKU pertama ketika kombinasi tidak cocok: diganti exact selection seluruh ID, termasuk legacy tanpa fallback.
- Roundtrip GET produk legacy menyertakan virtual groups: flag `optionsEnabled=false` kini tetap otoritatif, sehingga consumer lama tidak otomatis mengonversi SKU.
- Respons upload hilang setelah server commit dapat meninggalkan version stale: pemulihan strict snapshot + file digest, bukan retry write atau menimpa perubahan operator lain.
- Mapping foto yang dilepas tidak boleh menghapus objek: pustaka retained, konfirmasi explicit delete, dan proteksi order snapshot server.
- Aplikasi Prisma tidak dapat deserialize PostgreSQL void dari backfill: pemanggilan service memakai cast `::text`.
- Drill baru memerlukan grants tiga tabel/fungsi tambahan dan preflight harus memeriksa partial index/deferred triggers, bukan hanya keberadaan kolom.

Kegagalan pengembangan tidak disembunyikan: fixture enum stock movement diperbaiki menjadi `ADJUSTMENT`; type output `spawnSync` diperjelas; selector alert di browser dipersempit ke region aplikasi karena Next route announcer juga memiliki role alert. Tombol pemulihan foto panjang ditemukan overflow saat library terbuka dan diperbaiki dengan wrapping. Fixture storefront memakai kategori unik run untuk menghindari rekomendasi fixture lama yang storage mock-nya telah berakhir; assertion console error tetap aktif. CI juga menemukan import CSS komponen memicu Tailwind/object-hash yang mencoba membaca `__proto__` pada runner hardened. CSS dipindahkan ke admin layout (entry stylesheet aplikasi), sementara `--disable-proto=throw` dipertahankan. Runner lokal disamakan dengan konfigurasi PostCSS/Tailwind CI. Tidak ada test/assertion bisnis yang dihapus atau dilonggarkan.

## Bukti browser dan visual

Test utama mempertahankan seluruh flow legacy: draft, kategori, varian, upload, publish, marketing, cart empat viewport, checkout quote conflict, archive dan historical media. Tambahan kustom mencakup draft-first, upload/progress, lost-response recovery, RBAC/Origin/signature/4 MB, enam SKU, rename/reorder, selected SKU/cart/order snapshot/reservation, protected deletion, transfer foto, serta sparse combination.

Screenshot aktual dihasilkan sebagai `product-custom-*.png`. Workflow mengunggahnya dalam artifact `navigation-diagnostics-<run>-<attempt>` (retention tujuh hari). Link run/artifact HEAD final dicatat di deskripsi/komentar PR sesudah run selesai.

Screenshot yang telah diperiksa langsung sebelum commit UI: image preview mobile, conflict dialog mobile, SKU grid desktop dan storefront Hijau. Sebelum: legacy editor pada mode kompatibilitas tetap tersedia dan diuji; tidak mengklaim screenshot tersebut merupakan checkout build PR #75 yang belum diubah. Referensi TikTok spesifik tidak tersedia; tidak ada persentase fidelity.

Visual yang diperiksa: hierarki grup/nilai, tombol dan switch sentuh, dialog focus trap, foto pilihan, sticky save di atas bottom navigation, grid desktop. Ukuran 360/390/768/1024/1360 serta enlarged text diperiksa browser. Chromium desktop tidak meniru IME Android/iOS secara fisik; uji perangkat nyata dan sign-off reviewer tetap dianjurkan. Aplikasi saat ini memakai theme terang; tidak menambahkan theme mode baru.

## Batas dan status release

Lumen React package tidak dipasang karena kontrak peer React >=19 bertentangan dengan React 18.3.1. Pola Lumen dan semantic tokens diadaptasi ke primitive existing; tidak melakukan dependency upgrade.

Source dapat direview setelah CI final selesai. Review manusia/visual, integrasi dependency PR #75, rekonsiliasi historical migrations PR #74 bila relevan, pemeriksaan Production identity/role/locks, persetujuan migration, deployment dan smoke test tetap terpisah. Tidak menyatakan Production ready berdasarkan test lokal.
