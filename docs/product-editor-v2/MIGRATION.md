# Migration readiness — belum diotorisasi untuk Production

Migration: `20261021093000_product_editor_staged_media_shipping`.

DDL awal dihasilkan memakai Prisma 5.22 `migrate diff`, kemudian direview dan ditambahkan transaction boundary, `lock_timeout=5s`, `statement_timeout=60s`, CHECK dan RLS. Historis tidak diedit. Migration sebelas setelah dua migration custom variations/direct checkout yang sudah ada di main; operator wajib memeriksa ledger aktual, bukan mengasumsikan jumlah Production.

Additive: empat nullable integer pada Product, tabel StagedProductMedia dan ProductEditorSave beserta indeks. Tidak ada DML terhadap data pelanggan, default berat, DROP atau destructive ALTER. Role aplikasi harus trusted server dengan CRUD yang tidak terblokir RLS; tidak ada public policies. Tidak ada kebutuhan secret baru; existing private product-images bucket dan service role tetap diperlukan. Jangan membuka bucket/public policies untuk menyiasati akses.

## Urutan release mendatang

1. Review/approval source dan migration, database identity serta role, checksum seluruh ledger, backup/recovery sesuai keputusan pemilik.
2. Kendalikan automatic deployment sebelum merge agar kode baru tidak membaca schema lama.
3. Pada maintenance window yang disetujui, evaluasi long transaction/locks pada Product. ALTER TABLE membutuhkan lock singkat; bounds menghentikan migrasi jika tidak aman. Jangan terminate sesi atau melemahkan timeout.
4. Gunakan operator direct connection dan Prisma resmi `npm run prisma:deploy`; pastikan hanya migration yang direview pending. Tidak memakai `db push`, SQL Editor atau menulis ledger manual.
5. Verifikasi ledger/checksum, empat kolom nullable, dua tabel/RLS/CRUD, CHECK, indeks valid; jalankan `npm run release:preflight` read-only.
6. Deploy source yang disetujui, verifikasi upload create/edit, finalize, pricing dan ongkir manual dengan dummy yang disetujui.

Rollback schema-only ke baseline `b2d1819` hanya kompatibel **sebelum ada staged media yang difinalisasi**. Sesudah fitur dipakai, reader pada baseline lama menolak path permanen `product-images/staged-<imageId>/<imageId>.<ext>`, walaupun kolom/tabel additive tetap kompatibel. Karena itu jangan langsung mempromosikan deployment baseline setelah aktivasi: foto baru dapat menjadi 404.

Strategi recovery setelah aktivasi adalah roll-forward memakai source kandidat ini atau perbaikan yang mempertahankan reader path baru, session revocation, receipt dan schema. Jika rollback aplikasi diperlukan, siapkan dan uji kandidat rollback-compatible dengan reader staged-prefix dan seluruh kontrol sesi sebelum release. Pertahankan closed maintenance bila integritas belum terbukti; jangan menghapus file, kolom atau metadata finalized sebagai rollback. Tidak ada kandidat rollback lama yang otomatis disetujui oleh dokumen ini. Bila migration gagal, transaksi DDL rollback; periksa state/ledger dan gunakan documented official Prisma resolve hanya setelah membuktikan rollback, lalu retry dengan persetujuan yang sesuai. Tidak menjanjikan rollback data tanpa backup.

## Bukti disposable

Fresh install, upgrade dari sepuluh migration, idempotent deploy retry, lock contention, tidak adanya partial columns/tables setelah timeout, dan official resolve/retry diuji pada database unik lokal. Existing Product dan shippingReturn dipertahankan; berat/dimensi lama tetap null. Tidak ada operasi Production.
