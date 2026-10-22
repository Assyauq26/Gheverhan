# Preview isolation audit

Review source 9e3d87f, 22 Oktober 2026. **BLOCKED untuk bukti isolasi Production.**

Preview metadata sekarang mencantumkan GHEVERHAN_SHARED_DEV_DATABASE=true dan JWT_SECRET; DATABASE_URL/DIRECT_URL tidak tercantum. Ini bukan bukti semua deployment Preview lama kehilangan credential. Konfigurasi saat ini tidak mengubah snapshot deployment lama.

src/lib/prisma.ts memanggil assertPreviewDatabaseIsolation sebelum membuat client. preview-db-guard.ts menolak DSN missing/malformed/unapproved dan membutuhkan opt-in literal true serta dua DSN project dummy yang disetujui. Namun guard secara sengaja mengizinkan project bztprltkevacidcpjaam saat opt-in dan DSN cocok; **bukan database terpisah**. Komentar prisma lama tentang distinct preview project tidak mencerminkan kontrak guard aktual. Unit preview-db-guard.test.ts membuktikan allow shared dummy, deny invalid target/missing flag/DSN, bukan zero-writer isolation.

scripts/assert-safe-db-operation.mjs menolak migration/seed/bootstrap via npm scripts pada Preview. Itu tidak memblokir runtime mutation atau arbitrary Prisma CLI. Cron cleanup khusus menolak VERCEL_ENV preview sebelum DB query; cron expire-orders dan writer lain tetap perlu verifikasi deployment/session/secret/network masing-masing. Realm auth/JWT Preview terpisah tidak sama dengan database isolation.

## Tindakan operator, belum dijalankan

1. Inventaris seluruh deployment Preview/legacy, protection, writer, snapshot effective env dan webhook/cron, bukan hanya halaman pertama deployment list.
2. Review penonaktifan shared DB opt-in pada Preview dan seluruh secret/binding DB bersama melalui approval konfigurasi tersendiri. Jangan menyalin JWT/key Production ke Preview.
3. Pastikan deployment lama yang masih mempunyai credential/writer tidak bisa dipanggil, sesuai mekanisme resmi provider dan approval. Menghapus env project saat ini saja tidak mencabut akses deployment lama.
4. Buktikan request mutation Preview yang berizin dummy ditolak sebelum DB target; gunakan lingkungan disposable dahulu. Tidak menguji mutation Production pada task ini.

Tidak membuat staging/project baru. Tidak mengubah perilaku dummy shared yang pernah disetujui secara diam-diam. Bila owner memilih larangan shared mutlak, perubahan guard perlu review/regression dan kontrol deployment lama; perubahan source baru saja tidak mencabut credential lama.


## Audit inventory dan kemampuan writer — snapshot runtime preflight

Pembacaan API resmi CLI dengan explicit project ID/scope, filter Preview dan pagination selesai menginventaris 207 deployment; 142 READY dan 65 status lain. Target metadata null/non-Production; current Production dpl_621bV44pjJVzHJ5NuCQNTFU4JEb1 tidak termasuk hasil. Ini **inventaris historis**, bukan 142 writer Production yang terbukti.

| Kategori | Bukti |
| --- | --- |
| Historical READY | 142 metadata entries |
| URL yang benar-benar menerima traffic sekarang | Belum diuji per URL; READY bukan HTTP reachability/protection proof |
| Authorized application traffic | Belum terbukti; platform protection/auth harus diperiksa terpisah |
| Effective deployed env snapshot | Belum tersedia; current project env list tidak cukup |
| DB connection capability | Belum terbukti sebagai role Preview |
| DB write capability | Belum terbukti; gunakan individual privileges + RLS metadata, bukan mutation probe |

Jangan menyimpulkan tidak ada writer dari absent current DATABASE_URL, atau menyimpulkan semua 142 dapat menulis dari flag shared. Operator perlu menghubungkan setiap deployment yang masih bisa dilayani dengan snapshot/binding dan role resminya. Tidak mengakses customer rows, tidak bypass protection, tidak menggunakan credential Production untuk meniru role Preview. Paket approval isolasi: hapus shared opt-in **Preview only**, review DB/storage/JWT bindings, kendalikan semua legacy writers lewat fitur resmi provider, buktikan fail-closed tanpa write probe. Source guard baru saja tidak mencabut deployment lama. Tidak menghapus deployment/credential atau mengubah env pada task ini.
