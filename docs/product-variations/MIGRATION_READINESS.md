# Kesiapan migrasi dan release

**Status: tervalidasi pada PostgreSQL disposable lokal; belum disetujui atau diterapkan ke Production. Jangan merge/deploy sebelum schema siap.**

Migration: `20261020070000_custom_product_variations`.
Prisma 5.22.0, Node.js 22, PostgreSQL 17 lokal. SQL awal dibuat menggunakan Prisma CLI resmi `migrate diff`; `migrate dev --create-only` menolak environment noninteractive. Partial index, CHECK, RLS, fungsi backfill dan deferred triggers ditambahkan sebagai SQL yang direview. Tidak memakai `db push` atau mengedit `_prisma_migrations`.

## Sebelum operator meminta persetujuan

1. Integrasikan ancestry PR #75 dan historical migrations aktual di `main`. Branch ini berisi tujuh migration historis ditambah migration variasi; migration index identitas di PR #74 merupakan dependency terpisah. Jika sudah diterapkan/merged, source release harus memuat union ledger tersebut sebelum `migrate deploy`. Jangan menyimpulkan jumlah Production dari jumlah direktori branch ini.
2. Verifikasi target database, role efektif, direct connection/SSL/pooler melalui kanal operator aman; jangan mencetak URL/secret. Tidak ada pemeriksaan database Production pada tugas ini.
3. Jalankan Prisma `migrate status`, cocokkan checksum semua historical migrations, pastikan hanya migration yang disetujui pending dan tak ada failed/incomplete. Jangan overwrite checksum atau manual ledger.
4. Periksa metadata/duplikasi legacy: canonical color/size, pasangan ganda, nilai >80 karakter, jumlah SKU, kombinasi tidak lengkap. Migrasi tidak mengaktifkan mode kustom; konversi produk ambigu tetap ditolak sampai direkonsiliasi dengan keputusan operator.
5. Verifikasi role aplikasi memiliki CRUD pada tiga tabel baru dan EXECUTE fungsi backfill; RLS memerlukan trusted server role. Jangan menambahkan public policies sebagai jalan pintas. DDL role dan app role dapat berbeda; uji keduanya.
6. Tinjau ukuran tabel, transaksi panjang, lock dan writer lama/Preview; pilih maintenance window dan recovery plan. Minta persetujuan spesifik database/deployment. Tidak ada backup pelanggan diambil oleh pekerjaan ini; keputusan backup harus dikonfirmasi untuk release ini, bukan dianggap otomatis dari sprint lain.

## Eksekusi setelah persetujuan terpisah

- Source/lockfile dibekukan, gunakan dependency pinned dan Prisma CLI resmi dari `frontend`.
- Pastikan `DIRECT_URL` diverifikasi, `npx prisma migrate status`, lalu `npx prisma migrate deploy` hanya jika daftar pending tepat sesuai persetujuan.
- Satu transaksi: `lock_timeout=5s`, `statement_timeout=60s`. ALTER/default, index dan backfill dapat mengunci tabel. Batas pendek memilih gagal tertutup daripada menunggu tanpa batas; jangan menghapus timeout atau mematikan sesi Production.
- Verifikasi ledger/checksum, kolom nullable/legacy, tiga tabel, partial unique, lima FK dan lima deferred trigger, normalisasi, RLS/grants, snapshot jumlah/ID/SKU/inventory/reservation/cart/order. Jalankan `npm run release:preflight` dengan identitas dan konfigurasi yang sah.
- Database-first. Deploy source kompatibel hanya setelah schema, grants dan preflight PASS. Jangan mengaktifkan custom editor dari source ini terhadap schema lama. Existing products tetap `optionsEnabled=false` sampai disimpan sebagai kustom secara eksplisit.

## Recovery

Drill lokal membuktikan fresh install, upgrade tujuh migration, backfill berulang, lock timeout, dan kegagalan DDL setelah ALTER. Kegagalan dalam BEGIN/COMMIT membatalkan DDL/data; Prisma dapat menyisakan ledger failed. Periksa keadaan schema/ledger sebelum tindakan. `prisma migrate resolve --rolled-back <name>` hanya setelah rollback benar-benar terbukti, kemudian retry setelah penyebab diperbaiki. Jangan resolve applied tanpa DDL yang terbukti selesai, jangan edit ledger langsung.

Setelah migration sukses, utamakan roll-forward. Jangan drop tabel/kolom/index atau menghapus inventory/history untuk rollback. Source lama boleh kompatibel hanya selama semua produk masih legacy dan writer terkendali; setelah produk kustom diaktifkan, rollback harus ke source yang memahami opsi kustom, session controls, dan schema ini. Bila cleanup Storage gagal, rekonsiliasi objek yatim secara terpisah tanpa menghapus foto snapshot order. Restore Production memerlukan izin dan prosedur backup/recovery tersendiri.

Checksum migration dicatat di `TEST_EVIDENCE.md` dan harus dihitung kembali dari file release yang dibekukan.
